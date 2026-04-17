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
import type * as RDF from '@rdfjs/types';
import { ITargetTriplePattern, ITargetTriplePatternTerm } from '../QuerySequenceTemplateProvider';
import { DataFactory } from 'rdf-data-factory';
import { getTerms, getVariables } from 'rdf-terms';

export function substitutePatterns(patterns: Pattern[], oldValue: string, newValue: string): Pattern[] {
  // eslint-disable-next-line array-callback-return
  return patterns.map((pattern) => {
    pattern = { ...pattern };
    switch (pattern.type) {
      case 'query':
        pattern.where = substitutePatterns(pattern.where!, oldValue, newValue);
        return pattern;
      case 'bgp':
      case 'graph':
        if ('triples' in pattern) {
          return {
            type: 'bgp',
            triples: pattern.triples.map(triple => substituteTriple(triple, oldValue, newValue)),
          };
        }
        return {
          type: 'graph',
          name: pattern.name,
          patterns: substitutePatterns(pattern.patterns, oldValue, newValue),
        };
      case 'union':
      case 'group':
      case 'optional':
      case 'minus':
      case 'service':
        return {
          ...pattern,
          patterns: substitutePatterns(pattern.patterns, oldValue, newValue),
        };
      case 'filter':
      case 'bind':
        return {
          ...pattern,
          expression: substituteExpression(pattern.expression, oldValue, newValue),
        };
      case 'values':
        return pattern;
    }
  });
}

export function substituteExpression(expression: Expression, oldValue: string, newValue: string): Expression {
  if ('type' in expression) {
    switch (expression.type) {
      case 'group':
      case 'graph':
        return <Expression> {
          ...expression,
          patterns: substitutePatterns(expression.patterns, oldValue, newValue),
        };
      case 'bgp':
        return <Expression> {
          ...expression,
          triples: expression.triples.map(triple => substituteTriple(triple, oldValue, newValue)),
        };
      case 'operation':
      case 'functionCall':
        return {
          ...expression,
          args: expression.args.map(arg => substituteExpression(arg, oldValue, newValue)),
        };
      case 'aggregate':
        return {
          ...expression,
          expression: substituteExpression(expression.expression, oldValue, newValue),
        };
    }
  } else {
    return <Expression> substituteTerm(<Term> expression, oldValue, newValue);
  }
}

export function substituteTriple(triple: Triple, oldValue: string, newValue: string): Triple {
  return {
    subject: <any> substituteTerm(triple.subject, oldValue, newValue),
    predicate: <any> substituteTerm(triple.predicate, oldValue, newValue),
    object: <any> substituteTerm(triple.object, oldValue, newValue),
  };
}

export function substituteTerm<T extends IriTerm | BlankTerm | VariableTerm | QuadTerm | PropertyPath | Term>(
  term: T,
  oldValue: string,
  newValue: string,
): T | RDF.Term {
  if ('termType' in term && (<RDF.Term> term).termType === 'NamedNode') {
    const termValue = (<VariableTerm> term).value;
    if (termValue === oldValue) {
      term.value = newValue;
    }
  }
  return term;
}