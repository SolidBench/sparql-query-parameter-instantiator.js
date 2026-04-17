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


export function extractTriplePatternsPerOperator(
  patterns: Pattern[],
): Record<string, Triple[][]> {
  const bgpsPerOperator: Record<string, BgpPattern[]> = {};
  extractBgpPerOperator(patterns, bgpsPerOperator, 'bgp');

  const triplesPerOperator: Record<string, Triple[][]> = {};
  for (const operator in bgpsPerOperator) {
    triplesPerOperator[operator] = bgpsPerOperator[operator].map(bgp => bgp.triples);
  }
  return triplesPerOperator;
}

export function extractBgpPerOperator(
  patterns: Pattern[],
  bgpsPerOperator: Record<string, BgpPattern[]>,
  previousOperator: 'bgp' | 'union' | 'optional',
): void {
  for (const pattern of patterns) {
    switch (pattern.type) {
      case 'group':
        extractBgpPerOperator(pattern.patterns, bgpsPerOperator, previousOperator);
        break;

      case 'query':
        if (pattern.where) {
          extractBgpPerOperator(pattern.where, bgpsPerOperator, 'bgp');
        }
        break;

      case 'bgp':
        if (!bgpsPerOperator[previousOperator]) {
          bgpsPerOperator[previousOperator] = [];
        }
        bgpsPerOperator[previousOperator].push(pattern);
        break;

      case 'union': {
        if (!bgpsPerOperator.union) {
          bgpsPerOperator.union = [];
        }
        const nestedUnions = pattern.patterns.filter(x => x.type === 'union');
        // Ensure we account for *each* branch in the UNION, even if empty
        for (const branch of pattern.patterns) {
          // For nested unions with no other patterns or empty union we add an empty bgp to the
          // output, to represent the left-right structure of UNION.
          if (branch.type === 'union' || (branch.type === 'group' && branch.patterns.length === 0)) {
            bgpsPerOperator.union.push({
              type: 'bgp',
              triples: [],
            });
          } else {
            extractBgpPerOperator([ branch ], bgpsPerOperator, 'union');
          }
        }
        if (nestedUnions.length > 0) {
          extractBgpPerOperator(nestedUnions, bgpsPerOperator, 'union');
        }
        break;
      }
      case 'optional':
        if (!bgpsPerOperator.optional) {
          bgpsPerOperator.optional = [];
        }
        extractBgpPerOperator(pattern.patterns, bgpsPerOperator, 'optional');
        break;

      case 'filter':
        break;

      default:
        break;
    }
  }
}

export function extractExpressionPerOperator(
  patterns: Pattern[],
  expressionsPerOperator: Record<string, Expression[]>,
  previousOperator: 'filter',
): void {
  for (const pattern of patterns) {
    switch (pattern.type) {
      case 'query':
        if (pattern.where) {
          extractExpressionPerOperator(pattern.where, expressionsPerOperator, previousOperator);
        }
        break;

      case 'group':
      case 'union':
      case 'optional':
      case 'graph':
      case 'minus':
      case 'service':
        extractExpressionPerOperator(pattern.patterns, expressionsPerOperator, previousOperator);
        break;

      case 'filter':
        if (!expressionsPerOperator[previousOperator]) {
          expressionsPerOperator[previousOperator] = [];
        }
        expressionsPerOperator[previousOperator].push(pattern.expression);
        break;

      default:
        break;
    }
  }
}

export function getVariablesInExpression(expr: Expression): Set<string> {
  const variables = new Set<string>();

  function recurse(e: Expression | Term | any): void {
    if (!e) {
      return;
    }

    // Handle arrays (like args in operations)
    if (Array.isArray(e)) {
      for (const item of e) {
        recurse(item);
      }
      return;
    }

    // Handle different expression types
    switch (e.type) {
      case 'operation':
        // Handle operation arguments
        if (e.args && Array.isArray(e.args)) {
          for (const arg of e.args) {
            recurse(arg);
          }
        }
        break;

      case 'functionCall':
        // Handle function calls with arguments
        if (e.args && Array.isArray(e.args)) {
          for (const arg of e.args) {
            recurse(arg);
          }
        }
        break;

      case 'term':
        // Handle term expressions
        if (e.term) {
          recurse(e.term);
        }
        break;

      case 'variable':
        // Direct variable reference
        if (e.value) {
          variables.add(e.value.startsWith('?') ? e.value.slice(1) : e.value);
        }
        break;

      case 'aggregate':
        // Handle aggregates (COUNT, SUM, etc.)
        if (e.expression) {
          recurse(e.expression);
        }
        if (e.separator) {
          recurse(e.separator);
        }
        break;

      case 'namedExpression':
        // Handle named expressions (AS clauses)
        if (e.expression) {
          recurse(e.expression);
        }
        break;

      case 'exists':
      case 'notexists':
        // Handle EXISTS and NOT EXISTS
        if (e.input) {
          // This would need more complex handling for graph patterns
          // For now, just try to recurse if it's an expression
          recurse(e.input);
        }
        break;

      default:
        // Handle direct Term objects (Variable, Literal, NamedNode, etc.)
        if (e.termType === 'Variable') {
          const varName = e.value;
          variables.add(varName.startsWith('?') ? varName.slice(1) : varName);
        }

        // Handle other potential nested structures
        if (e.left) {
          recurse(e.left);
        }
        if (e.right) {
          recurse(e.right);
        }
        if (e.expression) {
          recurse(e.expression);
        }
        if (e.args) {
          recurse(e.args);
        }
        break;
    }
  }

  recurse(expr);
  return variables;
}


export function targetToTriple(target: ITargetTriplePattern | Triple, DF: DataFactory): Triple {
  if (isRdfJsTriple(target)) {
    return target;
  }

  if (target.subject.termType === 'literal') {
    throw new Error('Literal subject is invalid');
  }
  if (target.predicate.termType === 'literal') {
    throw new Error('Literal predicate is invalid');
  }
  return {
    subject: toTermNoLiteral(target.subject, DF),
    predicate: toTermNoLiteral(target.predicate, DF),
    object: toTerm(target.object, DF),
  };
}

export function isRDFTerm(term: any): term is Term {
  // eslint-disable-next-line ts/no-unsafe-return
  return term && typeof term.termType === 'string' && typeof term.value === 'string' &&
  'equals' in term;
}

export function isVariable(term: any): term is VariableTerm {
  return isRDFTerm(term) && term.termType === 'Variable';
}


export function getAllVariables(triples: RDF.Quad[]): Set<string> {
  const variables = triples.flatMap((triple) => getVariables(getTerms(triple)));
  return new Set(variables.map((v) => v.value));
}

export function isRdfJsTriple(obj: any): obj is Triple {
  // eslint-disable-next-line ts/no-unsafe-return
  return obj &&
    typeof obj === 'object' &&
    obj.subject?.termType !== undefined &&
    obj.subject?.equals !== undefined &&
    obj.predicate?.termType !== undefined &&
    obj.predicate?.equals !== undefined &&
    obj.object?.termType !== undefined &&
    obj.object?.equals !== undefined;
}

export function toTerm(value: ITargetTriplePatternTerm, DF: DataFactory): RDF.Variable | RDF.NamedNode | RDF.Literal {
  if (value.termType === 'variable') {
    return DF.variable(value.value);
  }
  if (value.termType === 'namedNode') {
    return DF.namedNode(value.value);
  }
  return DF.literal(value.value);
}

export function toTermNoLiteral(value: ITargetTriplePatternTerm, DF: DataFactory): RDF.Variable | RDF.NamedNode {
  const termType = value.termType.toLowerCase();
  if (termType === 'variable') {
    return DF.variable(value.value);
  }
  if (termType === 'literal') {
    throw new Error('Literal term is invalid');
  }
  return DF.namedNode(value.value);
}

export function tripleEquals(a: Triple, b: Triple): boolean {
  return a.subject.equals(b.subject) &&
         rdfTermEquals(a.predicate, b.predicate) &&
         a.object.equals(b.object);
}

// Check equality of values that are either terms or property paths
export function rdfTermEquals(a: Term | PropertyPath, b: Term | PropertyPath): boolean {
  if (hasEquals(a) && hasEquals(b)) {
    return a.equals(b);
  }
  // If both are propertyPaths we require recursive equality check
  if (!hasEquals(a) && !hasEquals(b)) {
    return propertyPathEquals(a, b);
  }
  return false;
}

export function hasEquals(item: any): item is Term {
  return 'equals' in item;
}

export function propertyPathEquals(a: PropertyPath, b: PropertyPath): boolean {
  if (a.type !== b.type) {
    return false;
  }

  if (a.pathType !== b.pathType) {
    return false;
  }

  if (a.items.length !== b.items.length) {
    return false;
  }

  return a.items.every((item, index) => {
    const otherItem = b.items[index];
    const hasEqualsI = hasEquals(item);
    const hasEqualsOI = hasEquals(otherItem);
    if (hasEqualsI && hasEqualsOI) {
      return item.equals(otherItem);
    }
    if (!hasEqualsI && !hasEqualsOI) {
      return propertyPathEquals(item, otherItem);
    }
    return false;
  });
}


export function hasTriple(bgp: BgpPattern, triple: Triple): boolean {
  if (bgp.type !== 'bgp') {
    throw new Error(`Expected a BGP pattern, but got ${String(bgp.type)}`);
  }
  return bgp.triples.some(t => tripleEquals(t, triple));
}

export function flattenOperators<T>(ops: Record<string, T[][]>): Record<string, T[]> {
  return Object.fromEntries(Object.entries(ops).map(([ k, v ]) => [ k, v.flat() ]));
}

export function countFlattened<T>(ops: Record<string, T[]>): number {
  return Object.values(ops).reduce((sum, items) => sum + items.length, 0);
}
