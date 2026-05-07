import type * as RDF from '@rdfjs/types';
import type {
  BlankTerm,
  Expression,
  IriTerm,
  Pattern,
  PropertyPath,
  QuadTerm,
  SelectQuery,
  SparqlQuery,
  Term,
  Triple,
  VariableTerm,
} from 'sparqljs';

export function recursePatterns(
  patterns: Pattern[],
  termCallback: TermCallback,
  context: Record<string, any>,
  processSyntaxTree: (syntaxTree: SparqlQuery, termCallback: TermCallback, context: Record<string, any>) => SelectQuery,
): Pattern[] {
// eslint-disable-next-line array-callback-return
  return patterns.map((pattern) => {
    pattern = { ...pattern };
    switch (pattern.type) {
      case 'query':
        return processSyntaxTree(pattern, termCallback, context);
      case 'bgp':
      case 'graph':
        if ('triples' in pattern) {
          return {
            type: 'bgp',
            triples: pattern.triples.map(triple => processTriple(triple, termCallback, context)),
          };
        }
        return {
          type: 'graph',
          name: pattern.name,
          patterns: recursePatterns(pattern.patterns, termCallback, context, processSyntaxTree),
        };
      case 'union':
      case 'group':
      case 'optional':
      case 'minus':
      case 'service':
        return {
          ...pattern,
          patterns: recursePatterns(pattern.patterns, termCallback, context, processSyntaxTree),
        };
      case 'filter':
      case 'bind':
        return {
          ...pattern,
          expression: recurseExpression(pattern.expression, termCallback, context, processSyntaxTree),
        };
      case 'values':
        return pattern;
    }
  });
}

export function recurseExpression(
  expression: Expression,
  termCallback: TermCallback,
  context: Record<string, any>,
  processSyntaxTree: (syntaxTree: SparqlQuery, termCallback: TermCallback, context: Record<string, any>) => SelectQuery,
): Expression {
  if ('type' in expression) {
    switch (expression.type) {
      case 'group':
      case 'graph':
        return <Expression> {
          ...expression,
          patterns: recursePatterns(expression.patterns, termCallback, context, processSyntaxTree),
        };
      case 'bgp':
        return <Expression> {
          ...expression,
          triples: expression.triples.map(triple => processTriple(triple, termCallback, context)),
        };
      case 'operation':
      case 'functionCall':
        return {
          ...expression,
          args: expression.args.map(arg => recurseExpression(arg, termCallback, context, processSyntaxTree)),
        };
      case 'aggregate':
        return {
          ...expression,
          expression: recurseExpression(expression.expression, termCallback, context, processSyntaxTree),
        };
    }
  } else {
    return <Expression> termCallback(<Term> expression, context);
  }
}

export function processTriple(
  triple: Triple,
  termCallback: TermCallback,
  context: Record<string, any>,
): Triple {
  return {
    subject: <any> termCallback(triple.subject, context),
    predicate: <any> termCallback(triple.predicate, context),
    object: <any> termCallback(triple.object, context),
  };
}

export type TermCallback = <T extends IriTerm | BlankTerm | VariableTerm | QuadTerm | PropertyPath | Term>(
  term: T,
  context: Record<string, any>
) => T | RDF.Term;
