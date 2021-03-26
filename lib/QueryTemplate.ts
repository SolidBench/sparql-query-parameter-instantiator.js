import type * as RDF from 'rdf-js';
import type { BlankTerm,
  IriTerm,
  Pattern, QuadTerm,
  SparqlQuery,
  Triple,
  Variable,
  VariableExpression,
  VariableTerm,
  SelectQuery, PropertyPath, Term } from 'sparqljs';
import { Generator } from 'sparqljs';

/**
 * Data object for a query template.
 */
export class QueryTemplate {
  private readonly syntaxTree: SparqlQuery;
  private readonly variableMappings: Record<string, RDF.Term[]>;

  public constructor(
    syntaxTree: SparqlQuery,
    variableMappings: Record<string, RDF.Term[]>,
  ) {
    this.syntaxTree = syntaxTree;
    this.variableMappings = variableMappings;
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
    return new Generator().stringify(this.instantiateSyntaxTree({ ...this.syntaxTree }, variableMapping));
  }

  public instantiateSyntaxTree(syntaxTree: SparqlQuery, variableMapping: Record<string, RDF.Term>): SelectQuery {
    // Only allow SELECT queries
    if (syntaxTree.type !== 'query' || syntaxTree.queryType !== 'SELECT') {
      throw new Error(`Only instantiations of SELECT queries are supported`);
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

    // Handle where clause in a recursive manner
    syntaxTree.where = this.instantiatePatterns(syntaxTree.where!, variableMapping);

    return syntaxTree;
  }

  public instantiatePatterns(patterns: Pattern[], variableMapping: Record<string, RDF.Term>): Pattern[] {
    return patterns.map(pattern => {
      pattern = { ...pattern };
      switch (pattern.type) {
        case 'query':
          return this.instantiateSyntaxTree(pattern, variableMapping);
        case 'bgp':
        case 'graph':
          if ('triples' in pattern) {
            pattern.triples = pattern.triples.map(triple => this.instantiateTriple(triple, variableMapping));
          } else {
            pattern.patterns = this.instantiatePatterns(pattern.patterns, variableMapping);
          }
          return pattern;
        case 'union':
        case 'group':
        case 'optional':
        case 'minus':
        case 'service':
          pattern.patterns = this.instantiatePatterns(pattern.patterns, variableMapping);
          return pattern;
        default:
          return pattern;
      }
    });
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
}
