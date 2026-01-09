import { QueryEngine } from '@comunica/query-sparql-file';
import type { BindingsStream } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type { ValueTransformerCsvMap } from '../valuetransformer/ValueTransformerCsvMap';
import { SelectQuery, Generator } from 'sparqljs';

export class QueryNextInstantiatorValue {
  protected readonly dataLocations: string[];
  protected readonly termMappingTransformer: ValueTransformerCsvMap;
  protected readonly transformers: TermTransformer[];

  protected readonly engine: QueryEngine;
  protected readonly timeout: number;

  public constructor(args: IQueryNextInstantiatorValueArgs) {
    this.dataLocations = args.dataLocations;
    this.termMappingTransformer = args.termMappingTransformer;
    this.transformers = args.transformers;

    this.engine = new QueryEngine();
    this.timeout = args.timeout;
  }

  public async getNextQueryInstantiationValues(query: SelectQuery) {
    const tranformedQuery = this.transformQuery(query);
    const { message, results } = await this.executeQuery(
        new Generator().stringify(tranformedQuery)
    );
    return results;
  }

  protected transformQuery(query: SelectQuery) {
    // TODO: Use code like the function instantiateSyntaxTree in QueryTemplate to apply an
    // array of transformers to each namedNode found in the query. Then return that query
    // Then in the follow up code we apply the array of transformers to the output bindings
    // which will be passed to the instantiator.
    return query;
  }

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
        bindingsStream.on('data', (data) => {
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
      console.error(`Query failed:`, error);
      throw error;
    } finally {
      clearTimeout(timeoutHandle!);
    }
  }
}

export class TermTransformer {
  private readonly originalExp: RegExp;
  private readonly originalString: string;
  private readonly fragmentedExp: RegExp;
  private readonly fragmentedString: string;

  private readonly DF = new DataFactory();

  public constructor(searchRegex: string, searchString: string, replacementRegex: string, replacementString: string) {
    this.originalExp = new RegExp(searchRegex, 'u');
    this.originalString = searchString;
    this.fragmentedExp = new RegExp(replacementRegex, 'u');
    this.fragmentedString = replacementString;
  }

  protected transformOriginalToFragmented(term: RDF.Term): RDF.Term {
    if (term.termType === 'NamedNode') {
      const value = term.value.replace(this.originalExp, this.fragmentedString);
      return this.DF.namedNode(value);
    }
    return term;
  }

  protected transformFragmentedToOriginal(term: RDF.Term): RDF.Term {
    if (term.termType === 'NamedNode') {
      const value = term.value.replace(this.fragmentedExp, this.originalString);
      return this.DF.namedNode(value);
    }
    return term;
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
  transformers: TermTransformer[];
  /**
   * Timeout for query execution in seconds
   */
  timeout: number;
}

export interface IQueryExecutionResult {
  message: 'TIMEOUT' | 'END';
  results: RDF.Bindings[];
}
