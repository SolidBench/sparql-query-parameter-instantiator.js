import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type {
  SelectQuery,
  SparqlQuery,
  VariableTerm,
  IriTerm,
  BlankTerm,
  QuadTerm,
  PropertyPath,
  Variable,
} from 'sparqljs';
import { Generator } from 'sparqljs';
import type { Logger } from 'winston';
import { logger } from '../logging/logger';
import type { ValueTransformerCsvMap } from '../valuetransformer/ValueTransformerCsvMap';
import type { TermCallback } from './../utils/SyntaxTreeUtils';
import { recurseExpression, recursePatterns } from './../utils/SyntaxTreeUtils';
import type { QLeverInstance } from './QLeverInstance';

export class QueryNextInstantiatorValue {
  protected readonly termMappingTransformerFragmentedToOrginal: ValueTransformerCsvMap;
  protected readonly termMappingTransformerOriginalToFragmented: ValueTransformerCsvMap;
  protected readonly transformers: TermTransformerBiDirectional[];

  protected indexedFiles = false;

  protected dataFactory = new DataFactory();

  protected qLever: QLeverInstance;
  private readonly log: Logger;

  public constructor(args: IQueryNextInstantiatorValueArgs) {
    this.termMappingTransformerFragmentedToOrginal = args.termMappingTransformerFragmentedToOriginal;
    this.termMappingTransformerOriginalToFragmented = args.termMappingTransformerOriginalToFragmented;
    this.transformers = args.transformers;

    this.qLever = args.qLever;
    this.log = logger.child({ module: 'QueryNextInstantiatorValue' });
  }

  /**
   * Query the centralized data to find possible next instantiation values given
   * the previous query
   * @param query Previous query's AST
   * @param outputToInstantiationVariables Mapping mapping output variables of previous queries
   * to the variables that need to be instantiated in the next query
   * @returns possible instantiation values
   */
  public async getNextQueryInstantiationValues(
    query: SelectQuery,
    outputToInstantiationVariables: Record<string, string[]>,
  ): Promise<IQueryInstantiationValuesQLever> {
    // Transform query to original centralized data and ensure that the required variables for
    // next query are present in the SELECT clause
    const transformedQuery = this.transformQuery(query, Object.keys(outputToInstantiationVariables));
    const { message, results } = await this.qLever.executeQuery(new Generator().stringify(transformedQuery));

    if (message === 'TIMEOUT') {
      this.log.warn('Query timed out.');
    }

    // Record mapping variables that should be instantiated to possible values
    const instantiationValues: Record<string, RDF.Term[]> = {};
    for (const [ outputVariable, instantiationVariables ] of Object.entries(outputToInstantiationVariables)) {
      // Get all bindings that have a result for this variable and convert them to fragmented version
      const resultsForVariable = results.reduce<RDF.Term[]>((acc, binding) => {
        let value = binding.get(outputVariable);
        if (value !== undefined) {
          value = this.termMappingTransformerOriginalToFragmented.transform(value);
          for (const transformerIri of this.transformers) {
            value = transformerIri.transformOriginalToFragmented(value);
          }
          acc.push(value);
        }
        return acc;
      }, []);
      for (const instantiationVariable of instantiationVariables) {
        instantiationValues[instantiationVariable] = resultsForVariable;
      }
    }
    return { instantiationValues };
  }

  protected transformQuery(query: SelectQuery, requiredSelectVariables: string[]): SelectQuery {
    const transformedQuery = this.transformSyntaxTreeRecurse(
      query,
      this.transformTerm,
      { requiredSelectVariables },
    );
    return transformedQuery;
  }

  protected transformPropertyPath(path: PropertyPath, context: Record<string, any>): PropertyPath {
    return {
      ...path,
      // Map over every item in the path (whether it's an IRI or a nested PropertyPath)
      // and route it back through the main instantiator.
      items: path.items.map(item => <IriTerm | PropertyPath> this.transformTerm(item, context)),
    };
  }

  private readonly transformTerm = <
    T extends IriTerm | BlankTerm | VariableTerm | QuadTerm | PropertyPath | RDF.Term,
  >(
    term: T,
    context: Record<string, any>,
  ): T | RDF.Term => {
    if (term && typeof term === 'object' && 'termType' in term && (<RDF.Term>term).termType === 'NamedNode') {
      let transformed = <RDF.Term> term;
      transformed = this.termMappingTransformerFragmentedToOrginal.transform(transformed);
      for (const transformerIri of this.transformers) {
        transformed = transformerIri.transformFragmentedToOriginal(transformed);
      }
      return transformed;
    }
    if (term && typeof term === 'object' && 'pathType' in term) {
      return <T> this.transformPropertyPath(term, context);
    }

    return term;
  };

  private readonly transformSyntaxTreeRecurse = (
    syntaxTree: SparqlQuery,
    termCallback: TermCallback,
    context: Record<string, any>,
  ): SelectQuery => {
    // Only allow SELECT queries
    if (syntaxTree.type !== 'query' || syntaxTree.queryType !== 'SELECT') {
      throw new Error(`Only instantiations of SELECT queries are supported`);
    }

    // Update prefixes. These don't require the mappingTransformer as this is only
    // for fragmented subjects
    syntaxTree = { ...syntaxTree };

    syntaxTree.prefixes = Object.fromEntries(
      Object.entries(syntaxTree.prefixes).map(([ prefix, iri ]) => {
        // Logic: Add a slash to the end of every IRI if it's missing
        let transformed = iri;
        for (const tranformerIri of this.transformers) {
          transformed = tranformerIri.transformFragmentedToOriginalRaw(transformed);
        }
        return [ prefix, transformed ];
      }),
    );

    // Apply expressions in variables
    syntaxTree.variables = <any> syntaxTree.variables.map((variable) => {
      if ('expression' in variable) {
        variable.expression = recurseExpression(
          variable.expression,
          termCallback,
          context,
          this.transformSyntaxTreeRecurse,
        );
      }
      return variable;
    });

    // Select variables required for this query
    const requiredSelectVariables: string[] = context.requiredSelectVariables;

    // If wildcard no action is required
    const isWildcard = syntaxTree.variables.length === 1 &&
    ('termType' in syntaxTree.variables[0] && (<any> syntaxTree.variables[0]).termType === 'Wildcard');

    if (!isWildcard) {
      const currentVariables = <Variable[]> syntaxTree.variables;

      const existingNames = new Set(currentVariables.map(v => 'variable' in v ? v.variable.value : v.value));

      for (const reqVar of requiredSelectVariables) {
        if (!existingNames.has(reqVar)) {
          currentVariables.push(this.dataFactory.variable(reqVar));
        }
      }
    }

    // Handle where clause in a recursive manner
    syntaxTree.where = recursePatterns(syntaxTree.where!, termCallback, context, this.transformSyntaxTreeRecurse);

    // Handle GROUP BY
    if (syntaxTree.group) {
      syntaxTree.group = syntaxTree.group
        .map(group => ({
          expression: recurseExpression(
            group.expression,
            termCallback,
            context,
            this.transformSyntaxTreeRecurse,
          ),
        }));
    }

    return syntaxTree;
  };

  public getQLeverReadyStatus(): Promise<void> {
    return this.qLever.getReadyStatus();
  }
}

export class TermTransformerBiDirectional {
  private readonly originalExp: RegExp;
  private readonly originalString: string;
  private readonly fragmentedExp: RegExp;
  private readonly fragmentedString: string;

  private readonly dataFactory = new DataFactory();

  public constructor(args: ITermTransformerArgs) {
    this.originalExp = new RegExp(args.originalRegex, 'u');
    this.originalString = args.originalString;
    this.fragmentedExp = new RegExp(args.fragmentedRegex, 'u');
    this.fragmentedString = args.fragmentedString;
  }

  public transformOriginalToFragmented(term: RDF.Term): RDF.Term {
    if (term.termType === 'NamedNode') {
      const value = this.transformOriginalToFragmentedRaw(term.value);
      return this.dataFactory.namedNode(value);
    }
    return term;
  }

  public transformFragmentedToOriginal(term: RDF.Term): RDF.Term {
    if (term.termType === 'NamedNode') {
      const value = this.transformFragmentedToOriginalRaw(term.value);
      return this.dataFactory.namedNode(value);
    }
    return term;
  }

  public transformFragmentedToOriginalRaw(value: string): string {
    return value.replace(this.fragmentedExp, this.originalString);
  }

  public transformOriginalToFragmentedRaw(value: string): string {
    return value.replace(this.originalExp, this.fragmentedString);
  }
}

export interface IQueryNextInstantiatorValueArgs {
  /**
   * Mapper transforming terms which are not simple IRI replacements
   * In SolidBench these are posts / comments as the fragmentation applied determines the transformed URI)
   */
  termMappingTransformerFragmentedToOriginal: ValueTransformerCsvMap;
  /**
   * Mapper mapping from original centralized dataset to fragmented
   */
  termMappingTransformerOriginalToFragmented: ValueTransformerCsvMap;
  /**
   * Transformers mapping (parts) of IRIs from fragmented to centralized and back.
   * Note that the order matters, as one transformer might be a more specific case of
   * another transformer. Thus, it should always go from specific to general.
   */
  transformers: TermTransformerBiDirectional[];
  /**
   * A helper class for starting, querying, and stopping a QLever instance using
   * docker
   */
  qLever: QLeverInstance;
}

export interface ITermTransformerArgs {
  originalRegex: string;
  originalString: string;
  fragmentedRegex: string;
  fragmentedString: string;
}

export interface IQueryExecutionResult {
  message: 'TIMEOUT' | 'END';
  results: RDF.Bindings[];
}

export interface IQueryInstantiationValuesQLever {
  instantiationValues: Record<string, RDF.Term[]>;
}
