import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
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
import type { IEntityLogits, IQueryRefinementPattern, ITargetTriplePattern } from './QuerySequenceTemplateProvider';
import { cloneDeep }  from 'lodash';
/**
 * Data object for a query template.
 */
export class QuerySequenceTemplate {
  private readonly syntaxTree: SparqlQuery;
  private readonly variableMappings: Record<string, RDF.Term[]>;
  private readonly variableProbabilities: Record<string, Record<string, IEntityLogits[]>>;
  private readonly rng: seedrandom.PRNG;
  private readonly DF: DataFactory = new DataFactory();
  private readonly refinementPatterns?: IQueryRefinementPattern[];
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
    this.refinementPatterns = refinementPatterns;
    this.rng = rng;
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
      const operatorTriples: Record<string, Triple[][]> = this.extractTriplePatternsPerOperator(
        query.where!,
      );
      const operatorExpressions: Record<string, Expression[][]> = {};
      this.extractExpressionPerOperator(query.where!, operatorExpressions, 'filter');

      const validPatterns = this.findValidRefinementPatterns(
        operatorTriples,
        operatorExpressions,
        refinementPatterns,
        refinementState,
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
    this.extractBgpPerOperator(query.where!, operatorToBgp, 'query');
    this.extractExpressionPerOperator(query.where!, operatorToExpression, 'filter');

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
            variableMapping
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
            variableMapping
          );
          break;

        case 'FILTER':
          // Filters can not be modified, they are simply appended to the query
          let targetFilters: Expression[] = pattern.target;

          // Add back a triple when no target is specified
          const state = refinementState[typeToKeyMap[patternType]];
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
            variableMapping
          );
          break;
        }
      }
    } else if (pattern.operation === 'removal') {
      const state = refinementState[typeToKeyMap[patternType]];
      switch (patternType) {
        case 'FILTER':
          let filtersToRemove = pattern.target;
          if (filtersToRemove.length === 0){
            // Randomly select a filter to remove
            filtersToRemove = [ this.sampleRandom(
              query.where!.filter(queryPattern => queryPattern.type === 'filter')
            ).expression];

          }
          state.removedExp.push(...pattern.target);
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
          this.removeTargetFromBgp(bgpToRefine, triplesToRemove, variableMapping);

          // Update state of refinement sequence
          state.removedTps.push(...triplesToRemove);
        }
      }
    } else {
      throw new Error(`Unknown operation type '${pattern.operation}' in refinement pattern ${pattern.description}`);
    }
    return query;
  }

  /**
   * Key method that determines whether a given set of refinement patterns can be applied to
   * @param operatorTriplePatternsFlattened Record mapping operator names (lowercase) to the triple patterns
   * belonging to them
   * @param refinementPatterns The refinement patterns to be evaluated
   * @param addedPatterns The triple patterns added by previous pattern applications
   * @param removedTriplePatterns Triple patterns that have previously been removed
   * @returns An array of all valid refinement patterns
   */
  public findValidRefinementPatterns(
    operatorTriplePatterns: Record<string, Triple[][]>,
    operatorExpressions: Record<string, Expression[][]>,
    refinementPatterns: IQueryRefinementPattern[],
    refinementState: IRefinementState
  ): IQueryRefinementPattern[] {
    // We don't need a per BGP distinction of triple patterns for this function, so flatten
    const operatorTriplePatternsFlattened =
      Object.fromEntries(Object.entries(operatorTriplePatterns).map(([ k, v ]) => [ k, v.flat() ]));
    const totalTriples = Object.values(operatorTriplePatternsFlattened)
      .reduce((sum, triples) => sum + triples.length, 0);

    const operatorExpressionsFlattened =
      Object.fromEntries(Object.entries(operatorExpressions).map(([ k, v ]) => [ k, v.flat() ]));
    const totalExpressions = Object.values(operatorExpressionsFlattened)
      .reduce((sum, expressions) => sum + expressions.length, 0);

    // All operators added in previous refinements, we don't want repeat triples
    const queryTriples = Object.values(operatorTriplePatterns).map(x=> x.flat()).flat();
    const queryExpressions = Object.values(operatorExpressions).map(x=> x.flat()).flat();

    const variablesInQuery = this.getAllVariables(queryTriples);

    // This.countTriplePatternsPerOperator(query.where!, triplesPerOperator, "query");
    return refinementPatterns.filter((pattern) => {
      // No repeat expressions or triples, no matter if they are in the same operator or not
      let patternInQuery: boolean;
      if (pattern.type === 'FILTER') {
        patternInQuery = pattern.target.length > 0 &&
          pattern.target.every(tExp => queryExpressions.some(pExp =>
            this.expressionEquals(tExp, pExp)
          ));
      } else {
        patternInQuery = pattern.target.length > 0 &&
          pattern.target.every(tpTarget =>
            queryTriples.some(addedPattern =>
              this.tripleEquals(
                this.targetToTriple(addedPattern),
                this.targetToTriple(tpTarget)
              )
            )
          );
      }
      
      if (patternInQuery && pattern.operation === 'addition') {
        return false;
      }
      
      const patternType = pattern.type.toLowerCase();

      // If we want to add a FILTER to a query, the variables in the filter must
      // be present in the query somewhere
      if (pattern.operation === 'addition' && pattern.type === 'FILTER'){
        const variablesInExpressions = pattern.target.map(
          expr => this.getVariablesInExpression(expr)
        );
        if (variablesInExpressions.some(
          variables => Array.from(variables.values()).some(
            variable => !variablesInQuery.has(variable))
          )
        ){
          return false;
        }
      }

      // If we want to remove any triple from the BGP in query, we need only
      // the length to be larger than 1, as to not make an empty query
      if (pattern.operation === 'removal' && pattern.target.length === 0 &&
        operatorTriplePatternsFlattened.query && operatorTriplePatternsFlattened.query.length > 1 &&
        patternType === 'query'
      ) {
        return true;
      }

      if (pattern.operation === 'removal') {
        if (pattern.type === 'FILTER') {
          if (totalExpressions - Math.max(pattern.target.length, 1) <= 0) {
            return false;
          }
          // If the operator is not in the query, we can't apply removal
          if (operatorExpressionsFlattened[patternType] && 
            pattern.target
            .every(t => operatorExpressionsFlattened[patternType]
              .some(exp => this.expressionEquals(t, exp)))) 
            {
            return true;
          }
          return false;
        }        
        else {
          // We can't make an empty query, atleast one triple pattern should be left
          // In case there is a empty target, one random triple pattern will be removed,
          // so we use max here
          if (totalTriples - Math.max(pattern.target.length, 1) <= 0) {
            return false;
          }
          // If the operator is not in the query, we can't apply removal
          if (operatorTriplePatternsFlattened[patternType] && // For removal patterns, all targets must be in the present in the operator
            pattern.target.every(t => operatorTriplePatternsFlattened[patternType].some(tp =>
              this.tripleEquals(this.targetToTriple(t), tp)))
          ) {
            return true;
          }
          return false;
        }
      }

      // If not duplicate you can always add, except when it concerns the original query.
      // You can add regardless of operator, as if it doesn't exist a new operator block
      // is made
      if (patternType !== 'query') {
        return true;
      }

      // Adding specified triple pattern to bgp of query is always possible. Given that
      // duplicate targets would've already been filtered
      if (pattern.target.length > 0) {
        return true;
      }

      // Check if there are removed triple patterns for the empty target pattern to
      // add back to the query
      if (refinementState[typeToKeyMap[pattern.type]].removedTps.length > 0) {
        return true;
      }
      return false;
    });
  }

  public extractTriplePatternsPerOperator(
    patterns: Pattern[],
  ): Record<string, Triple[][]> {
    const bgpsPerOperator: Record<string, BgpPattern[]> = {};
    this.extractBgpPerOperator(patterns, bgpsPerOperator, 'query');

    const triplesPerOperator: Record<string, Triple[][]> = {};
    for (const operator in bgpsPerOperator) {
      triplesPerOperator[operator] = bgpsPerOperator[operator].map(bgp => bgp.triples);
    }
    return triplesPerOperator;
  }

  public extractBgpPerOperator(
    patterns: Pattern[],
    bgpsPerOperator: Record<string, BgpPattern[]>,
    previousOperator: 'query' | 'union' | 'optional',
  ) {
    for (const pattern of patterns) {
      switch (pattern.type) {
        case 'group':
          this.extractBgpPerOperator(pattern.patterns, bgpsPerOperator, previousOperator);
          break;

        case 'query':
          if (pattern.where) {
            this.extractBgpPerOperator(pattern.where, bgpsPerOperator, 'query');
          }
          break;

        case 'bgp':
          if (!bgpsPerOperator[previousOperator]) {
            bgpsPerOperator[previousOperator] = [];
          }
          bgpsPerOperator[previousOperator].push(pattern);
          break;

        case 'union':
          if (!bgpsPerOperator.union) {
            bgpsPerOperator.union = [];
          }
          this.extractBgpPerOperator(pattern.patterns, bgpsPerOperator, 'union');
          break;

        case 'optional':
          if (!bgpsPerOperator.optional) {
            bgpsPerOperator.optional = [];
          }
          this.extractBgpPerOperator(pattern.patterns, bgpsPerOperator, 'optional');
          break;

        case 'filter':
          break;

        default:
          break;
      }
    }
  }

  public extractExpressionPerOperator(    
    patterns: Pattern[],
    expressionsPerOperator: Record<string, Expression[]>,
    previousOperator: 'filter',
  ) {
    for (const pattern of patterns) {
      switch (pattern.type) {
        case 'query':
          if (pattern.where) {
            this.extractExpressionPerOperator(pattern.where, expressionsPerOperator, previousOperator);
          }
          break;

        case 'group':
        case 'union':
        case 'optional':
        case 'graph':
        case 'minus':
        case 'service':
          this.extractExpressionPerOperator(pattern.patterns, expressionsPerOperator, previousOperator);
          break;

        case 'filter':
          if (!expressionsPerOperator[previousOperator]) {
            expressionsPerOperator[previousOperator] = [];
          }
          expressionsPerOperator[previousOperator].push(pattern.expression);
          break;

        default:
          break;
      }
    }
  }

  public getVariablesInExpression(expr: Expression): Set<string> {
    const variables = new Set<string>();
    
    function recurse(e: Expression | Term | any): void {
      if (!e) return;
      
      // Handle arrays (like args in operations)
      if (Array.isArray(e)) {
        for (const item of e) {
          recurse(item);
        }
        return;
      }
      
      // Handle different expression types
      switch (e.type) {
        case 'operation':
          // Handle operation arguments
          if (e.args && Array.isArray(e.args)) {
            for (const arg of e.args) {
              recurse(arg);
            }
          }
          break;
          
        case 'functionCall':
          // Handle function calls with arguments
          if (e.args && Array.isArray(e.args)) {
            for (const arg of e.args) {
              recurse(arg);
            }
          }
          break;
          
        case 'term':
          // Handle term expressions
          if (e.term) {
            recurse(e.term);
          }
          break;
          
        case 'variable':
          // Direct variable reference
          if (e.value) {
            variables.add(e.value.startsWith('?') ? e.value.substring(1) : e.value);
          }
          break;
          
        case 'aggregate':
          // Handle aggregates (COUNT, SUM, etc.)
          if (e.expression) {
            recurse(e.expression);
          }
          if (e.separator) {
            recurse(e.separator);
          }
          break;
          
        case 'namedExpression':
          // Handle named expressions (AS clauses)
          if (e.expression) {
            recurse(e.expression);
          }
          break;
          
        case 'exists':
        case 'notexists':
          // Handle EXISTS and NOT EXISTS
          if (e.input) {
            // This would need more complex handling for graph patterns
            // For now, just try to recurse if it's an expression
            recurse(e.input);
          }
          break;
          
        default:
          // Handle direct Term objects (Variable, Literal, NamedNode, etc.)
          if (e.termType === 'Variable') {
            const varName = e.value;
            variables.add(varName.startsWith('?') ? varName.substring(1) : varName);
          }
          
          // Handle other potential nested structures
          if (e.left) recurse(e.left);
          if (e.right) recurse(e.right);
          if (e.expression) recurse(e.expression);
          if (e.args) recurse(e.args);
          break;
      }
    }
    
    recurse(expr);
    return variables;
  }  

  public targetToTriple(target: ITargetTriplePattern | Triple): Triple {
    if (this.isRdfJsTriple(target))
      return target;
    return {
      subject: this.toTerm(target.subject),
      predicate: this.toTerm(target.predicate),
      object: this.toTerm(target.object),
    };
  }

  private isRDFTerm(term: any): term is Term {
    return term && typeof term.termType === 'string' && typeof term.value === 'string';
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
      obj.predicate?.termType !== undefined &&
      obj.object?.termType !== undefined;
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

  private addExpressionToQuery(
    targets: Expression[]
  ){

  }

  private toTerm(value: string): RDF.Variable | RDF.NamedNode {
    if (value.startsWith('?')) {
      return this.DF.variable(value.slice(1));
    }
    return this.DF.namedNode(value);
  }

  private tripleEquals(a: Triple, b: Triple): boolean {
    return a.subject.value === b.subject.value &&
      JSON.stringify(a.predicate) === JSON.stringify(b.predicate) &&
      a.object.value === b.object.value;
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
  addedTps: ITargetTriplePattern[];
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