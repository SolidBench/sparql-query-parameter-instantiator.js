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
  FilterPattern,
  OptionalPattern,
  UnionPattern} from 'sparqljs';
import {
  Wildcard,
  BlockPattern
 Generator } from 'sparqljs';
import type { IEntityLogits, IQueryRefinementPattern, ITargetTriplePattern } from './QuerySequenceTemplateProvider';

/**
 * Data object for a query template.
 */
export class QuerySequenceTemplate {
  private readonly syntaxTree: SparqlQuery;
  private readonly variableMappings: Record<string, RDF.Term[]>;
  private readonly variableProbabilities: Record<string, Record<string, IEntityLogits[]>>;
  private readonly rng: seedrandom.PRNG | undefined;
  private readonly DF: DataFactory = new DataFactory();
  private readonly refinementPatterns?: IQueryRefinementPattern[];
  public readonly instantiationCounts: Record<string, Record<string, Record<string, number>>> = {};

  public constructor(
    syntaxTree: SparqlQuery,
    variableMappings: Record<string, RDF.Term[]>,
    variableProbabilities: Record<string, Record<string, IEntityLogits[]>>,
    refinementPatterns?: IQueryRefinementPattern[],
    rng?: seedrandom.PRNG,
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
  public instantiate(counter: number, instantiateRefinementPattern: boolean, user?: string): string {
    // Determine variables to instantiate with
    const variableMapping: Record<string, RDF.Term> = {};
    for (const variable of Object.keys(this.variableMappings)) {
      const values = this.variableMappings[variable];
      // When no probabilities and rng is given, we simply cycle through the provided
      // values to instantiate queries in the sequence.
      if (Object.keys(this.variableProbabilities).length === 0) {
        const instantiationIndex = counter % values.length;
        variableMapping[variable] = values[instantiationIndex];
      } else if (Object.keys(this.variableProbabilities).length > 0 && this.rng && user) {
        const sampledValue: RDF.Term = this.sampleVariableTerm(variable, user);
        variableMapping[variable] = sampledValue;

        // Track instantiation counts for the variable and user
        this.updateCounter(user, variable, sampledValue.value);
      } else {
        throw new Error(
          `Either rng (${this.rng ? 'defined' : 'undefined'}), ` +
          `probabilities (${Object.keys(this.variableProbabilities).length > 0 ? 'defined' : 'undefined'}), ` +
          `or base user (${user ? 'defined' : 'undefined'}) are not given.`,
        );
      }
    }
    const instantiatedSyntaxTree = this.instantiateSyntaxTree(this.syntaxTree, variableMapping);
    if (instantiateRefinementPattern) {
      if (!this.refinementPatterns) {
        throw new Error(`No refinement patterns available for instantiation`);
      }
      this.createRefinementSequence(
        this.refinementPatterns,
        instantiatedSyntaxTree,
        4,
        variableMapping,
      );
    }
    // Instantiate syntax tree
    return new Generator().stringify(instantiatedSyntaxTree);
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
  ): string[] {
    const addedPatterns: ITargetTriplePattern[] = [];
    const removedTriples = [];

    for (let i = 0; i < nSteps; i++) {
      const operatorTriples: Record<string, Triple[][]> = this.extractTriplePatternsPerOperator(
        query.where!,
      );
      const validPatterns = this.findValidRefinementPatterns(
        operatorTriples,
        refinementPatterns,
        addedPatterns,
        removedTriples,
      );
      const patternToApply = this.sampleRandom(validPatterns);
      const { query: refinedQuery, removedTriplePatterns } =
        this.applyRefinementPattern(
          patternToApply,
          query,
          operatorTriples,
variableMapping,
          removedTriples
        );

      removedTriples.push(...removedTriplePatterns);
      addedPatterns.push(...patternToApply.target);
    }
    return [];
  }

  public applyRefinementPattern(
    pattern: IQueryRefinementPattern,
    query: SelectQuery,
    operatorTriples: Record<string, Triple[][]>,
    variableMapping: Record<string, RDF.Term>,
    previouslyRemovedTriplePatterns: Triple[],
  ): IRefinementOutput {
    const removedTriplePatterns: Triple[] = [];
    if (pattern.location === undefined) {
      throw new Error(`Location for addition refinement pattern ${pattern.description} is not defined`);
    }
    const patternType = pattern.type.toLowerCase();
    // Extract BGPs. We can probably use this as a function parameter and not use the Triple[][]
    // representation, but we'll have to change some tests (AGAIN).
    const operatorToBgp: Record<string, BgpPattern[]> = {};
    this.extractBgpPerOperator(query.where!, operatorToBgp, 'query');

    if (pattern.operation === 'addition') {
      switch (patternType) {
        case 'optional':
          const groupPatternOptional = operatorToBgp[patternType];
          let toRefineOptional: BgpPattern;
          if (!groupPatternOptional || groupPatternOptional.length === 0) {
            // If no optionals are present, add a new optional pattern
            const optionalBgp: BgpPattern = { type: 'bgp', triples: []};

            const optionalBlock: OptionalPattern = { type: 'optional', patterns: [ optionalBgp ]};
            query.where!.push(optionalBlock);

            toRefineOptional = <BgpPattern> optionalBlock.patterns[pattern.location];
          } else {
            toRefineOptional = operatorToBgp[patternType][pattern.location];
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

        case 'union':
          const groupPatternUnion = operatorToBgp[patternType];
          let toRefineUnion: BgpPattern;
          if (!groupPatternUnion || groupPatternUnion.length === 0) {
            // If no optionals are present, add a new optional pattern
            const leftUnion: BgpPattern = { type: 'bgp', triples: []};
            const rightUnion: BgpPattern = { type: 'bgp', triples: []};

            const unionBlock: UnionPattern = { type: 'union', patterns: [ leftUnion, rightUnion ]};
            query.where!.push(unionBlock);

            toRefineUnion = <BgpPattern> unionBlock.patterns[pattern.location];
          } else {
            toRefineUnion = operatorToBgp[patternType][pattern.location];
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

        case 'filter':
          const filters: FilterPattern[] = query.where!.filter(x => x.type === 'filter');
          break;

        case 'query': {
          const bgpToRefine = operatorToBgp[patternType][pattern.location];

          if (!bgpToRefine) {
            throw new Error(`BGP Doesn't exist at index ${pattern.location} 
              for query bgp operator with ${operatorToBgp[patternType]} BGPs`);
          }

          let targetTriples: (ITargetTriplePattern | Triple)[] = pattern.target;
          // Add back a triple when no target is specified
          if (pattern.target.length === 0) {
            targetTriples = [ this.sampleRandom(previouslyRemovedTriplePatterns) ];
          }

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
      switch (patternType) {
        case 'filter':
          break;
        case 'optional':
        case 'union':
        case 'query': {
          const bgpToRefine = operatorToBgp[patternType][pattern.location];
          if (!bgpToRefine) {
            throw new Error(`BGP Doesn't exist at index ${pattern.location} 
              for query bgp operator with ${operatorToBgp[patternType]} BGPs`);
          }
          let triplesToRemove = pattern.target.map(x => this.targetToTriple(x));
          if (triplesToRemove.length === 0) {
            triplesToRemove = [ this.sampleRandom(bgpToRefine.triples) ];
          }
          this.removeTargetFromBgp(bgpToRefine, triplesToRemove, variableMapping);
        }
      }
    } else {
      throw new Error(`Unknown operation type '${pattern.operation}' in refinement pattern ${pattern.description}`);
    }
    return { query, removedTriplePatterns };
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
    refinementPatterns: IQueryRefinementPattern[],
    addedPatterns: ITargetTriplePattern[],
    removedTriplePatterns: Triple[],
  ): IQueryRefinementPattern[] {
    // We don't need a per BGP distinction of triple patterns for this function, so flatten
    const operatorTriplePatternsFlattened =
      Object.fromEntries(Object.entries(operatorTriplePatterns).map(([ k, v ]) => [ k, v.flat() ]));
    const totalTriples = Object.values(operatorTriplePatternsFlattened)
      .reduce((sum, triples) => sum + triples.length, 0);

    // This.countTriplePatternsPerOperator(query.where!, triplesPerOperator, "query");
    return refinementPatterns.filter((pattern) => {
      // No repeat addition of triple patterns.
      // Check for length of targets array to ensure this is not falsly set to true when
      // empty array is passed
      const patternInQuery = pattern.target.length > 0 ?
        pattern.target.every(tpTarget => addedPatterns.some(addedPattern =>
          this.tripleEquals(this.targetToTriple(addedPattern), this.targetToTriple(tpTarget)))) :
        false;

      if (patternInQuery && pattern.operation === 'addition') {
        return false;
      }

      const patternType = pattern.type.toLowerCase();
      // If we want to remove any triple from the BGP in query, we need only
      // the length to be larger than 1, as to not make an empty query
      if (pattern.operation === 'removal' && pattern.target.length === 0 &&
        operatorTriplePatternsFlattened.query && operatorTriplePatternsFlattened.query.length > 1 &&
        patternType === 'query'
      ) {
        return true;
      }

      if (pattern.operation === 'removal') {
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
      if (removedTriplePatterns.length > 0) {
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

  public targetToTriple(target: ITargetTriplePattern | Triple): Triple {
    if (this.isRdfJsTriple(target))
      return target;
    return {
      subject: this.toTerm(target.subject),
      predicate: this.toTerm(target.predicate),
      object: this.toTerm(target.object),
    };
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

  private hasTriple(bgp: BgpPattern, triple: Triple): boolean {
    if (bgp.type !== 'bgp') {
      throw new Error(`Expected a BGP pattern, but got ${bgp.type}`);
    }
    return bgp.triples.some(t => this.tripleEquals(t, triple));
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
    if (!this.rng) {
      throw new Error('RNG is not defined. Cannot sample term.');
    }
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
    return array[Math.floor(this.rng!() * array.length)];
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
}
