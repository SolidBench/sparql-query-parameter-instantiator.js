import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type {
  BlankTerm,
  IriTerm,
  QuadTerm,
  SparqlQuery,
  Variable,
  VariableExpression,
  VariableTerm,
  SelectQuery,
  PropertyPath,
  Term,
} from 'sparqljs';
import { Generator } from 'sparqljs';
import type { TermCallback } from './utils/SyntaxTreeUtils';
import { recurseExpression, recursePatterns } from './utils/SyntaxTreeUtils';
import type { IValueTransformer } from './valuetransformer/IValueTransformer';

/**
 * Data object for a query template.
 */
export class QueryTemplate {
  private readonly syntaxTree: SparqlQuery;
  private readonly variableMappings: Record<string, RDF.Term[]>;
  private readonly iriTransformer?: IValueTransformer;

  // eslint-disable-next-line ts/naming-convention
  private readonly DF: DataFactory = new DataFactory();

  public constructor(
    syntaxTree: SparqlQuery,
    variableMappings: Record<string, RDF.Term[]>,
    prefixStringTransformer?: IValueTransformer,
  ) {
    this.syntaxTree = syntaxTree;
    this.variableMappings = variableMappings;
    this.iriTransformer = prefixStringTransformer;
  }

  /**
   * Instantiate this template for the given counter value.
   * This counter value is used to determine what variable value should be used.
   * @param counter The current counter value.
   */
  public instantiate(counter: number): string {
    // Determine variables to instantiate with
    const variableMapping: Record<string, RDF.Term> = {};
    for (const variable of Object.keys(this.variableMappings)) {
      const values = this.variableMappings[variable];
      if (values.length <= counter) {
        throw new Error(`Attempted to instantiate a query template more than the number of provided subsitution parameters (${values.length})`);
      }
      variableMapping[variable] = values[counter];
    }

    // Instantiate syntax tree
    return new Generator().stringify(this.instantiateSyntaxTreeWrap(this.syntaxTree, variableMapping));
  }

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

    // Remove variables
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
        .map(group => (
          {
            expression: recurseExpression(group.expression, termCallback, context, this.instantiateSyntaxTreeRecurse),
          }
        ));
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
}
