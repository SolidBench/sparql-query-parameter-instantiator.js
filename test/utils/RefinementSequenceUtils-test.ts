import type { Quad } from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type {
  AggregateExpression,
  BgpPattern,
  BindPattern,
  Expression,
  FilterPattern,
  FunctionCallExpression,
  GraphPattern,
  GroupPattern,
  MinusPattern,
  OperationExpression,
  OptionalPattern,
  Pattern,
  PropertyPath,
  SelectQuery,
  ServicePattern,
  Term,
  Triple,
  Tuple,
  UnionPattern,
  ValuesPattern,
} from 'sparqljs';
import { Parser } from 'sparqljs';
import {
  countFlattened,
  expressionEquals,
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

      const where = <Pattern[]> (<any> parsed).where;
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
      const patterns: Pattern[] = [ <any> {
        type: 'union',
        patterns: [
          <any> { type: 'union', patterns: []},
          <any> { type: 'group', patterns: []},
          <any> { type: 'bgp', triples: [{
            subject: DF.variable('x'),
            predicate: DF.variable('y'),
            object: DF.variable('z'),
          }]},
        ],
      } ];

      const out: Record<string, any[]> = {};
      extractBgpPerOperator(patterns, <any> out, 'bgp');
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
        <any> { type: 'filter', expression: { type: 'variable', value: 'x' }},
        <any> { type: 'bind' },
      ], <any> out, 'bgp');
      expect(out).toEqual({});
    });
  });

  describe('getVariablesInExpression', () => {
    it('extracts variables from basic Term types, ignoring non-variables', () => {
      expect(getVariablesInExpression(DF.variable('a'))).toEqual(new Set([ 'a' ]));
      expect(getVariablesInExpression(DF.namedNode('http://example.org'))).toEqual(new Set());
      expect(getVariablesInExpression(DF.literal('test'))).toEqual(new Set());
      expect(getVariablesInExpression(DF.blankNode('b1'))).toEqual(new Set());
    });

    it('extracts variables from nested QuadTerm (RDF-star)', () => {
      const quad = <Quad> DF.quad(
        DF.variable('quadSubj'),
        DF.variable('quadPred'),
        DF.variable('quadObj'),
        DF.variable('quadGraph'),
      );

      expect(getVariablesInExpression(quad)).toEqual(new Set([ 'quadSubj', 'quadPred', 'quadObj', 'quadGraph' ]));
    });

    it('extracts variables from OperationExpression and FunctionCallExpression', () => {
      const operation = <OperationExpression>{
        type: 'operation',
        operator: '+',
        args: [ DF.variable('varOp1'), DF.variable('varOp2') ],
      };

      const functionCall = <FunctionCallExpression>{
        type: 'functionCall',
        function: 'http://example.org/func',
        args: [ DF.variable('varFunc') ],
      };

      expect(getVariablesInExpression(operation)).toEqual(new Set([ 'varOp1', 'varOp2' ]));
      expect(getVariablesInExpression(functionCall)).toEqual(new Set([ 'varFunc' ]));
    });

    it('extracts variables from AggregateExpression', () => {
      const aggregateSum = <AggregateExpression>{
        type: 'aggregate',
        aggregation: 'sum',
        expression: DF.variable('varAggSum'),
      };

      const aggregateConcat = <AggregateExpression>{
        type: 'aggregate',
        aggregation: 'group_concat',
        expression: DF.variable('varAggConcat'),
        separator: ',',
      };

      expect(getVariablesInExpression(aggregateSum)).toEqual(new Set([ 'varAggSum' ]));
      expect(getVariablesInExpression(aggregateConcat)).toEqual(new Set([ 'varAggConcat' ]));
    });

    it('extracts variables from BgpPattern, including predicates and property paths', () => {
      const bgp = <BgpPattern>{
        type: 'bgp',
        triples: [
          {
            subject: DF.variable('varSubj'),
            predicate: DF.variable('varPred'),
            object: DF.variable('varObj'),
          },
          {
            subject: DF.variable('varPathSubj'),
            predicate: {
              type: 'path',
              pathType: '/',
              items: [
                DF.namedNode('http://example.org/p2'),
                DF.namedNode('http://example.org/p3'),
              ],
            },
            object: DF.variable('varPathObj'),
          },
        ],
      };

      expect(getVariablesInExpression(bgp)).toEqual(new Set([
        'varSubj',
        'varPred',
        'varObj',
        'varPathSubj',
        'varPathObj',
      ]));
    });

    it('extracts variables from complex BlockPatterns nested inside GroupPattern', () => {
      const group = <GroupPattern>{
        type: 'group',
        patterns: [
        <BindPattern>{
          type: 'bind',
          variable: DF.variable('bindVarTarget'),
          expression: DF.variable('bindVarSource'),
        },
        <FilterPattern>{
          type: 'filter',
          expression: <OperationExpression>{
            type: 'operation',
            operator: '>',
            args: [ DF.variable('filterVar'), DF.literal('10') ],
          },
        },
        <ValuesPattern>{
          type: 'values',
          values: [{ '?valuesVar1': DF.namedNode('http://example.org') }],
        },
        <UnionPattern>{
          type: 'union',
          patterns: [
            <BgpPattern>{
              type: 'bgp',
              triples: [{ subject: DF.variable('unionVar'), predicate: DF.namedNode('p'), object: DF.literal('o') }],
            },
          ],
        },
        ],
      };

      expect(getVariablesInExpression(group)).toEqual(new Set([
        'bindVarTarget',
        'bindVarSource',
        'filterVar',
        'valuesVar1',
        'unionVar',
      ]));
    });

    it('extracts variables from a root GraphPattern expression', () => {
      const graphExpression = <GraphPattern>{
        type: 'graph',
        name: DF.namedNode('http://example.org/graph'),
        patterns: [
        <BgpPattern>{
          type: 'bgp',
          triples: [{
            subject: DF.variable('graphSubj'),
            predicate: DF.namedNode('p'),
            object: DF.literal('o'),
          }],
        },
        ],
      };

      expect(getVariablesInExpression(graphExpression)).toEqual(new Set([ 'graphSubj' ]));
    });

    it('extracts variables from Optional, Minus, and Service patterns nested in a Group', () => {
      const groupWithBlocks = <GroupPattern>{
        type: 'group',
        patterns: [
        <OptionalPattern>{
          type: 'optional',
          patterns: [
            <BgpPattern>{
              type: 'bgp',
              triples: [{ subject: DF.variable('optionalVar'), predicate: DF.namedNode('p'), object: DF.literal('o') }],
            },
          ],
        },
        <MinusPattern>{
          type: 'minus',
          patterns: [
            <BgpPattern>{
              type: 'bgp',
              triples: [{ subject: DF.variable('minusVar'), predicate: DF.namedNode('p'), object: DF.literal('o') }],
            },
          ],
        },
        <ServicePattern>{
          type: 'service',
          name: DF.namedNode('http://example.org/sparql'),
          silent: false,
          patterns: [
            <BgpPattern>{
              type: 'bgp',
              triples: [{ subject: DF.variable('serviceVar'), predicate: DF.namedNode('p'), object: DF.literal('o') }],
            },
          ],
        },
        ],
      };

      expect(getVariablesInExpression(groupWithBlocks)).toEqual(new Set([
        'optionalVar',
        'minusVar',
        'serviceVar',
      ]));
    });

    it('extracts variables from subqueries (SelectQuery) nested inside GroupPattern', () => {
      const group = <GroupPattern>{
        type: 'group',
        patterns: [
        <SelectQuery>{
          type: 'query',
          queryType: 'SELECT',
          variables: [ DF.variable('subSelectVar') ],
          prefixes: {},
          where: [
            <BgpPattern>{
              type: 'bgp',
              triples: [{ subject: DF.variable('subWhereVar'), predicate: DF.namedNode('p'), object: DF.literal('o') }],
            },
          ],
        },
        ],
      };

      expect(getVariablesInExpression(group)).toEqual(new Set([ 'subWhereVar' ]));
    });

    it('extracts variables from subqueries containing group, having, values, and order clauses', () => {
      const groupWithComplexSubquery = <GroupPattern>{
        type: 'group',
        patterns: [
        <SelectQuery>{
          type: 'query',
          queryType: 'SELECT',
          prefixes: {},
          variables: [ DF.variable('selectVar') ],
          where: [
            <BgpPattern>{
              type: 'bgp',
              triples: [{
                subject: DF.variable('whereVar'),
                predicate: DF.namedNode('http://example.org/p'),
                object: DF.variable('groupVar'),
              }],
            },
          ],
          values: [
            { '?valuesVar': DF.namedNode('http://example.org/val') },
          ],
          group: [
            { expression: DF.variable('groupVar') },
          ],
          having: [
            <OperationExpression>{
              type: 'operation',
              operator: '>',
              args: [ DF.variable('havingVar'), DF.literal('10') ],
            },
          ],
          order: [
            { expression: DF.variable('orderVar'), descending: true },
          ],
        },
        ],
      };

      expect(getVariablesInExpression(groupWithComplexSubquery)).toEqual(new Set([
        'whereVar',
        'groupVar',
        'valuesVar',
        'havingVar',
        'orderVar',
      ]));
    });

    it('extracts variables from subqueries lacking a where clause (testing undefined branches)', () => {
      const groupWithEmptySubquery = <GroupPattern>{
        type: 'group',
        patterns: [
          <SelectQuery>{
            type: 'query',
            queryType: 'SELECT',
            variables: [ DF.variable('ignoredVar') ],
            prefixes: {},
            // Notice: 'where' is completely omitted here
            values: [
              { '?valuesVar': DF.namedNode('http://example.org/val') },
            ],
          },
        ],
      };

      // Based on your current code's logic, it should only extract from values
      expect(getVariablesInExpression(groupWithEmptySubquery)).toEqual(new Set([
        'valuesVar',
      ]));
    });
    it('extracts variables from Tuples recursively', () => {
      const tuple = <Tuple>[
        DF.variable('varTuple1'),
      <Tuple>[ DF.variable('varTupleNested') ],
      ];

      expect(getVariablesInExpression(tuple)).toEqual(new Set([ 'varTuple1', 'varTupleNested' ]));
    });

    it('handles unknown pattern type inside a group without throwing (implicit default branch)', () => {
      // Force an unrecognized pattern type to cover the implicit default/no-match
      // branch of the switch in the private visitPattern function.
      const groupWithUnknown = <any>{
        type: 'group',
        patterns: [
          // 'bind' with no subpatterns, followed by an unknown type
          <any>{ type: 'unknownPatternType' },
        ],
      };
      expect(getVariablesInExpression(groupWithUnknown)).toEqual(new Set());
    });

    it('handles a graph pattern nested inside a group (covers visitPattern case graph)', () => {
      // visitPattern needs to be called with type 'graph' to cover that case arm.
      // This happens when a graph is nested inside a group expression.
      const groupWithGraph = <GroupPattern>{
        type: 'group',
        patterns: [
          <GraphPattern>{
            type: 'graph',
            name: DF.namedNode('http://example.org/g'),
            patterns: [
              <BgpPattern>{
                type: 'bgp',
                triples: [{
                  subject: DF.variable('nestedGraphVar'),
                  predicate: DF.namedNode('p'),
                  object: DF.literal('o'),
                }],
              },
            ],
          },
        ],
      };
      expect(getVariablesInExpression(groupWithGraph)).toEqual(new Set([ 'nestedGraphVar' ]));
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
      expect(targetToTriple(<any> target, DF)).toEqual({
        subject: DF.variable('s'),
        predicate: DF.namedNode('ex:p'),
        object: DF.literal('o'),
      });

      expect(() => targetToTriple(<any> {
        subject: { termType: 'literal', value: 'bad' },
        predicate: { termType: 'namedNode', value: 'ex:p' },
        object: { termType: 'literal', value: 'o' },
      }, DF)).toThrow('Literal subject is invalid');

      expect(() => targetToTriple(<any> {
        subject: { termType: 'variable', value: 's' },
        predicate: { termType: 'literal', value: 'bad' },
        object: { termType: 'literal', value: 'o' },
      }, DF)).toThrow('Literal predicate is invalid');
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

      expect(toTerm(<any> { termType: 'variable', value: 'x' }, DF)).toEqual(DF.variable('x'));
      expect(toTerm(<any> { termType: 'namedNode', value: 'ex:x' }, DF)).toEqual(DF.namedNode('ex:x'));
      expect(toTerm(<any> { termType: 'literal', value: 'x' }, DF)).toEqual(DF.literal('x'));

      expect(toTermNoLiteral(<any> { termType: 'VARIABLE', value: 'x' }, DF)).toEqual(DF.variable('x'));
      expect(toTermNoLiteral(<any> { termType: 'namedNode', value: 'ex:x' }, DF)).toEqual(DF.namedNode('ex:x'));
      expect(() => toTermNoLiteral(<any> { termType: 'literal', value: 'x' }, DF)).toThrow('Literal term is invalid');
    });
  });

  describe('equality helpers', () => {
    function path(items: (Term | PropertyPath)[], pathType = '/'): PropertyPath {
      return <any> {
        type: 'path',
        pathType: <any> pathType,
        items,
      };
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

      expect(rdfTermEquals(<any> DF.namedNode('ex:a'), <any> DF.namedNode('ex:a'))).toBe(true);
      expect(rdfTermEquals(path([ DF.namedNode('ex:a') ]), path([ DF.namedNode('ex:a') ]))).toBe(true);
      expect(rdfTermEquals(path([ DF.namedNode('ex:a') ]), path([ DF.namedNode('ex:b') ]))).toBe(false);
      expect(rdfTermEquals(<any> DF.namedNode('ex:a'), path([ DF.namedNode('ex:a') ]))).toBe(false);
    });

    it('checks property path equality variants', () => {
      const allPathTypes = [ '/', '|', '^', '!', '?', '*', '+' ];
      for (const pathType of allPathTypes) {
        const left = path([ DF.namedNode('ex:a') ], pathType);
        const right = path([ DF.namedNode('ex:a') ], pathType);
        expect(rdfTermEquals(left, right)).toBe(true);
        expect(propertyPathEquals(left, right)).toBe(true);
      }

      const byPathType = Object.fromEntries(
        allPathTypes.map(pathType => [ pathType, path([ DF.namedNode('ex:a') ], pathType) ]),
      );

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
        <any> { type: 'path', pathType: '/', items: [ DF.namedNode('ex:a') ]},
        <any> { type: 'other', pathType: '/', items: [ DF.namedNode('ex:a') ]},
      )).toBe(false);

      expect(propertyPathEquals(
        <any> { type: 'path', pathType: '/', items: [ DF.namedNode('ex:a') ]},
        <any> { type: 'path', pathType: '|', items: [ DF.namedNode('ex:a') ]},
      )).toBe(false);

      expect(propertyPathEquals(
        <any> { type: 'path', pathType: '/', items: [ DF.namedNode('ex:a') ]},
        <any> { type: 'path', pathType: '/', items: [ DF.namedNode('ex:a'), DF.namedNode('ex:b') ]},
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

      const bgp = <any> {
        type: 'bgp',
        triples: [{
          subject: DF.variable('s'),
          predicate: DF.namedNode('ex:p'),
          object: DF.literal('o'),
        }],
      };
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
      expect(() => hasTriple(<any> { type: 'optional', patterns: []}, bgp.triples[0])).toThrow(
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

  describe('extractExpressionPerOperator', () => {
    it('extracts filter expressions from simple where clause', () => {
      const parsed = new Parser().parse(`
        SELECT * WHERE {
          ?s ?p ?o .
          FILTER(?o > 5)
        }
      `);
      const where = <Pattern[]> (<any> parsed).where;
      const result: Record<string, Expression[]> = {};
      extractExpressionPerOperator(where, result, 'filter');
      expect(result.filter).toHaveLength(1);
    });

    it('extracts filter expressions from nested group, union, optional, graph, minus, and service', () => {
      const patterns: Pattern[] = [
        <any>{ type: 'group', patterns: [
          <any>{ type: 'filter', expression: DF.variable('a') },
        ]},
        <any>{ type: 'union', patterns: [
          <any>{ type: 'filter', expression: DF.variable('b') },
        ]},
        <any>{ type: 'optional', patterns: [
          <any>{ type: 'filter', expression: DF.variable('c') },
        ]},
        <any>{ type: 'graph', name: DF.namedNode('ex:g'), patterns: [
          <any>{ type: 'filter', expression: DF.variable('d') },
        ]},
        <any>{ type: 'minus', patterns: [
          <any>{ type: 'filter', expression: DF.variable('e') },
        ]},
        <any>{ type: 'service', name: DF.namedNode('ex:svc'), silent: false, patterns: [
          <any>{ type: 'filter', expression: DF.variable('f') },
        ]},
      ];
      const result: Record<string, Expression[]> = {};
      extractExpressionPerOperator(patterns, result, 'filter');
      expect(result.filter).toHaveLength(6);
    });

    it('extracts filter expressions from nested query', () => {
      const patterns: Pattern[] = [
        <any>{
          type: 'query',
          queryType: 'SELECT',
          prefixes: {},
          variables: [ DF.variable('s') ],
          where: [
            <any>{ type: 'filter', expression: DF.variable('inner') },
          ],
        },
      ];
      const result: Record<string, Expression[]> = {};
      extractExpressionPerOperator(patterns, result, 'filter');
      expect(result.filter).toHaveLength(1);
    });

    it('skips patterns with no filter and handles subquery without where', () => {
      const patterns: Pattern[] = [
        <any>{ type: 'bgp', triples: []},
        <any>{ type: 'query', queryType: 'SELECT', prefixes: {}, variables: []},
        <any>{ type: 'bind', variable: DF.variable('x'), expression: DF.literal('1') },
      ];
      const result: Record<string, Expression[]> = {};
      extractExpressionPerOperator(patterns, result, 'filter');
      expect(result).toEqual({});
    });
  });

  describe('expressionEquals', () => {
    it('returns true for identical expressions', () => {
      const expr: any = { type: 'operation', operator: '>', args: [ DF.variable('s'), DF.literal('18') ]};
      expect(expressionEquals(expr, expr)).toBe(true);
    });

    it('returns false for different expressions', () => {
      const a: any = { type: 'operation', operator: '>', args: [ DF.variable('s'), DF.literal('18') ]};
      const b: any = { type: 'operation', operator: '<', args: [ DF.variable('s'), DF.literal('18') ]};
      expect(expressionEquals(a, b)).toBe(false);
    });
  });
});
