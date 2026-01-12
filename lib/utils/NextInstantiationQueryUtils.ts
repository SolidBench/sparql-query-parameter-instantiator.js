import { QueryEngine } from '@comunica/query-sparql-file';
import type { BindingsStream } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type { ValueTransformerCsvMap } from '../valuetransformer/ValueTransformerCsvMap';
import { SelectQuery, Generator, SparqlQuery, VariableExpression, VariableTerm, IriTerm, BlankTerm, QuadTerm, PropertyPath } from 'sparqljs';
import { recurseExpression, recursePatterns, TermCallback } from './SyntaxTreeUtils';

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
    // TODO: 
    // Transform results back to fragmented state. Easily done by apply the transformers backwards in sequence.
    return results;
  }

  protected transformQuery(query: SelectQuery) {
    // TODO: First test if this works correctly. Then we fix next todos
    // TODO: Also transform the prefixes if they exist. Just do simple string search.
    const transformedQuery = this.transformSyntaxTreeRecurse(query, this.instantiateTerm, {});
    console.log(transformedQuery);
    console.log(query);
    return query;
  }

  private instantiateTerm = <T extends IriTerm | BlankTerm | VariableTerm | QuadTerm | PropertyPath | RDF.Term>(
    term: T,
    context: Record<string, any>,
  ): T | RDF.Term => {
    if (term && typeof term === 'object' && 'termType' in term && (<RDF.Term>term).termType === 'NamedNode') {
      let transformed = <RDF.Term> term;
      transformed = this.termMappingTransformer.transform(transformed);
      for (const transformerIri of this.transformers){
        transformed = transformerIri.transformFragmentedToOriginal(transformed);
      }
      return transformed;
    }
    return term;
  };

  private transformSyntaxTreeRecurse = (
    syntaxTree: SparqlQuery,
    termCallback: TermCallback,
    context: Record<string, any>
  ): SelectQuery => {
    // Only allow SELECT queries
    if (syntaxTree.type !== 'query' || syntaxTree.queryType !== 'SELECT') {
      throw new Error(`Only instantiations of SELECT queries are supported`);
    }

    // Apply expressions in variables
    syntaxTree.variables = <any> syntaxTree.variables.map((variable) => {
      if ('expression' in variable) {
        variable.expression = recurseExpression(variable.expression, termCallback, context, this.transformSyntaxTreeRecurse);
      }
      return variable;
    });

    // Handle where clause in a recursive manner
    syntaxTree.where = recursePatterns(syntaxTree.where!, termCallback, context, this.transformSyntaxTreeRecurse);

    // Handle GROUP BY
    if (syntaxTree.group) {
      syntaxTree.group = syntaxTree.group
        .map(group => ({ expression: recurseExpression(group.expression, termCallback, context, this.transformSyntaxTreeRecurse) }));
    }

    return syntaxTree;
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

  public transformOriginalToFragmented(term: RDF.Term): RDF.Term {
    if (term.termType === 'NamedNode') {
      const value = term.value.replace(this.originalExp, this.fragmentedString);
      return this.DF.namedNode(value);
    }
    return term;
  }

  public transformFragmentedToOriginal(term: RDF.Term): RDF.Term {
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
