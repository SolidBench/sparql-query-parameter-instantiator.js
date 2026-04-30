import type * as RDF from '@rdfjs/types';
import { cloneDeep } from 'lodash';
import { DataFactory } from 'rdf-data-factory';

// eslint-disable-next-line ts/no-require-imports
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
  UnionPattern,
} from 'sparqljs';
import {
  Wildcard,
  Generator,
} from 'sparqljs';
import type {
  IFilterRefinementPattern,
  IEntityLogits,
  IQueryRefinementPattern,
  ITargetTriplePattern,
  ITargetTriplePatternTerm,
  IOtherRefinementPattern,
  IUnionRefinementPattern,
  ISubRefinementPattern,
} from './QuerySequenceTemplateProvider';
import { randomIntFromInterval, sampleRandom, sampleVariableTerm } from './utils/RandomUtils';
import {
  countFlattened,
  expressionEquals,
  extractBgpPerOperator,
  extractExpressionPerOperator,
  extractTriplePatternsPerOperator,
  flattenOperators,
  getVariablesInExpression,
  hasTriple,
  isRDFTerm,
  targetToTriple,
  toTermNoLiteral,
  tripleEquals,
} from './utils/RefinementSequenceUtils';
import type { TermCallback } from './utils/SyntaxTreeUtils';
import { processTriple, recurseExpression, recursePatterns } from './utils/SyntaxTreeUtils';
import type { IValueTransformer } from './valuetransformer/IValueTransformer';
import { substitutePatterns } from './utils/SubstitutionUtils';

/**
 * Data object for a query template.
 */
export class QuerySequenceTemplate {
  private readonly syntaxTree: SparqlQuery;
  public readonly variableMappings: Record<string, RDF.Term[]>;
  private readonly variableProbabilities: Record<string, Record<string, IEntityLogits[]>>;
  // Mapping from variable to be instantiated to the type of variable (defined in config)
  public readonly instantiationVariableTypeMap: Record<string, string>;
  // Mapping from output query variable usable for next query instantiation to the type
  // of instantiator
  public readonly outputVariableTypeMap: Record<string, string>;

  private readonly rng: seedrandom.PRNG;
  // eslint-disable-next-line ts/naming-convention
  private readonly DF: DataFactory = new DataFactory();

  private readonly iriTransformer?: IValueTransformer;

  private readonly refinementPatterns: IQueryRefinementPattern[] | undefined;
  private readonly minRefinementLength: number;
  private readonly maxRefinementLength: number;

  public readonly instantiationCounts: Record<string, Record<string, number>> = {};

  public constructor(
    syntaxTree: SparqlQuery,
    variableMappings: Record<string, RDF.Term[]>,
    variableProbabilities: Record<string, Record<string, IEntityLogits[]>>,
    instantiationVariableToType: Record<string, string>,
    outputPossibleInstantiationValue: Record<string, string>,
    rng: seedrandom.PRNG,
    minRefinementLength: number,
    maxRefinementLength: number,
    iriTransformer?: IValueTransformer,
    refinementPatterns?: IQueryRefinementPattern[],
  ) {
    this.syntaxTree = syntaxTree;
    this.variableMappings = variableMappings;
    this.variableProbabilities = variableProbabilities;
    this.instantiationVariableTypeMap = instantiationVariableToType;
    this.outputVariableTypeMap = outputPossibleInstantiationValue;
    this.rng = rng;
    if (refinementPatterns){
      this.refinementPatterns = this.mapRefinementConfigToSparqlJs(refinementPatterns);
    }
    this.minRefinementLength = minRefinementLength;
    this.maxRefinementLength = maxRefinementLength;
    this.iriTransformer = iriTransformer;
  }

  public mapRefinementConfigToSparqlJs(refinementPatterns: IQueryRefinementPattern[]){
    return refinementPatterns.map((pattern) => {
      // Map config representation of target of substitution to a RDF.Variable object
      if (pattern.type === 'SUB' && !this.isVariable(pattern.target)) {
        pattern.target = <RDF.Variable> toTermNoLiteral(pattern.target, this.DF);
      } else if (pattern.type === 'UNION') {
        pattern.target = [
          pattern.target[0].map(triple => targetToTriple(triple, this.DF)),
          pattern.target[1].map(triple => targetToTriple(triple, this.DF)),
        ];
      } else if (pattern.type !== 'FILTER' && pattern.type !== 'SUB') {
        pattern.target = pattern.target.map(triple => targetToTriple(triple, this.DF));
      }
      // Filters don't need mapping, as no functions are defined in the object interface.
      return pattern;
    });
  }

  /**
   * Instantiate this template for the given counter value.
   * This counter value is used to determine what variable value should be used.
   * When passed a previous query result, the query will be instantiated with one of these values
   * instead. This is to simulate 'click through' behavior of a user.
   * @param counter The current counter value.
   * @param instantiateRefinementPattern Whether a refinement pattern should be simulated
   * @param previousQueryResult Preceding query results if not empty this will be
   * used as instantiation value
   * @param user The user who the simulated sequence belongs to
   */
  public instantiate(
    counter: number,
    instantiateRefinementPattern: boolean,
    previousQueryResult: Record<string, RDF.Term[]>,
    user?: string,
  ):
    { queries: string[]; patternMetadata: Record<string, any>[]; asts: SelectQuery[] } {
    // Determine variables to instantiate with
    const { variableMapping, alternativeMapping } = this.getVariableMapping(
      previousQueryResult,
      counter,
      user,
    );
    const instantiatedSyntaxTree = this.instantiateSyntaxTreeWrap(this.syntaxTree, variableMapping);

    // Create an array of SelectQueries that are variations of the same template
    if (instantiateRefinementPattern) {
      if (!this.refinementPatterns) {
        throw new Error(`No refinement patterns available for instantiation`);
      }
      const patternLength = randomIntFromInterval(this.rng, this.minRefinementLength, this.maxRefinementLength);
      const { queries, metadata } = this.createRefinementSequence(
        this.refinementPatterns,
        instantiatedSyntaxTree,
        patternLength,
        variableMapping,
        alternativeMapping,
      );
      return {
        queries: queries.map(query => new Generator().stringify(query)),
        asts: queries,
        patternMetadata: metadata,
      };
    }
    // Instantiate syntax tree
    return {
      queries: [ new Generator().stringify(instantiatedSyntaxTree) ],
      asts: [ instantiatedSyntaxTree ],
      patternMetadata: [{}],
    };
  }

  private getVariableMapping(
    previousQueryResult: Record<string, RDF.Term[]>,
    counter: number,
    user?: string,
  ): IAlternativeVariableMappings {
    const variableMapping: Record<string, RDF.Term> = {};
    const alternativeMapping: Record<string, RDF.Term> = {};

    for (const variable of Object.keys(this.variableMappings)) {
      if (variable in previousQueryResult && previousQueryResult[variable].length > 0) {
        const values = previousQueryResult[variable];
        variableMapping[variable] = values[counter % values.length];
        alternativeMapping[variable] = values[(counter + 1) % values.length];
        if (user) {
          this.updateCounter(variable, values[counter % values.length].value);
        }
      } else {
        const values = this.variableMappings[variable];
        // When no probabilities and rng is given, we simply cycle through the provided
        // values to instantiate queries in the sequence.
        if (!this.variableProbabilities[variable]) {
          variableMapping[variable] = values[counter % values.length];
          alternativeMapping[variable] = values[(counter + 1) % values.length];
        } else if (Object.keys(this.variableProbabilities).length > 0 && user) {
          const sampledValues: RDF.Term[] = sampleVariableTerm(
            variable, user, 2, this.variableProbabilities, this.DF, this.rng
          );
          variableMapping[variable] = sampledValues[0];
          alternativeMapping[variable] = sampledValues[1];

          // Track instantiation counts for the variable and user
          this.updateCounter(variable, sampledValues[0].value);
        } else {
          throw new Error(
            `Either probabilities (${Object.keys(this.variableProbabilities).length > 0 ? 'defined' : 'undefined'}), ` +
            `or base user (${user ? 'defined' : 'undefined'}) are not given.`,
          );
        }
      }
    }
    return { variableMapping, alternativeMapping };
  }

  // TODO: This has complete overlap with QueryTemplate functions. When we're happy with the benchmark
  // we should make a base instantiator class.
  public instantiateSyntaxTreeWrap(syntaxTree: SparqlQuery, variableMapping: Record<string, RDF.Term>): SelectQuery {
    const context: Record<string, any> = { variableMapping };
    return this.instantiateSyntaxTreeRecurse(syntaxTree, this.instantiateTerm, context);
  }

  private readonly instantiateSyntaxTreeRecurse = (
    syntaxTree: SparqlQuery,
    termCallback: TermCallback,
    context: Record<string, any>,
  ): SelectQuery => {
    // Only allow SELECT queries
    const variableMapping: Record<string, RDF.Term> = context.variableMapping;
    if (!variableMapping) {
      throw new Error('Instantiation of syntax tree failed due to missing variableMapping in context');
    }

    if (syntaxTree.type !== 'query' || syntaxTree.queryType !== 'SELECT') {
      throw new Error(`Only instantiations of SELECT queries are supported`);
    }

    // Remove variables
    syntaxTree = { ...syntaxTree };

    // Ensure prefixes get same transformation as iris
    if (this.iriTransformer) {
      syntaxTree.prefixes = Object.fromEntries(
        Object.entries(syntaxTree.prefixes).map(([ prefix, iri ]) => {
          const transformed = this.iriTransformer!.transform(this.DF.namedNode(iri));
          return [ prefix, transformed.value ];
        }),
      );
    }

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
        variable.expression = recurseExpression(
          variable.expression,
          termCallback,
          context,
          this.instantiateSyntaxTreeRecurse,
        );
      }
      return variable;
    });

    // Handle where clause in a recursive manner
    syntaxTree.where = recursePatterns(syntaxTree.where!, termCallback, context, this.instantiateSyntaxTreeRecurse);

    // Handle GROUP BY
    if (syntaxTree.group) {
      syntaxTree.group = syntaxTree.group
        .map(group => ({
          expression: recurseExpression(
            group.expression,
            termCallback,
            context,
            this.instantiateSyntaxTreeRecurse,
          ),
        }));
    }

    return syntaxTree;
  };

  private readonly instantiateTerm = <T extends IriTerm | BlankTerm | VariableTerm | QuadTerm | PropertyPath | Term>(
    term: T,
    context: Record<string, any>,
  ): T | RDF.Term => {
    if (term && typeof term === 'object' && 'termType' in term && (<RDF.Term>term).termType === 'Variable') {
      const variableName = (<VariableTerm>term).value;
      const variableValue: RDF.Term = context.variableMapping[variableName];
      if (variableValue) {
        return variableValue;
      }
    }
    // If we're passed an IRI transformers we transform any term we encounter during instantiation
    if (this.iriTransformer) {
      if (term && typeof term === 'object' && 'termType' in term &&
        (<RDF.Term>term).termType === 'NamedNode') {
        return this.iriTransformer.transform(term);
      }

      if (term && typeof term === 'object' && 'pathType' in term) {
        return <T> this.transformPropertyPath(term, context);
      }
    }
    return term;
  };

  private transformPropertyPath(path: PropertyPath, context: Record<string, any>): PropertyPath {
    return {
      ...path,
      // Map over every item in the path (whether it's an IRI or a nested PropertyPath)
      // and route it back through the main instantiator.
      items: path.items.map(item => <IriTerm | PropertyPath> this.instantiateTerm(item, context)),
    };
  }

  public createRefinementSequence(
    refinementPatterns: IQueryRefinementPattern[],
    query: SelectQuery,
    nSteps: number,
    variableMapping: Record<string, RDF.Term>,
    alternativeMapping: Record<string, RDF.Term>,
  ): {
      queries: SelectQuery[];
      metadata: Record<string, any>[];
    } {
    // Substitution state denoting which variables can be substituted and how many times
    // a given variable has already been changed.
    const stateSubstitution: Record<string, IOperatorStateSub> = {};
    for (const [ variable, term ] of Object.entries(variableMapping)) {
      stateSubstitution[variable] = {
        original: term,
        nCalls: 0,
        active: false,
      };
    }
    const refinementState: IRefinementState = {
      stateFilter: this.initializeEmptyOperatorState(),
      stateQuery: this.initializeEmptyOperatorState(),
      stateOptional: this.initializeEmptyOperatorState(),
      stateUnion: this.initializeEmptyOperatorState(),
      stateSubstitution,
    };
    const refinementSequence: SelectQuery[] = [ query ];
    const patternMetadata: Record<string, any>[] = [{}];
    const appliedPatterns = [];

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
        variableMapping,
      );

      const patternToApply = sampleRandom(this.rng, validPatterns);
      if (!patternToApply) {
        throw new Error(`Found no valid patterns for ${JSON.stringify(query, null, 2)}`);
      }
      const refinedQuery = this.applyRefinementPattern(
        patternToApply,
        query,
        variableMapping,
        alternativeMapping,
        refinementState,
      );

      refinementSequence.push(refinedQuery);
      appliedPatterns.push(patternToApply.id);

      patternMetadata.push({ patternIds: [ ...appliedPatterns ]});
      query = refinedQuery;
    }
    return { queries: refinementSequence, metadata: patternMetadata };
  }

  public applyRefinementPattern(
    pattern: IQueryRefinementPattern,
    query: SelectQuery,
    variableMapping: Record<string, RDF.Term>,
    alternativeMapping: Record<string, RDF.Term>,
    refinementState: IRefinementState,
  ): SelectQuery {
    if (pattern.location === undefined) {
      throw new Error(`Location for refinement pattern ${pattern.description} is not defined`);
    }

    // Get query operator elements
    const operatorToBgp: Record<string, BgpPattern[]> = {};
    const operatorToExpression: Record<string, Expression[]> = {};
    extractBgpPerOperator(query.where!, operatorToBgp, 'bgp');
    extractExpressionPerOperator(query.where!, operatorToExpression, 'filter');

    const context: IRefinementContext = {
      query,
      pattern,
      variableMapping,
      alternativeMapping,
      operatorToBgp,
      operatorToExpression,
      state: refinementState[typeToKeyMap[pattern.type]],
    };

    if (pattern.operation === 'addition') {
      this.handleAddition(context);
    } else if (pattern.operation === 'removal') {
      this.handleRemoval(context);
    } else {
      throw new Error(`Unknown operation type '${String(pattern.operation)}'`);
    }

    return query;
  }

  private handleAddition(context: IRefinementContext): void {
    switch (context.pattern.type) {
      case 'OPTIONAL': this.addOptional(context); break;
      case 'UNION':    this.addUnion(context); break;
      case 'FILTER':   this.addFilter(context); break;
      case 'BGP':      this.addBgp(context); break;
      case 'SUB':      this.addSub(context); break;
      default: throw new Error(`Unsupported addition type: 
        ${(<any> context.pattern).type}`);
    }
  }

  private handleRemoval(context: IRefinementContext): void {
    switch (context.pattern.type) {
      case 'OPTIONAL': 
      case 'BGP':      this.removeBgpOrOptional(context); break;
      case 'UNION':    this.removeUnion(context); break;
      case 'FILTER':   this.removeFilter(context); break;
      case 'SUB':      this.removeSub(context); break;

      default: throw new Error(`Unsupported removal type: 
        ${(<any> context.pattern).type}`);
    }
  }

  private addOptional(context: IRefinementContext): void {
    const groupPattern = context.operatorToBgp['optional'];

    // As the checks were done before, we can explicitly cast the pattern type
    context.pattern = <IOtherRefinementPattern> context.pattern;

    let toRefineOptional: BgpPattern;
    if (!groupPattern || groupPattern.length === 0) {
      const optionalBgp: BgpPattern = { type: 'bgp', triples: [] };
      const optionalBlock: OptionalPattern = { type: 'optional', patterns: [optionalBgp] };
      context.query.where!.push(optionalBlock);
      toRefineOptional = <BgpPattern>optionalBlock.patterns[context.pattern.location];
    } else {
      toRefineOptional = groupPattern[context.pattern.location];
    }

    if (!toRefineOptional) {
      throw new Error(`BGP Doesn't exist at index ${context.pattern.location}`);
    }

    this.addTargetToBgp(toRefineOptional, context.pattern.target, context.query, context.variableMapping, <IOperatorState>context.state);
  }

  private removeBgpOrOptional(context: IRefinementContext): void {
    // As the checks were done before, we can explicitly cast the pattern type
    context.pattern = <IOtherRefinementPattern> context.pattern;

    const bgpToRefine = this.getBgpSafely(context, context.pattern.type.toLowerCase(), context.pattern.location);
    
    let triplesToRemove = context.pattern.target.map(x => targetToTriple(x, this.DF));
    if (triplesToRemove.length === 0) {
      triplesToRemove = [sampleRandom(this.rng, bgpToRefine.triples)];
    }

    const removed = this.removeTargetFromBgp(bgpToRefine, triplesToRemove, context.variableMapping);
    this.cleanUpUnusedVariables(context);
    
    (<IOperatorState>context.state).removedTps.push(...removed);
  }

  private addUnion(context: IRefinementContext){
    const groupPattern = context.operatorToBgp['union'];

    context.pattern = <IUnionRefinementPattern> context.pattern;
    
    let toRefineUnionLeft: BgpPattern;
    let toRefineUnionRight: BgpPattern;
    if (!groupPattern || groupPattern.length === 0) {
      // If no UNIONs are present, add a new optional pattern
      const leftUnion: BgpPattern = { type: 'bgp', triples: []};
      const rightUnion: BgpPattern = { type: 'bgp', triples: []};

      const unionBlock: UnionPattern = { type: 'union', patterns: [ leftUnion, rightUnion ]};
      context.query.where!.push(unionBlock);

      toRefineUnionLeft = <BgpPattern> unionBlock.patterns[0];
      toRefineUnionRight = <BgpPattern> unionBlock.patterns[1];
    } else {
      // Each union has two bgps in operatorToBgp record. So to extract start bgp of union
      // at given location we do * 2.
      const unionLeftBgpIndex = context.pattern.location * 2;
      groupPattern[unionLeftBgpIndex]
      toRefineUnionLeft = groupPattern[unionLeftBgpIndex];
      toRefineUnionRight = groupPattern[unionLeftBgpIndex+1];
    }
    // It is possible to add to a partial union if the target for that part of the union is empty
    // otherwise there should be a BGP there.
    if (!toRefineUnionLeft && context.pattern.target[0].length > 0) {
      throw new Error(`BGP Doesn't exist for left union for union at ${context.pattern.location},
        while target is defined.`);
    }
    if (!toRefineUnionRight && context.pattern.target[1].length > 0) {
      throw new Error(`BGP Doesn't exist for right union for union at ${context.pattern.location},
        while target is defined.`);
    }

    this.addTargetToBgp(
      toRefineUnionLeft,
      context.pattern.target[0],
      context.query,
      context.variableMapping,
      (<IOperatorState> context.state),
    );
    this.addTargetToBgp(
      toRefineUnionRight,
      context.pattern.target[1],
      context.query,
      context.variableMapping,
      (<IOperatorState> context.state),
    );
  }

  private removeUnion(context: IRefinementContext){
    context.pattern = <IUnionRefinementPattern> context.pattern;

    const unionLeftBgpIndex =context.pattern.location * 2;
    
    const bgpToRefineLeft = this.getBgpSafely(context, context.pattern.type.toLowerCase(), unionLeftBgpIndex);
    const bgpToRefineRight = this.getBgpSafely(context, context.pattern.type.toLowerCase(), unionLeftBgpIndex + 1);
    const bgps = [ bgpToRefineLeft, bgpToRefineRight ];

    let triplesToRemove: Triple[][] = context.pattern.target.map(triples => 
      triples.map(triple => targetToTriple(triple, this.DF))
    );

    if (triplesToRemove.length === 0) {
      const tripleToRemove = [
        sampleRandom(this.rng, [ ...bgpToRefineLeft.triples, ...bgpToRefineRight.triples ]),
      ];
      triplesToRemove = [ tripleToRemove, tripleToRemove ];
    }
    for (let i = 0; i < 2; i++) {
      const removed = this.removeTargetFromBgp(bgps[i], triplesToRemove[i], context.variableMapping);
      (<IOperatorState>context.state).removedTps.push(...removed);
    }
    this.cleanUpUnusedVariables(context);
  }

  private addFilter(context: IRefinementContext){
    context.pattern = <IFilterRefinementPattern> context.pattern;
    // Targets are instantiated and then evaluated
    let targetFilters: Expression[] = context.pattern.target.map(
      t => recurseExpression(t, 
        this.instantiateTerm, { variableMapping: context.variableMapping }, this.instantiateSyntaxTreeRecurse
      ),
    );
    const state = context.state;
    // Add back a filter when no target is specified
    if (targetFilters.length === 0) {
      targetFilters = [ sampleRandom(this.rng, (<IOperatorState>state).removedExp) ];
    }

    // The filter is no longer a 'removed' filter
    (<IOperatorState>state).removedExp = (<IOperatorState>state).removedExp.filter(
      exp => targetFilters.some(targetExp => !expressionEquals(exp, targetExp)),
    );

    // Add added filter to state and query
    for (const filterExpr of targetFilters) {
      context.query.where!.push({ type: 'filter', expression: filterExpr });
      (<IOperatorState>state).addedExp.push(filterExpr);
    }
  }

  private removeFilter(context: IRefinementContext){
    context.pattern = <IFilterRefinementPattern> context.pattern;
    // Filters to remove are instantiated versions of target
    let filtersToRemove = context.pattern.target.map(
      t => recurseExpression(t, 
        this.instantiateTerm, { variableMapping: context.variableMapping }, this.instantiateSyntaxTreeRecurse
      ),
    );
    if (filtersToRemove.length === 0) {
      // Randomly select a filter to remove
      filtersToRemove = [ 
        sampleRandom(
          this.rng,
          context.query.where!.filter(queryPattern => queryPattern.type === 'filter'),
        ).expression 
      ];
    }
    (<IOperatorState>context.state).removedExp.push(...filtersToRemove);
    context.query.where = context.query.where!.filter(
      (queryPattern: Pattern) => queryPattern.type !== 'filter' ||
      !filtersToRemove.some(t => expressionEquals(queryPattern.expression, t))
    );
  }

  private addBgp(context: IRefinementContext){
    context.pattern = <IOtherRefinementPattern> context.pattern;
    const bgpToRefine = this.getBgpSafely(
      context, 
      context.pattern.type.toLowerCase(), 
      context.pattern.location
    );

    let targetTriples: (ITargetTriplePattern | Triple)[] = context.pattern.target;
    const state = <IOperatorState> context.state;

    // Add back a triple when no target is specified
    if (context.pattern.target.length === 0) {
      targetTriples = [ sampleRandom(this.rng, state.removedTps) ];
    }

    // The triple patterns are no longer a removed pattern
    state.removedTps = state.removedTps.filter(
      tp => !targetTriples.some(triple => tripleEquals(tp, targetToTriple(triple, this.DF))),
    );

    this.addTargetToBgp(
      bgpToRefine,
      targetTriples,
      context.query,
      context.variableMapping,
      state,
    );
  }

  private addSub(context: IRefinementContext){
    const pattern = <ISubRefinementPattern> context.pattern;

    const toReplace: string = context.variableMapping[pattern.target.value].value;
    const toReplaceWith: string = context.alternativeMapping[pattern.target.value].value;

    context.query.where = substitutePatterns(context.query.where!, toReplace, toReplaceWith);

    const subStateTarget = (<Record<string, IOperatorStateSub>> context.state)[pattern.target.value];
    subStateTarget.active = true;
    subStateTarget.nCalls++;
  }

  private removeSub(context: IRefinementContext){
    const pattern = <ISubRefinementPattern> context.pattern;

    const toReplaceWith: string = context.variableMapping[pattern.target.value].value;
    const toReplace: string = context.alternativeMapping[pattern.target.value].value;

    context.query.where = substitutePatterns(context.query.where!, toReplace, toReplaceWith);

    const subStateTarget = (<Record<string, IOperatorStateSub>> context.state)[pattern.target.value];
    subStateTarget.active = false;
    subStateTarget.nCalls++;
  }

  private getBgpSafely(context: IRefinementContext, operatorType: string, location: number): BgpPattern {
    const bgp = context.operatorToBgp[operatorType]?.[location];
    if (!bgp) {
      throw new Error(`BGP Doesn't exist at index ${location} for query operator ${operatorType}`);
    }
    return bgp;
  }

  private cleanUpUnusedVariables(context: IRefinementContext): void {
    if (this.hasWildCard(context.query.variables)) return;

    const triplePatternsLeft = Object.values(context.operatorToBgp)
      .map(bgps => bgps.map(bgp => bgp.triples))
      .flat(2);
    const variablesLeftInQuery = this.getAllVariables(triplePatternsLeft);

    context.query.variables = context.query.variables.filter((x) => {
      if ('expression' in x) {
        const varsInExpression = getVariablesInExpression(x.expression);
        // Convert Set to Array to utilize .every()
        return [...varsInExpression].every(v => variablesLeftInQuery.has(v));
      }
      return true;
    });
  }

  public findValidRefinementPatterns(
    operatorTriplePatterns: Record<string, Triple[][]>,
    operatorExpressions: Record<string, Expression[][]>,
    refinementPatterns: IQueryRefinementPattern[],
    refinementState: IRefinementState,
    variableMapping: Record<string, RDF.Term>,
  ): IQueryRefinementPattern[] {
    const operatorTriplePatternsFlattened = flattenOperators(operatorTriplePatterns);
    // Const totalTriples = this.countFlattened(operatorTriplePatternsFlattened);

    const operatorExpressionsFlattened = flattenOperators(operatorExpressions);
    const totalExpressions = countFlattened(operatorExpressionsFlattened);

    const queryTriples = Object.values(operatorTriplePatterns).flat(2);
    const queryExpressions = Object.values(operatorExpressions).flat(2);
    const variablesInQuery = this.getAllVariables(queryTriples);

    return refinementPatterns.filter((pattern) => {
      if (pattern.type === 'FILTER') {
        return this.isValidFilterPattern(pattern, {
          queryExpressions,
          operatorExpressionsFlattened,
          refinementState,
          totalExpressions,
          variableMapping,
          variablesInQuery,
        });
      }
      if (pattern.type === 'SUB') {
        const subState = refinementState[typeToKeyMap[pattern.type]];
        const stateTargetVariable = subState[pattern.target.value];
        if (!stateTargetVariable) {
          throw new Error('Passed substitution pattern with target variable that can not be substituted');
        }
        if (stateTargetVariable.nCalls > 0 && pattern.operation === 'addition') {
          return false;
        }
        if (!stateTargetVariable.active && pattern.operation === 'removal') {
          return false;
        }
        return true;
      }
      if (pattern.type === 'UNION') {
        return this.isValidUnionPattern(pattern, {
          queryTriples,
          operatorTriplePatternsFlattened,
          refinementState,
          variableMapping,
        });
      }
      return this.isValidTriplePattern(pattern, {
        queryTriples,
        operatorTriplePatternsFlattened,
        refinementState,
        variableMapping,
      });
    });
  }

  private isValidFilterPattern(
    pattern: IFilterRefinementPattern,
    context: {
      queryExpressions: Expression[];
      operatorExpressionsFlattened: Record<string, Expression[]>;
      refinementState: IRefinementState;
      totalExpressions: number;
      variableMapping: Record<string, RDF.Term>;
      variablesInQuery: Set<string>;
    },
  ): boolean {
    const patternType = pattern.type.toLowerCase();
    const targets = pattern.target.map(
      x => recurseExpression(
        x,
        this.instantiateTerm,
        { variableMapping: context.variableMapping },
        this.instantiateSyntaxTreeRecurse,
      ),
    );

    const alreadyPresent = targets.length > 0 && targets.every(t =>
      context.queryExpressions.some(q => expressionEquals(t, q)));

    // Duplicate expressions cannot be added
    if (alreadyPresent && pattern.operation === 'addition') {
      return false;
    }

    // Filter requires all variables in the filter to also be in the query body
    if (pattern.operation === 'addition') {
      const allVarsPresent = targets.every((expr) => {
        const vars = getVariablesInExpression(expr);
        return vars.size > 0 && [ ...vars ].every(v => context.variablesInQuery.has(v));
      });
      return allVarsPresent;
    }

    if (pattern.operation === 'removal') {
      if (targets.length === 0) {
        return context.operatorExpressionsFlattened[patternType]?.length > 1;
      }
      // Require all expressions in target to be present in query
      const opExps = context.operatorExpressionsFlattened[patternType];
      return opExps && targets.every(t => opExps.some(e => expressionEquals(t, e)));
    }

    // If not already present and we have a target we can always add the filter
    if (targets.length > 0) {
      return true;
    }
    return context.refinementState[typeToKeyMap[pattern.type]].removedExp.length > 0;
  }

  private isValidUnionPattern(
    pattern: IUnionRefinementPattern,
    context: {
      queryTriples: Triple[];
      operatorTriplePatternsFlattened: Record<string, Triple[]>;
      refinementState: IRefinementState;
      variableMapping: Record<string, RDF.Term>;
    },
  ): boolean {
    // Function checks if each sub-target is valid for UNION, if so the UNION pattern is also valid
    for (const subTarget of pattern.target) {
      const subRefinementPattern: IOtherRefinementPattern = {
        ...pattern,
        type: 'OPTIONAL',
        target: subTarget,
      };
      if (!this.isValidTriplePattern(subRefinementPattern, { ...context, patternTypeOverride: 'UNION' })) {
        return false;
      }
    }
    return true;
  }

  private isValidTriplePattern(
    pattern: IOtherRefinementPattern,
    context: {
      queryTriples: Triple[];
      operatorTriplePatternsFlattened: Record<string, Triple[]>;
      refinementState: IRefinementState;
      variableMapping: Record<string, RDF.Term>;
      patternTypeOverride?: string;
    },
  ): boolean {
    let patternType = pattern.type.toLowerCase();
    if (context.patternTypeOverride) {
      patternType = context.patternTypeOverride.toLowerCase();
    }

    const targets = pattern.target.map(t =>
      processTriple(targetToTriple(t, this.DF), this.instantiateTerm, { variableMapping: context.variableMapping }));

    // Const targets = pattern.target.map(t =>
    //   this.instantiateTriple(this.targetToTriple(t), context.variableMapping));

    const alreadyPresent = targets.length > 0 && targets.every(t =>
      context.queryTriples.some(q => tripleEquals(q, t)));

    if (alreadyPresent && pattern.operation === 'addition') {
      return false;
    }

    if (pattern.operation === 'removal') {
      // If we have no target the operator should have atleast 2 entries
      if (targets.length === 0) {
        return context.operatorTriplePatternsFlattened[patternType]?.length > 1;
      }

      // If we want to remove a triple pattern from the query it shouldn't leave an empty one
      if (patternType === 'bgp' &&
        context.operatorTriplePatternsFlattened[patternType].length - targets.length <= 0) {
        return false;
      }

      const opTriples = context.operatorTriplePatternsFlattened[patternType];
      return opTriples && targets.every(t =>
        opTriples.some(tp => tripleEquals(targetToTriple(t, this.DF), tp)));
    }

    if (targets.length > 0) {
      return true;
    }
    // UNION targets can be empty to allow updates to only one part of the union operator
    if (targets.length === 0 && patternType === 'union') {
      return true;
    }
    return context.refinementState[typeToKeyMap[pattern.type]].removedTps.length > 0;
  }

  private isVariable(term: any): term is VariableTerm {
    return isRDFTerm(term) && term.termType === 'Variable';
  }

  private hasWildCard(variables: Variable[] | [Wildcard]): variables is [Wildcard] {
    return variables.some(term => term instanceof Wildcard);
  }

  private getAllVariables(triples: Triple[]): Set<string> {
    const variables = new Set<string>();

    for (const triple of triples) {
      const { subject, predicate, object } = triple;

      for (const term of [ subject, predicate, object ]) {
        if (this.isVariable(term)) {
          variables.add(term.value);
        }
      }
    }
    return variables;
  }

  private hasVariable(variables: Variable[] | [Wildcard], variable: VariableTerm): boolean {
    return variables.some(bgpVariable => 'termType' in bgpVariable &&
      bgpVariable.termType === 'Variable' && variable.value === bgpVariable.value);
  }

  private updateVariablesQuery(query: SelectQuery, instantiatedTriple: Triple): Variable[] | [Wildcard] {
    if (query.group) {
      return query.variables;
    }
    // If a wildcard is in the variables, we don't need to add the new variables to the triple,
    // as it will select all variables in the query. If group by we can only project grouped
    // variables, so we don't change them
    if (query.variables.some(term => term instanceof Wildcard) || query.group) {
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
    state: IOperatorState,
  ): void {
    for (const target of targets) {
      const targetTriple = targetToTriple(target, this.DF);
      if (!hasTriple(bgp, targetTriple)) {
        const instantiatedTriple = processTriple(
          targetTriple,
          this.instantiateTerm,
          { variableMapping },
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
  ): Triple[] {
    const removedTriplePatterns: Triple[] = [];
    for (const target of targets) {
      // Instantiate the triple to map variables to terms (as is also done in the query)
      const instantiatedTriple = processTriple(target, this.instantiateTerm, { variableMapping });
      // Check if the target triple pattern is already added
      if (hasTriple(bgp, instantiatedTriple)) {
        // If it is, remove the triple from the BGP
        bgp.triples = bgp.triples.filter(t =>
          !tripleEquals(t, instantiatedTriple));
        removedTriplePatterns.push(instantiatedTriple);
      }
    }
    return removedTriplePatterns;
  }

  private initializeEmptyOperatorState(): IOperatorState {
    return {
      addedTps: [],
      removedTps: [],
      addedExp: [],
      removedExp: [],
    };
  }

  public updateCounter(variable: string, value: string): void {
    if (!this.instantiationCounts[variable]) {
      this.instantiationCounts[variable] = {};
    }
    if (!this.instantiationCounts[variable][value]) {
      this.instantiationCounts[variable][value] = 0;
    }
    this.instantiationCounts[variable][value]++;
  }

  public getInstantiationCounts(): Record<string, Record<string, number>> {
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
  stateSubstitution: Record<string, IOperatorStateSub>;
}

export interface IOperatorState {
  addedTps: Triple[];
  removedTps: Triple[];
  addedExp: Expression[];
  removedExp: Expression[];
}

export interface IOperatorStateSub {
  original: RDF.Term;
  nCalls: number;
  active: boolean;
}

export interface IAlternativeVariableMappings {
  variableMapping: Record<string, RDF.Term>;
  alternativeMapping: Record<string, RDF.Term>;
}

/**
 * Interface holding parameters required to apply refinement pattern
 */
export interface IRefinementContext {
  /**
   * The original query
   */
  query: SelectQuery;
  /**
   * The refinement pattern to apply
   */
  pattern: IQueryRefinementPattern;
  /**
   * Mapping of variable to possible instantiation values
   */
  variableMapping: Record<string, RDF.Term>;
  /**
   * Alternative mapping of variable to possible instantiation values,
   * used to substitute the instantiation value
   */
  alternativeMapping: Record<string, RDF.Term>;
  /**
   * Mapping operators to their associated BGP
   */
  operatorToBgp: Record<string, BgpPattern[]>;
  /**
   * Mapping operators to their associated Expression
   */
  operatorToExpression: Record<string, Expression[]>;
  /**
   * State object of refinement sequence. Specifically what
   * refinement patterns were applied before it
   */
  state: IOperatorState | Record<string, IOperatorStateSub>;
}


export const typeToKeyMap = <const> {
  // eslint-disable-next-line ts/naming-convention
  BGP: 'stateQuery',
  // eslint-disable-next-line ts/naming-convention
  FILTER: 'stateFilter',
  // eslint-disable-next-line ts/naming-convention
  OPTIONAL: 'stateOptional',
  // eslint-disable-next-line ts/naming-convention
  UNION: 'stateUnion',
  // eslint-disable-next-line ts/naming-convention
  SUB: 'stateSubstitution',
};
