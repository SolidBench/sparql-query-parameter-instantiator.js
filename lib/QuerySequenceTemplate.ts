import type * as RDF from '@rdfjs/types';
import { DataFactory, NamedNode } from 'rdf-data-factory';
import seedrandom = require('seedrandom');
import type {
  BlankTerm,
  IriTerm,
  Pattern,
  QuadTerm,
  SparqlQuery,
  Triple,
  Variable,
  VariableExpression,
  VariableTerm,
  SelectQuery,
  PropertyPath,
  Term,
  Expression,
  BgpPattern,
  OptionalPattern,
  UnionPattern} from 'sparqljs';
import {
  Wildcard,
 Generator } from 'sparqljs';
import type { FilterRefinementPattern, IEntityLogits, IQueryRefinementPattern, ITargetTriplePattern, ITargetTriplePatternTerm, OtherRefinementPattern } from './QuerySequenceTemplateProvider';
import { cloneDeep }  from 'lodash';
import { extractBgpPerOperator, extractExpressionPerOperator, extractTriplePatternsPerOperator, getVariablesInExpression } from './utils/refinementSequenceUtils';
/**
 * Data object for a query template.
 */
export class QuerySequenceTemplate {
  private readonly syntaxTree: SparqlQuery;
  private readonly variableMappings: Record<string, RDF.Term[]>;
  private readonly variableProbabilities: Record<string, Record<string, IEntityLogits[]>>;
  private readonly rng: seedrandom.PRNG;
  private readonly DF: DataFactory = new DataFactory();
  private readonly refinementPatterns: IQueryRefinementPattern[] | undefined;
  public readonly instantiationCounts: Record<string, Record<string, Record<string, number>>> = {};

  public constructor(
    syntaxTree: SparqlQuery,
    variableMappings: Record<string, RDF.Term[]>,
    variableProbabilities: Record<string, Record<string, IEntityLogits[]>>,
    rng: seedrandom.PRNG,
    refinementPatterns?: IQueryRefinementPattern[],
  ) {
    this.syntaxTree = syntaxTree;
    this.variableMappings = variableMappings;
    this.variableProbabilities = variableProbabilities;
    this.rng = rng;
    
    this.refinementPatterns = refinementPatterns?.map(pattern => {
      if (pattern.type !== 'FILTER'){
        pattern.target = pattern.target.map(triple => this.targetToTriple(triple))
      }
      return pattern
    })
  }

  /**
   * Instantiate this template for the given counter value.
   * This counter value is used to determine what variable value should be used.
   * @param counter The current counter value.
   */
  public instantiate(counter: number, instantiateRefinementPattern: boolean, user?: string): string[] {
    // Determine variables to instantiate with
    const variableMapping: Record<string, RDF.Term> = {};
    for (const variable of Object.keys(this.variableMappings)) {
      const values = this.variableMappings[variable];
      // When no probabilities and rng is given, we simply cycle through the provided
      // values to instantiate queries in the sequence.
      if (Object.keys(this.variableProbabilities).length === 0) {
        const instantiationIndex = counter % values.length;
        variableMapping[variable] = values[instantiationIndex];
      } else if (Object.keys(this.variableProbabilities).length > 0 && user) {
        const sampledValue: RDF.Term = this.sampleVariableTerm(variable, user);
        variableMapping[variable] = sampledValue;

        // Track instantiation counts for the variable and user
        this.updateCounter(user, variable, sampledValue.value);
      } else {
        throw new Error(
          `Either probabilities (${Object.keys(this.variableProbabilities).length > 0 ? 'defined' : 'undefined'}), ` +
          `or base user (${user ? 'defined' : 'undefined'}) are not given.`,
        );
      }
    }
    const instantiatedSyntaxTree = this.instantiateSyntaxTree(this.syntaxTree, variableMapping);
    // Create an array of SelectQueries that are all slight variations of the same template
    if (instantiateRefinementPattern) {
      if (!this.refinementPatterns) {
        throw new Error(`No refinement patterns available for instantiation`);
      }
      const instantiatedSyntaxTreesRefinement = this.createRefinementSequence(
        this.refinementPatterns,
        instantiatedSyntaxTree,
        4,
        variableMapping,
      );
      return instantiatedSyntaxTreesRefinement.map(tree => new Generator().stringify(tree));
    }
    // Instantiate syntax tree
    return [new Generator().stringify(instantiatedSyntaxTree)];
  }

  public instantiateSyntaxTree(syntaxTree: SparqlQuery, variableMapping: Record<string, RDF.Term>): SelectQuery {
    // Only allow SELECT queries
    if (syntaxTree.type !== 'query' || syntaxTree.queryType !== 'SELECT') {
      throw new Error(`Only instantiations of SELECT queries are supported`);
    }

    // Remove variables
    syntaxTree = { ...syntaxTree };
    if (!(syntaxTree.variables.length === 1 &&
      'termType' in syntaxTree.variables[0] &&
      syntaxTree.variables[0].termType === 'Wildcard')) {
      syntaxTree.variables = (<Variable[]> syntaxTree.variables)
        .filter((variable: VariableExpression | VariableTerm) => !('termType' in variable) ||
          variable.termType !== 'Variable' ||
          !(variable.value in variableMapping));
    }

    // Apply expressions in variables
    syntaxTree.variables = <any> syntaxTree.variables.map((variable) => {
      if ('expression' in variable) {
        variable.expression = this.instantiateExpression(variable.expression, variableMapping);
      }
      return variable;
    });

    // Handle where clause in a recursive manner
    syntaxTree.where = this.instantiatePatterns(syntaxTree.where!, variableMapping);

    // Handle GROUP BY
    if (syntaxTree.group) {
      syntaxTree.group = syntaxTree.group
        .map(group => ({ expression: this.instantiateExpression(group.expression, variableMapping) }));
    }

    return syntaxTree;
  }

  public instantiatePatterns(patterns: Pattern[], variableMapping: Record<string, RDF.Term>): Pattern[] {
    // eslint-disable-next-line array-callback-return
    return patterns.map((pattern) => {
      pattern = { ...pattern };
      switch (pattern.type) {
        case 'query':
          return this.instantiateSyntaxTree(pattern, variableMapping);
        case 'bgp':
        case 'graph':
          if ('triples' in pattern) {
            return {
              type: 'bgp',
              triples: pattern.triples.map(triple => this.instantiateTriple(triple, variableMapping)),
            };
          }
          return {
            type: 'graph',
            name: pattern.name,
            patterns: this.instantiatePatterns(pattern.patterns, variableMapping),
          };
        case 'union':
        case 'group':
        case 'optional':
        case 'minus':
        case 'service':
          return {
            ...pattern,
            patterns: this.instantiatePatterns(pattern.patterns, variableMapping),
          };
        case 'filter':
        case 'bind':
          return {
            ...pattern,
            expression: this.instantiateExpression(pattern.expression, variableMapping),
          };
        case 'values':
          return pattern;
      }
    });
  }

  public instantiateExpression(expression: Expression, variableMapping: Record<string, RDF.Term>): Expression {
    if ('type' in expression) {
      switch (expression.type) {
        case 'group':
        case 'graph':
          return <Expression> {
            ...expression,
            patterns: this.instantiatePatterns(expression.patterns, variableMapping),
          };
        case 'bgp':
          return <Expression> {
            ...expression,
            triples: expression.triples.map(triple => this.instantiateTriple(triple, variableMapping)),
          };
        case 'operation':
        case 'functionCall':
          return {
            ...expression,
            args: expression.args.map(arg => this.instantiateExpression(arg, variableMapping)),
          };
        case 'aggregate':
          return {
            ...expression,
            expression: this.instantiateExpression(expression.expression, variableMapping),
          };
      }
    } else {
      return <Expression> this.instantiateTerm(<Term> expression, variableMapping);
    }
  }

  public instantiateTriple(triple: Triple, variableMapping: Record<string, RDF.Term>): Triple {
    return {
      subject: <any> this.instantiateTerm(triple.subject, variableMapping),
      predicate: <any> this.instantiateTerm(triple.predicate, variableMapping),
      object: <any> this.instantiateTerm(triple.object, variableMapping),
    };
  }

  public instantiateTerm<T extends IriTerm | BlankTerm | VariableTerm | QuadTerm | PropertyPath | Term>(
    term: T,
    variableMapping: Record<string, RDF.Term>,
  ): T | RDF.Term {
    if ('termType' in term && (<RDF.Term> term).termType === 'Variable') {
      const variableName = (<VariableTerm> term).value;
      const variableValue = variableMapping[variableName];
      if (variableValue) {
        return variableValue;
      }
    }
    return term;
  }

  public createRefinementSequence(
    refinementPatterns: IQueryRefinementPattern[],
    query: SelectQuery,
    nSteps: number,
    variableMapping: Record<string, RDF.Term>,
  ): SelectQuery[] {
    const refinementState: IRefinementState = {
      stateFilter: this.initializeEmptyOperatorState(),
      stateQuery: this.initializeEmptyOperatorState(),
      stateOptional: this.initializeEmptyOperatorState(),
      stateUnion: this.initializeEmptyOperatorState(),
    };
    const refinementSequence: SelectQuery[] = [query];
    for (let i = 0; i < nSteps; i++) {
      query = cloneDeep(query);
      const operatorTriples: Record<string, Triple[][]> = extractTriplePatternsPerOperator(
        query.where!,
      );
      const operatorExpressions: Record<string, Expression[][]> = {};
      extractExpressionPerOperator(query.where!, operatorExpressions, 'filter');

      const validPatterns = this.findValidRefinementPatterns(
        operatorTriples,
        operatorExpressions,
        refinementPatterns,
        refinementState,
        variableMapping
      );
      const patternToApply = this.sampleRandom(validPatterns);
      const refinedQuery = this.applyRefinementPattern(
          patternToApply,
          query,
          variableMapping,
          refinementState
        );
      refinementSequence.push(refinedQuery);
      query = refinedQuery;
    }
    return refinementSequence;
  }

  public applyRefinementPattern(
    pattern: IQueryRefinementPattern,
    query: SelectQuery,
    variableMapping: Record<string, RDF.Term>,
    refinementState: IRefinementState,
  ): SelectQuery {
    if (pattern.location === undefined) {
      throw new Error(`Location for addition refinement pattern ${pattern.description} is not defined`);
    }
    const patternType = pattern.type;
    // Extract BGPs. We can probably use this as a function parameter and not use the Triple[][]
    // representation, but we'll have to change some tests (AGAIN).
    const operatorToBgp: Record<string, BgpPattern[]> = {};
    const operatorToExpression: Record<string, Expression[]> = {};
    extractBgpPerOperator(query.where!, operatorToBgp, 'query');
    extractExpressionPerOperator(query.where!, operatorToExpression, 'filter');
    const state = refinementState[typeToKeyMap[patternType]];

    if (pattern.operation === 'addition') {
      switch (patternType) {
        case 'OPTIONAL':
          const groupPatternOptional = operatorToBgp[patternType.toLowerCase()];
          let toRefineOptional: BgpPattern;
          if (!groupPatternOptional || groupPatternOptional.length === 0) {
            // If no optionals are present, add a new optional pattern
            const optionalBgp: BgpPattern = { type: 'bgp', triples: []};

            const optionalBlock: OptionalPattern = { type: 'optional', patterns: [ optionalBgp ]};
            query.where!.push(optionalBlock);

            toRefineOptional = <BgpPattern> optionalBlock.patterns[pattern.location];
          } else {
            toRefineOptional = operatorToBgp[patternType.toLowerCase()][pattern.location];
          }
          if (!toRefineOptional) {
            throw new Error(`BGP Doesn't exist at index ${pattern.location} 
              for optional operator with ${operatorToBgp[patternType]} BGPs`);
          }
          this.addTargetToBgp(
            toRefineOptional,
            pattern.target,
            query,
            variableMapping,
            state
          );
          break;

        case 'UNION':
          const groupPatternUnion = operatorToBgp[patternType.toLowerCase()];
          let toRefineUnion: BgpPattern;
          if (!groupPatternUnion || groupPatternUnion.length === 0) {
            // If no optionals are present, add a new optional pattern
            const leftUnion: BgpPattern = { type: 'bgp', triples: []};
            const rightUnion: BgpPattern = { type: 'bgp', triples: []};

            const unionBlock: UnionPattern = { type: 'union', patterns: [ leftUnion, rightUnion ]};
            query.where!.push(unionBlock);

            toRefineUnion = <BgpPattern> unionBlock.patterns[pattern.location];
          } else {
            toRefineUnion = operatorToBgp[patternType.toLowerCase()][pattern.location];
          }
          if (!toRefineUnion) {
            throw new Error(`BGP Doesn't exist at index ${pattern.location} 
              for union operator with ${operatorToBgp[patternType]} BGPs`);
          }

          this.addTargetToBgp(
            toRefineUnion,
            pattern.target,
            query,
            variableMapping,
            state
          );
          break;

        case 'FILTER':
          // Targets are instantiated and then evaluated
          let targetFilters: Expression[] = pattern.target.map(
            t => this.instantiateExpression(t, variableMapping)
          );

          // Add back a triple when no target is specified
          // const state = refinementState[typeToKeyMap[patternType]];
          if (targetFilters.length === 0) {
            targetFilters = [ this.sampleRandom(state.removedExp) ];
          }

          // The triple pattern is no longer a 'removed' pattern
          state.removedExp = state.removedExp.filter(
            exp => targetFilters.some(x=> !this.expressionEquals(exp, x))
          );

          // Add added filter to state and query
          targetFilters.forEach(filterExpr => {
            query.where!.push({type: 'filter', expression: filterExpr})
            state.addedExp.push(filterExpr);
          });
          break;

        case 'QUERY': {
          const bgpToRefine = operatorToBgp[patternType.toLowerCase()][pattern.location];
          if (!bgpToRefine) {
            throw new Error(`BGP Doesn't exist at index ${pattern.location} 
              for query bgp operator with ${operatorToBgp[patternType]} BGPs`);
          }

          let targetTriples: (ITargetTriplePattern | Triple)[] = pattern.target;

          // Add back a triple when no target is specified
          const state = refinementState[typeToKeyMap[patternType]];
          if (pattern.target.length === 0) {
            targetTriples = [ this.sampleRandom(state.removedTps) ];
          }

          // The triple patterns are no longer a removed pattern
          state.removedTps.filter(
            tp => !targetTriples.some(x=> this.tripleEquals(tp, this.targetToTriple(x)))
          );

          this.addTargetToBgp(
            bgpToRefine,
            targetTriples,
            query,
            variableMapping,
            state
          );
          break;
        }
      }
    } else if (pattern.operation === 'removal') {
      switch (patternType) {
        case 'FILTER':
          // filters to remove are instantiated versions of target
          let filtersToRemove = pattern.target.map(t => this.instantiateExpression(t, variableMapping));
          if (filtersToRemove.length === 0){
            // Randomly select a filter to remove
            filtersToRemove = [ this.sampleRandom(
              query.where!.filter(queryPattern => queryPattern.type === 'filter')
            ).expression];

          }
          state.removedExp.push(...filtersToRemove);
          query.where = query.where!.filter((queryPattern: Pattern) => {
            return queryPattern.type !== 'filter' || 
            !filtersToRemove.some(t => this.expressionEquals(queryPattern.expression, t))
          });
          break;
        case 'OPTIONAL':
        case 'UNION':
        case 'QUERY': {
          const bgpToRefine = operatorToBgp[patternType.toLowerCase()][pattern.location];
          if (!bgpToRefine) {
            throw new Error(`BGP Doesn't exist at index ${pattern.location} 
              for query bgp operator with ${operatorToBgp[patternType]} BGPs`);
          }
          let triplesToRemove = pattern.target.map(x => this.targetToTriple(x));
          if (triplesToRemove.length === 0) {
            triplesToRemove = [ this.sampleRandom(bgpToRefine.triples) ];
          }
          const removed = this.removeTargetFromBgp(bgpToRefine, triplesToRemove, variableMapping);

          // Update state of refinement sequence
          state.removedTps.push(...removed);
        }
      }
    } else {
      throw new Error(`Unknown operation type '${pattern.operation}' in refinement pattern ${pattern.description}`);
    }
    return query;
  }

  public findValidRefinementPatterns(
    operatorTriplePatterns: Record<string, Triple[][]>,
    operatorExpressions: Record<string, Expression[][]>,
    refinementPatterns: IQueryRefinementPattern[],
    refinementState: IRefinementState,
    variableMapping: Record<string, RDF.Term>,
  ): IQueryRefinementPattern[] {
    const operatorTriplePatternsFlattened = this.flattenOperators(operatorTriplePatterns);
    // const totalTriples = this.countFlattened(operatorTriplePatternsFlattened);

    const operatorExpressionsFlattened = this.flattenOperators(operatorExpressions);
    const totalExpressions = this.countFlattened(operatorExpressionsFlattened);

    const queryTriples = Object.values(operatorTriplePatterns).flat(2);
    const queryExpressions = Object.values(operatorExpressions).flat(2);
    const variablesInQuery = this.getAllVariables(queryTriples);

    return refinementPatterns.filter(pattern => {
      if (pattern.type === "FILTER") {
        return this.isValidFilterPattern(pattern, {
          queryExpressions,
          operatorExpressionsFlattened,
          refinementState,
          totalExpressions,
          variableMapping,
          variablesInQuery
        });
      } else {
        return this.isValidTriplePattern(pattern, {
          queryTriples,
          operatorTriplePatternsFlattened,
          refinementState,
          variableMapping
        });
      }
    });
  }

  private flattenOperators<T>(ops: Record<string, T[][]>): Record<string, T[]> {
    return Object.fromEntries(Object.entries(ops).map(([k, v]) => [k, v.flat()]));
  }

  private countFlattened<T>(ops: Record<string, T[]>): number {
    return Object.values(ops).reduce((sum, items) => sum + items.length, 0);
  }

  private isValidFilterPattern(
    pattern: FilterRefinementPattern,
    context: {
      queryExpressions: Expression[],
      operatorExpressionsFlattened: Record<string, Expression[]>,
      refinementState: IRefinementState,
      totalExpressions: number,
      variableMapping: Record<string, RDF.Term>,
      variablesInQuery: Set<string>
    }
  ): boolean {
    const patternType = pattern.type.toLowerCase();
    const targets = pattern.target.map(x => this.instantiateExpression(x, context.variableMapping));

    const alreadyPresent = targets.length > 0 && targets.every(t =>
      context.queryExpressions.some(q => this.expressionEquals(t, q))
    );

    // Duplicate expressions cannot be added
    if (alreadyPresent && pattern.operation === 'addition') return false;

    // Filter requires all variables in the filter to also be in the query body
    if (pattern.operation === 'addition') {
      const allVarsPresent = targets.every(expr => {
        const vars = getVariablesInExpression(expr);
        return vars.size > 0 && [...vars].every(v => context.variablesInQuery.has(v));
      });
      return allVarsPresent;
    }

    if (pattern.operation === 'removal') {
      if (targets.length === 0) {
        return context.operatorExpressionsFlattened[patternType]?.length > 1;
      }
      // if (context.totalExpressions - Math.max(targets.length, 1) <= 0) 
      //   return false;
      // Require all expressions in target to be present in query
      const opExps = context.operatorExpressionsFlattened[patternType];
      return opExps && targets.every(t => opExps.some(e => this.expressionEquals(t, e)));
    }
    // If not already present and we have a target we can always add the filter
    if (targets.length > 0) 
      return true;
    return context.refinementState[typeToKeyMap[pattern.type]].removedExp.length > 0;
  }

  private isValidTriplePattern(
    pattern: OtherRefinementPattern,
    context: {
      queryTriples: Triple[],
      operatorTriplePatternsFlattened: Record<string, Triple[]>,
      refinementState: IRefinementState,
      variableMapping: Record<string, RDF.Term>
    }
  ): boolean {
    const patternType = pattern.type.toLowerCase();
    const targets = pattern.target.map(t =>
      this.instantiateTriple(this.targetToTriple(t), context.variableMapping)
    );

    const alreadyPresent = targets.length > 0 && targets.every(t =>
      context.queryTriples.some(q => this.tripleEquals(q, t))
    );

    if (alreadyPresent && pattern.operation === 'addition') 
      return false;

    if (pattern.operation === 'removal') {
      // If we have no target the operator should have atleast 2 entries
      if (targets.length === 0) {
        return context.operatorTriplePatternsFlattened[patternType]?.length > 1;
      }

      // If we want to remove a triple pattern from the query it shouldn't leave an empty one
      if (patternType === 'query' 
        && context.operatorTriplePatternsFlattened[patternType].length - targets.length <= 0){
        return false;
      }
    
      const opTriples = context.operatorTriplePatternsFlattened[patternType];
      return opTriples && targets.every(t =>
        opTriples.some(tp => this.tripleEquals(this.targetToTriple(t), tp))
      );
    }

    if (targets.length > 0) return true;
    return context.refinementState[typeToKeyMap[pattern.type]].removedTps.length > 0;
  }

  private targetToTriple(target: ITargetTriplePattern | Triple): Triple {
    if (this.isRdfJsTriple(target))
      return target;
    if (target.subject.termType === 'literal'){
      throw new Error("Literal subject is invalid")
    }
    if (target.predicate.termType === 'literal'){
      throw new Error("Literal predicate is invalid");
    }
    return {
      subject: this.toTermNoLiteral(target.subject),
      predicate: this.toTermNoLiteral(target.predicate),
      object: this.toTerm(target.object),
    };
  }

  private isRDFTerm(term: any): term is Term {
    return term && typeof term.termType === 'string' && typeof term.value === 'string' 
    && 'equals' in term;
  }

  private isVariable(term: any): term is Variable {
    return this.isRDFTerm(term) && term.termType === 'Variable';
  }

  private getAllVariables(triples: Triple[]): Set<string> {
    const variables = new Set<string>();

    for (const triple of triples) {
      const { subject, predicate, object } = triple;

      for (const term of [subject, predicate, object]) {
        if (this.isVariable(term)) {
          variables.add(term.value);
        }
      }
    }
    return variables;
  }

  // Helper type guard
  private isRdfJsTriple(obj: any): obj is Triple {
    return obj &&
      typeof obj === 'object' &&
      obj.subject?.termType !== undefined &&
      obj.subject?.equals !== undefined &&
      obj.predicate?.termType !== undefined &&
      obj.predicate?.equals !== undefined &&
      obj.object?.termType !== undefined &&
      obj.object?.equals !== undefined;
  }

  private hasVariable(variables: Variable[] | [Wildcard], variable: VariableTerm): boolean {
    return variables.some((bgpVariable) => {
      'termType' in bgpVariable &&
      bgpVariable.termType === 'Variable' && variable.value === bgpVariable.value;
    });
  }

  private updateVariablesQuery(query: SelectQuery, instantiatedTriple: Triple): Variable[] | [Wildcard] {
    // If a wildcard is in the variables, we don't need to add the new variables to the triple,
    // as it will select all variables in the query.
    if (query.variables.some(term => term instanceof Wildcard)) {
      return query.variables;
    }

    const variablesInTriple = Object.values(instantiatedTriple).filter(
      (term: RDF.Term) => term.termType === 'Variable',
    );

    // In our case query variables will always be an array of RDF.Variable
    const vars = <RDF.Variable[]>query.variables;
    for (const variable of variablesInTriple) {
      if (!this.hasVariable(query.variables, variable)) {
        vars.push(variable);
      }
    }
    return vars;
  }

  private addTargetToBgp(
    bgp: BgpPattern,
    targets: (ITargetTriplePattern | Triple)[],
    query: SelectQuery,
    variableMapping: Record<string, RDF.Term>,
    state: IOperatorState
  ): void {
    for (const target of targets) {
      const targetTriple = this.targetToTriple(target);
      if (!this.hasTriple(bgp, targetTriple)) {
        const instantiatedTriple = this.instantiateTriple(
          targetTriple,
          variableMapping,
        );
        bgp.triples.push(instantiatedTriple);
        query.variables = this.updateVariablesQuery(query, instantiatedTriple);
        state.addedTps.push(instantiatedTriple);
      }
    }
  }

  private removeTargetFromBgp(
    bgp: BgpPattern,
    targets: Triple[],
    variableMapping: Record<string, RDF.Term>,
  ) {
    const removedTriplePatterns: Triple[] = [];

    for (const target of targets) {
      // Instantiate the triple to map variables to terms (as is also done in the query)
      const instantiatedTriple = this.instantiateTriple(target, variableMapping);
      // Check if the target triple pattern is already added
      if (this.hasTriple(bgp, instantiatedTriple)) {
        // If it is, remove the triple from the BGP
        bgp.triples = bgp.triples.filter(t =>
          !this.tripleEquals(t, instantiatedTriple),);
        removedTriplePatterns.push(instantiatedTriple);
      }
    }
    return removedTriplePatterns;
  }

  private toTerm(value: ITargetTriplePatternTerm): RDF.Variable | RDF.NamedNode | RDF.Literal {
    if (value.termType === 'variable') {
      return this.DF.variable(value.value);
    }
    if (value.termType === 'namedNode'){
      return this.DF.namedNode(value.value);
    }
    return this.DF.literal(value.value);
  }

  private toTermNoLiteral(value: ITargetTriplePatternTerm): RDF.Variable | RDF.NamedNode {
    if (value.termType === 'variable') {
      return this.DF.variable(value.value);
    }
    return this.DF.namedNode(value.value);
  }

  private tripleEquals(a: Triple, b: Triple): boolean {
    return this.rdfTermEquals(a.subject, b.subject) &&
           this.rdfTermEquals(a.predicate, b.predicate) &&
           this.rdfTermEquals(a.object, b.object)
  }

  // PropertyPath equality function (from previous example)
  private propertyPathEquals(a: PropertyPath, b: PropertyPath): boolean {
    if (a.type !== b.type) return false;
    if (a.pathType !== b.pathType) return false;
    if (a.items.length !== b.items.length) return false;

    return a.items.every((item, index) => {
      const otherItem = b.items[index];
      const hasEqualsI = this.hasEquals(item);
      const hasEqualsOI = this.hasEquals(otherItem);
      if (hasEqualsI && hasEqualsOI) {
        return item.equals(otherItem);
      }
      if (!hasEqualsI && !hasEqualsOI){
        return this.propertyPathEquals(item, otherItem);
      }
      return false;
    });
  }

  // Main equality function for the union type
  private rdfTermEquals(a: Term | PropertyPath, 
    b: Term | PropertyPath): boolean {

    // Both are Terms and can be compared
    if (this.hasEquals(a) && this.hasEquals(b)){
      return a.equals(b);
    }
    if (!this.hasEquals(a) && !this.hasEquals(b)){
      return this.propertyPathEquals(a, b);
    }  
    // Different types are never equal
    return false;
  }

  private hasEquals(item: any): item is Term{
    return 'equals' in item;
  }

  private expressionEquals(a: Expression, b: Expression): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  private hasTriple(bgp: BgpPattern, triple: Triple): boolean {
    if (bgp.type !== 'bgp') {
      throw new Error(`Expected a BGP pattern, but got ${bgp.type}`);
    }
    return bgp.triples.some(t => this.tripleEquals(t, triple));
  }

  private initializeEmptyOperatorState(): IOperatorState {
    return {
      addedTps: [],
      removedTps: [],
      addedExp: [],
      removedExp: [],
    };
  }

  public sampleVariableTerm(variable: string, user: string): RDF.Term {
    const probabilities = this.variableProbabilities[variable];
    if (!probabilities) {
      throw new Error(`No probabilities found for variable '${variable}'`);
    }
    const logits = probabilities[user];
    if (!logits) {
      throw new Error(`No logits found for user '${user}' for variable '${variable}'`);
    }
    return this.DF.namedNode(this.sampleTerm(logits));
  }

  public sampleTerm(logits: IEntityLogits[]): string {
    const r = this.rng(); // Random number between 0 and 1
    let cumulative = 0;

    for (const item of logits) {
      cumulative += item.similarity;
      if (r < cumulative) {
        return item.entity;
      }
    }
    throw new Error('Failed sampling, likely due to probabilities not summing to 1.');
  }

  public sampleRandom<A>(array: A[]): A {
    return array[Math.floor(this.rng() * array.length)];
  }

  public updateCounter(user: string, variable: string, value: string): void {
    if (!this.instantiationCounts[user]) {
      this.instantiationCounts[user] = {};
    }
    if (!this.instantiationCounts[user][variable]) {
      this.instantiationCounts[user][variable] = {};
    }
    if (!this.instantiationCounts[user][variable][value]) {
      this.instantiationCounts[user][variable][value] = 0;
    }
    this.instantiationCounts[user][variable][value]++;
  }

  public getInstantiationCounts(): Record<string, Record<string, Record<string, number>>> {
    return this.instantiationCounts;
  }

  public getVariableProbabilities(): Record<string, Record<string, IEntityLogits[]>> {
    return this.variableProbabilities;
  }
}

export interface IRefinementOutput {
  query: SelectQuery;
  removedTriplePatterns: Triple[];
  removedExpressions: Expression[];
}
export interface IRefinementState {
  stateQuery: IOperatorState;
  stateFilter: IOperatorState;
  stateOptional: IOperatorState;
  stateUnion: IOperatorState;     
}

export interface IOperatorState {
  addedTps: Triple[];
  removedTps: Triple[];
  addedExp: Expression[];
  removedExp: Expression[]
}

const typeToKeyMap = {
  QUERY: 'stateQuery',
  FILTER: 'stateFilter',
  OPTIONAL: 'stateOptional',
  UNION: 'stateUnion',
} as const;