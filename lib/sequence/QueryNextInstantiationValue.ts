import { QueryEngine } from '@comunica/query-sparql-file';
import type { BindingsStream } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type { SelectQuery, SparqlQuery, VariableTerm, IriTerm, BlankTerm, QuadTerm, PropertyPath } from 'sparqljs';
import { Generator } from 'sparqljs';
import type { ValueTransformerCsvMap } from '../valuetransformer/ValueTransformerCsvMap';
import type { TermCallback } from './../utils/SyntaxTreeUtils';
import { recurseExpression, recursePatterns } from './../utils/SyntaxTreeUtils';

export class QueryNextInstantiatorValue {
  protected readonly dataLocations: string[];
  protected readonly termMappingTransformer: ValueTransformerCsvMap;
  protected readonly transformers: TermTransformerBiDirectional[];

  protected readonly engine: QueryEngine;
  protected readonly timeout: number;

  protected indexedFiles = false;

  public constructor(args: IQueryNextInstantiatorValueArgs) {
    this.dataLocations = args.dataLocations;
    this.termMappingTransformer = args.termMappingTransformer;
    this.transformers = args.transformers;

    this.engine = new QueryEngine();
    this.timeout = args.timeout;
  }

  public async getNextQueryInstantiationValues(query: SelectQuery): Promise<RDF.Bindings[]> {
    // First run takes a while due to file indexing. So we prerun this
    // to avoid timeout issues
    const transformedQuery = this.transformQuery(query);
    const { message, results } = await this.executeQuery(
      new Generator().stringify(transformedQuery),
    );
    console.log(message);
    console.log(results.length);
    // TODO: Use reverse mapping for comment and post transformation, currently wrong way around
    // TODO:
    // Transform results back to fragmented state. Easily done by apply the transformers backwards in sequence.
    return results;
  }

  protected transformQuery(query: SelectQuery): SelectQuery {
    const transformedQuery = this.transformSyntaxTreeRecurse(query, this.instantiateTerm, {});
    return transformedQuery;
  }

  private readonly instantiateTerm = <
    T extends IriTerm | BlankTerm | VariableTerm | QuadTerm | PropertyPath | RDF.Term,
  >(
    term: T,
    context: Record<string, any>,
  ): T | RDF.Term => {
    if (term && typeof term === 'object' && 'termType' in term && (<RDF.Term>term).termType === 'NamedNode') {
      let transformed = <RDF.Term> term;
      transformed = this.termMappingTransformer.transform(transformed);
      for (const transformerIri of this.transformers) {
        transformed = transformerIri.transformFragmentedToOriginal(transformed);
      }
      return transformed;
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

  protected async executeQuery(query: string): Promise<IQueryExecutionResult> {
    let bindingsStream: BindingsStream;
    let timeoutHandle: NodeJS.Timeout;

    const results: RDF.Bindings[] = [];
    const timeoutPromise = new Promise<'TIMEOUT'>((resolve, _) => {
      timeoutHandle = setTimeout(() => {
        if (bindingsStream) {
          bindingsStream.destroy();
        }
        resolve('TIMEOUT');
      }, this.timeout * 1000);
    });

    const queryResults = new Promise<'END'>(async(resolve, reject) => {
      try {
        bindingsStream = await this.engine.queryBindings(query, {
          sources: this.dataLocations,
        });
        bindingsStream.on('data', (data: RDF.Bindings) => {
          results.push(data);
        });
        bindingsStream.on('end', () => {
          resolve('END');
        });
        bindingsStream.on('error', () => {
          reject(new Error(`Error execution query`));
        });
      } catch (error) {
        reject(error);
      }
    });

    try {
      const message = await Promise.race([ queryResults, timeoutPromise ]);
      return { message, results };
    } catch (error) {
      throw error;
    } finally {
      clearTimeout(timeoutHandle!);
    }
  }
}

export class TermTransformerBiDirectional {
  private readonly originalExp: RegExp;
  private readonly originalString: string;
  private readonly fragmentedExp: RegExp;
  private readonly fragmentedString: string;

  // eslint-disable-next-line ts/naming-convention
  private readonly DF = new DataFactory();

  public constructor(args: ITermTransformerArgs) {
    this.originalExp = new RegExp(args.originalRegex, 'u');
    this.originalString = args.originalString;
    this.fragmentedExp = new RegExp(args.fragmentedRegex, 'u');
    this.fragmentedString = args.fragmentedString;
  }

  public transformOriginalToFragmented(term: RDF.Term): RDF.Term {
    if (term.termType === 'NamedNode') {
      const value = this.transformOriginalToFragmentedRaw(term.value);
      return this.DF.namedNode(value);
    }
    return term;
  }

  public transformFragmentedToOriginal(term: RDF.Term): RDF.Term {
    if (term.termType === 'NamedNode') {
      const value = this.transformFragmentedToOriginalRaw(term.value);
      return this.DF.namedNode(value);
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
   * File location of the original data files
   */
  dataLocations: string[];
  /**
   * Mapper transforming terms which are not simple IRI replacements
   * In SolidBench these are posts / comments as the fragmentation applied determines the transformed URI)
   */
  termMappingTransformer: ValueTransformerCsvMap;
  /**
   * Transformers mapping (parts) of IRIs from fragmented to centralized and back
   */
  transformers: TermTransformerBiDirectional[];
  /**
   * Timeout for query execution in seconds
   */
  timeout: number;
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
