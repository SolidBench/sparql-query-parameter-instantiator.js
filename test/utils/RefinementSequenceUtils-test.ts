import { DataFactory } from 'rdf-data-factory';
import type { Expression, Pattern, PropertyPath, Term, Triple } from 'sparqljs';
import { Parser } from 'sparqljs';
import {
  countFlattened,
  extractBgpPerOperator,
  extractExpressionPerOperator,
  extractTriplePatternsPerOperator,
  flattenOperators,
  getAllVariables,
  getVariablesInExpression,
  hasEquals,
  hasTriple,
  isRDFTerm,
  isRdfJsTriple,
  isVariable,
  propertyPathEquals,
  rdfTermEquals,
  targetToTriple,
  toTerm,
  toTermNoLiteral,
  tripleEquals,
} from '../../lib/utils/RefinementSequenceUtils';

const DF = new DataFactory();

describe('RefinementSequenceUtils', () => {
  describe('extractTriplePatternsPerOperator / extractBgpPerOperator', () => {
    it('extracts BGPs by operator for nested query shapes', () => {
      const parsed = new Parser().parse(`
        SELECT * WHERE {
          ?s ?p ?o .
          OPTIONAL { ?o ?p2 ?x . }
          { ?a ?b ?c . } UNION { ?d ?e ?f . }
          { SELECT * WHERE { ?q ?r ?t . } }
        }
      `);

      const where = (parsed as any).where as Pattern[];
      expect(extractTriplePatternsPerOperator(where)).toEqual({
        bgp: [
          [{
            subject: DF.variable('s'),
            predicate: DF.variable('p'),
            object: DF.variable('o'),
          }],
          [{
            subject: DF.variable('q'),
            predicate: DF.variable('r'),
            object: DF.variable('t'),
          }],
        ],
        optional: [[{
          subject: DF.variable('o'),
          predicate: DF.variable('p2'),
          object: DF.variable('x'),
        }]],
        union: [
          [{
            subject: DF.variable('a'),
            predicate: DF.variable('b'),
            object: DF.variable('c'),
          }],
          [{
            subject: DF.variable('d'),
            predicate: DF.variable('e'),
            object: DF.variable('f'),
          }],
        ],
      });
    });

    it('handles nested unions and empty union branches', () => {
      const patterns: Pattern[] = [ {
        type: 'union',
        patterns: [
          { type: 'union', patterns: []} as any,
          { type: 'group', patterns: []} as any,
          { type: 'bgp', triples: [{
            subject: DF.variable('x'),
            predicate: DF.variable('y'),
            object: DF.variable('z'),
          }]} as any,
        ],
      } as any ];

      const out: Record<string, any[]> = {};
      extractBgpPerOperator(patterns, out as any, 'bgp');
      expect(out.union).toEqual([
        { type: 'bgp', triples: []},
        { type: 'bgp', triples: []},
        {
          type: 'bgp',
          triples: [{
            subject: DF.variable('x'),
            predicate: DF.variable('y'),
            object: DF.variable('z'),
          }],
        },
      ]);
    });

    it('ignores filter and unsupported pattern types', () => {
      const out: Record<string, any[]> = {};
      extractBgpPerOperator([
        { type: 'filter', expression: { type: 'variable', value: 'x' }} as any,
        { type: 'bind' } as any,
      ], out as any, 'bgp');
      expect(out).toEqual({});
    });
  });

  describe('extractExpressionPerOperator / getVariablesInExpression', () => {
    it('extracts filter expressions through nested blocks', () => {
      const filterA: Expression = { type: 'variable', value: 'a' } as any;
      const filterB: Expression = { type: 'variable', value: 'b' } as any;
      const filterC: Expression = { type: 'variable', value: 'c' } as any;
      const filterD: Expression = { type: 'variable', value: 'd' } as any;
      const filterE: Expression = { type: 'variable', value: 'e' } as any;
      const filterF: Expression = { type: 'variable', value: 'f' } as any;

      const patterns: Pattern[] = [ {
        type: 'query',
        where: [
          {
            type: 'group',
            patterns: [ { type: 'filter', expression: filterA } as any ],
          } as any,
          {
            type: 'union',
            patterns: [ { type: 'filter', expression: filterB } as any ],
          } as any,
          {
            type: 'optional',
            patterns: [ { type: 'filter', expression: filterC } as any ],
          } as any,
          {
            type: 'graph',
            patterns: [ { type: 'filter', expression: filterD } as any ],
          } as any,
          {
            type: 'minus',
            patterns: [ { type: 'filter', expression: filterE } as any ],
          } as any,
          {
            type: 'service',
            patterns: [ { type: 'filter', expression: filterF } as any ],
          } as any,
          { type: 'values' } as any,
        ],
      } as any ];

      const out: Record<string, Expression[]> = {};
      extractExpressionPerOperator(patterns, out, 'filter');
      expect(out.filter).toEqual([ filterA, filterB, filterC, filterD, filterE, filterF ]);
    });

    it('collects variables from many expression forms', () => {
      const expression: Expression = {
        type: 'operation',
        args: [
          { type: 'variable', value: 'fromOperation' },
          { type: 'functionCall', args: [{ type: 'variable', value: 'fromFunction' }]},
          { type: 'term', term: DF.variable('fromTerm') },
          { type: 'aggregate', expression: { type: 'variable', value: 'fromAggregate' }, separator: { type: 'variable', value: 'fromSep' }},
          { type: 'namedExpression', expression: { type: 'variable', value: 'fromNamed' }},
          { type: 'exists', input: { type: 'variable', value: 'fromExists' }},
          { type: 'notexists', input: { type: 'variable', value: 'fromNotExists' }},
          {
            termType: 'Variable',
            value: 'fromDefaultTerm',
            left: { type: 'variable', value: 'fromLeft' },
            right: { type: 'variable', value: 'fromRight' },
            expression: { type: 'variable', value: 'fromNestedExpression' },
            args: [{ type: 'variable', value: 'fromDefaultArgs' }],
          },
        ],
      } as any;

      expect(getVariablesInExpression(expression)).toEqual(new Set([
        'fromOperation',
        'fromFunction',
        'fromTerm',
        'fromAggregate',
        'fromSep',
        'fromNamed',
        'fromExists',
        'fromNotExists',
        'fromDefaultTerm',
        'fromLeft',
        'fromRight',
        'fromNestedExpression',
        'fromDefaultArgs',
      ]));
      expect(getVariablesInExpression({ type: 'variable', value: '?fromPrefixedVariable' } as any))
        .toEqual(new Set([ 'fromPrefixedVariable' ]));
      expect(getVariablesInExpression({ termType: 'Variable', value: '?fromPrefixedDefault' } as any))
        .toEqual(new Set([ 'fromPrefixedDefault' ]));
      expect(getVariablesInExpression(undefined as any)).toEqual(new Set());
      expect(getVariablesInExpression([{ type: 'variable', value: 'fromArray' }] as any)).toEqual(new Set([ 'fromArray' ]));
    });
  });

  describe('triple/term helpers', () => {
    it('converts target triples and validates literal subject/predicate', () => {
      const rdfTriple: Triple = {
        subject: DF.namedNode('ex:s'),
        predicate: DF.namedNode('ex:p'),
        object: DF.literal('o'),
      };
      expect(targetToTriple(rdfTriple, DF)).toBe(rdfTriple);

      const target = {
        subject: { termType: 'variable', value: 's' },
        predicate: { termType: 'namedNode', value: 'ex:p' },
        object: { termType: 'literal', value: 'o' },
      };
      expect(targetToTriple(target as any, DF)).toEqual({
        subject: DF.variable('s'),
        predicate: DF.namedNode('ex:p'),
        object: DF.literal('o'),
      });

      expect(() => targetToTriple({
        subject: { termType: 'literal', value: 'bad' },
        predicate: { termType: 'namedNode', value: 'ex:p' },
        object: { termType: 'literal', value: 'o' },
      } as any, DF)).toThrow('Literal subject is invalid');

      expect(() => targetToTriple({
        subject: { termType: 'variable', value: 's' },
        predicate: { termType: 'literal', value: 'bad' },
        object: { termType: 'literal', value: 'o' },
      } as any, DF)).toThrow('Literal predicate is invalid');
    });

    it('checks RDF term and variable guards', () => {
      expect(isRDFTerm(DF.variable('v'))).toBe(true);
      expect(isRDFTerm({ termType: 'Variable', value: 'v' })).toBe(false);
      expect(isVariable(DF.variable('v'))).toBe(true);
      expect(isVariable(DF.namedNode('ex:v'))).toBe(false);
    });

    it('extracts all variables from quads', () => {
      const quads = [
        DF.quad(DF.variable('s'), DF.namedNode('ex:p'), DF.variable('o')),
        DF.quad(DF.namedNode('ex:s2'), DF.variable('p2'), DF.literal('x')),
      ];
      expect(getAllVariables(quads)).toEqual(new Set([ 's', 'o', 'p2' ]));
    });

    it('detects RDF/JSON triple shape and converts terms', () => {
      const triple = {
        subject: DF.variable('s'),
        predicate: DF.namedNode('ex:p'),
        object: DF.literal('o'),
      };
      expect(isRdfJsTriple(triple)).toBe(true);
      expect(isRdfJsTriple({ subject: {}, predicate: {}, object: {}})).toBe(false);

      expect(toTerm({ termType: 'variable', value: 'x' } as any, DF)).toEqual(DF.variable('x'));
      expect(toTerm({ termType: 'namedNode', value: 'ex:x' } as any, DF)).toEqual(DF.namedNode('ex:x'));
      expect(toTerm({ termType: 'literal', value: 'x' } as any, DF)).toEqual(DF.literal('x'));

      expect(toTermNoLiteral({ termType: 'VARIABLE', value: 'x' } as any, DF)).toEqual(DF.variable('x'));
      expect(toTermNoLiteral({ termType: 'namedNode', value: 'ex:x' } as any, DF)).toEqual(DF.namedNode('ex:x'));
      expect(() => toTermNoLiteral({ termType: 'literal', value: 'x' } as any, DF)).toThrow('Literal term is invalid');
    });
  });

  describe('equality helpers', () => {
    function path(items: (Term | PropertyPath)[], pathType = '/'): PropertyPath {
      return {
        type: 'path',
        pathType: pathType as any,
        items,
      } as any;
    }

    it('compares triples and term/path values', () => {
      const t1: Triple = {
        subject: DF.variable('s'),
        predicate: DF.namedNode('ex:p'),
        object: DF.literal('o'),
      };
      const t2: Triple = {
        subject: DF.variable('s'),
        predicate: DF.namedNode('ex:p'),
        object: DF.literal('o'),
      };
      const t3: Triple = {
        subject: DF.variable('s2'),
        predicate: DF.namedNode('ex:p'),
        object: DF.literal('o'),
      };
      expect(tripleEquals(t1, t2)).toBe(true);
      expect(tripleEquals(t1, t3)).toBe(false);

      expect(rdfTermEquals(DF.namedNode('ex:a') as any, DF.namedNode('ex:a') as any)).toBe(true);
      expect(rdfTermEquals(path([ DF.namedNode('ex:a') ]), path([ DF.namedNode('ex:a') ]))).toBe(true);
      expect(rdfTermEquals(path([ DF.namedNode('ex:a') ]), path([ DF.namedNode('ex:b') ]))).toBe(false);
      expect(rdfTermEquals(DF.namedNode('ex:a') as any, path([ DF.namedNode('ex:a') ]))).toBe(false);
    });

    it('checks property path equality variants', () => {
      const allPathTypes = [ '/', '|', '^', '!', '?', '*', '+' ];
      for (const pathType of allPathTypes) {
        const left = path([ DF.namedNode('ex:a') ], pathType);
        const right = path([ DF.namedNode('ex:a') ], pathType);
        expect(rdfTermEquals(left, right)).toBe(true);
        expect(propertyPathEquals(left, right)).toBe(true);
      }

      const byPathType = Object.fromEntries(allPathTypes.map(pathType => [ pathType, path([ DF.namedNode('ex:a') ], pathType) ]));
      const chainPath = byPathType['/'];
      const altPath = byPathType['|'];
      const inversePath = byPathType['^'];
      const negatedPath = byPathType['!'];
      const zeroOrOnePath = byPathType['?'];
      const zeroOrMorePath = byPathType['*'];
      const oneOrMorePath = byPathType['+'];
      negatedPath.items.push(DF.namedNode('ex:b'));
      chainPath.items.push(DF.namedNode('ex:b'));
      altPath.items.push(DF.namedNode('ex:b'));

      expect(rdfTermEquals(chainPath, altPath)).toBe(false);
      expect(rdfTermEquals(inversePath, negatedPath)).toBe(false);
      expect(rdfTermEquals(zeroOrOnePath, zeroOrMorePath)).toBe(false);
      expect(rdfTermEquals(zeroOrMorePath, oneOrMorePath)).toBe(false);

      expect(propertyPathEquals(
        { type: 'path', pathType: '/', items: [ DF.namedNode('ex:a') ]} as any,
        { type: 'other', pathType: '/', items: [ DF.namedNode('ex:a') ]} as any,
      )).toBe(false);

      expect(propertyPathEquals(
        { type: 'path', pathType: '/', items: [ DF.namedNode('ex:a') ]} as any,
        { type: 'path', pathType: '|', items: [ DF.namedNode('ex:a') ]} as any,
      )).toBe(false);

      expect(propertyPathEquals(
        { type: 'path', pathType: '/', items: [ DF.namedNode('ex:a') ]} as any,
        { type: 'path', pathType: '/', items: [ DF.namedNode('ex:a'), DF.namedNode('ex:b') ]} as any,
      )).toBe(false);

      expect(propertyPathEquals(
        path([ path([ DF.namedNode('ex:a') ]), DF.namedNode('ex:b') ]),
        path([ path([ DF.namedNode('ex:a') ]), DF.namedNode('ex:b') ]),
      )).toBe(true);

      expect(propertyPathEquals(
        path([ path([ DF.namedNode('ex:a') ]) ]),
        path([ DF.namedNode('ex:a') ]),
      )).toBe(false);
    });

    it('checks equals helper and BGP membership helpers', () => {
      expect(hasEquals(DF.namedNode('ex:a'))).toBe(true);
      expect(hasEquals({ value: 'x' })).toBe(false);

      const bgp = {
        type: 'bgp',
        triples: [{
          subject: DF.variable('s'),
          predicate: DF.namedNode('ex:p'),
          object: DF.literal('o'),
        }],
      } as any;
      expect(hasTriple(bgp, {
        subject: DF.variable('s'),
        predicate: DF.namedNode('ex:p'),
        object: DF.literal('o'),
      })).toBe(true);
      expect(hasTriple(bgp, {
        subject: DF.variable('x'),
        predicate: DF.namedNode('ex:p'),
        object: DF.literal('o'),
      })).toBe(false);
      expect(hasTriple(bgp, {
        subject: DF.variable('s'),
        predicate: DF.namedNode('ex:p'),
        object: DF.namedNode('o'),
      })).toBe(false);
      expect(() => hasTriple({ type: 'optional', patterns: []} as any, bgp.triples[0])).toThrow(
        'Expected a BGP pattern, but got optional',
      );
    });
  });

  describe('flatten/count helpers', () => {
    it('flattens operators and counts flattened entries', () => {
      const flattened = flattenOperators({
        bgp: [[ 1, 2 ], [ 3 ]],
        optional: [[]],
      });
      expect(flattened).toEqual({ bgp: [ 1, 2, 3 ], optional: []});
      expect(countFlattened(flattened)).toBe(3);
      expect(countFlattened({})).toBe(0);
    });
  });
});
