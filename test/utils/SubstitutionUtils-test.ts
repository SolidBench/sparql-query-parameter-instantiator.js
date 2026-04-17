import { DataFactory } from 'rdf-data-factory';
import type { Expression, Pattern, Triple } from 'sparqljs';
import { Parser } from 'sparqljs';
import {
  substituteExpression,
  substitutePatterns,
  substituteTerm,
  substituteTriple,
} from '../../lib/utils/SubstitutionUtils';

const DF = new DataFactory();
const parser = new Parser();

/** Helper: parse a full SELECT query's WHERE clause as Pattern[]. */
function parseWhere(sparql: string): Pattern[] {
  const parsed = parser.parse(sparql);
  return (parsed as any).where as Pattern[];
}

describe('SubstitutionUtils', () => {
  // ──────────────────────────────────────────────────────────────────────────
  describe('substituteTerm', () => {
    it('replaces a matching NamedNode value', () => {
      const term = DF.namedNode('http://ex.org/old');
      const result = substituteTerm(term as any, 'http://ex.org/old', 'http://ex.org/new');
      expect((result as any).value).toBe('http://ex.org/new');
    });

    it('leaves a non-matching NamedNode unchanged', () => {
      const term = DF.namedNode('http://ex.org/other');
      const result = substituteTerm(term as any, 'http://ex.org/old', 'http://ex.org/new');
      expect((result as any).value).toBe('http://ex.org/other');
    });

    it('ignores terms that are not NamedNodes (variable)', () => {
      const term = DF.variable('s');
      const result = substituteTerm(term as any, '?s', 'http://ex.org/new');
      expect((result as any).value).toBe('s');
    });

    it('ignores terms that are not NamedNodes (literal)', () => {
      const term = DF.literal('http://ex.org/old');
      const result = substituteTerm(term as any, 'http://ex.org/old', 'http://ex.org/new');
      expect((result as any).value).toBe('http://ex.org/old');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('substituteTriple', () => {
    it('substitutes matching named nodes in subject, predicate, and object', () => {
      const triple: Triple = {
        subject: DF.namedNode('http://ex.org/old') as any,
        predicate: DF.namedNode('http://ex.org/old') as any,
        object: DF.namedNode('http://ex.org/old') as any,
      };
      const result = substituteTriple(triple, 'http://ex.org/old', 'http://ex.org/new');
      expect((result.subject as any).value).toBe('http://ex.org/new');
      expect((result.predicate as any).value).toBe('http://ex.org/new');
      expect((result.object as any).value).toBe('http://ex.org/new');
    });

    it('leaves non-matching terms unchanged', () => {
      const triple: Triple = {
        subject: DF.variable('s') as any,
        predicate: DF.namedNode('http://ex.org/p') as any,
        object: DF.variable('o') as any,
      };
      const result = substituteTriple(triple, 'http://ex.org/old', 'http://ex.org/new');
      expect((result.subject as any).termType).toBe('Variable');
      expect((result.predicate as any).value).toBe('http://ex.org/p');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('substitutePatterns', () => {
    it('substitutes in a BGP pattern', () => {
      const patterns = parseWhere(`SELECT * WHERE {
        <http://ex.org/old> <http://ex.org/p> <http://ex.org/o> .
      }`);
      const result = substitutePatterns(patterns, 'http://ex.org/old', 'http://ex.org/new');
      expect((result[0] as any).triples[0].subject.value).toBe('http://ex.org/new');
    });

    it('substitutes in nested OPTIONAL patterns', () => {
      const patterns = parseWhere(`SELECT * WHERE {
        OPTIONAL { <http://ex.org/old> <http://ex.org/p> ?o . }
      }`);
      const result = substitutePatterns(patterns, 'http://ex.org/old', 'http://ex.org/new');
      const optionalBgp = (result[0] as any).patterns[0];
      expect(optionalBgp.triples[0].subject.value).toBe('http://ex.org/new');
    });

    it('substitutes in UNION patterns', () => {
      const patterns = parseWhere(`SELECT * WHERE {
        { <http://ex.org/old> <http://ex.org/p> ?o . }
        UNION
        { ?s <http://ex.org/p> <http://ex.org/old> . }
      }`);
      const result = substitutePatterns(patterns, 'http://ex.org/old', 'http://ex.org/new');
      const [ left, right ] = (result[0] as any).patterns;
      expect(left.triples[0].subject.value).toBe('http://ex.org/new');
      expect(right.triples[0].object.value).toBe('http://ex.org/new');
    });

    it('substitutes in FILTER expressions', () => {
      const patterns = parseWhere(`SELECT * WHERE {
        ?s ?p ?o .
        FILTER(?o = <http://ex.org/old>)
      }`);
      const result = substitutePatterns(patterns, 'http://ex.org/old', 'http://ex.org/new');
      const filter = result[1] as any;
      expect(filter.type).toBe('filter');
      // The named node inside the operation args should be updated
      expect(filter.expression.args[1].value).toBe('http://ex.org/new');
    });

    it('returns VALUES patterns unchanged', () => {
      const patterns = parseWhere(`SELECT * WHERE {
        VALUES ?s { <http://ex.org/a> }
      }`);
      const result = substitutePatterns(patterns, 'http://ex.org/a', 'http://ex.org/new');
      // VALUES patterns are returned as-is (not traversed)
      expect((result[0] as any).type).toBe('values');
    });

    it('substitutes in a nested sub-query (query pattern)', () => {
      const patterns = parseWhere(`SELECT * WHERE {
        { SELECT * WHERE { <http://ex.org/old> <http://ex.org/p> ?o . } }
      }`);
      const result = substitutePatterns(patterns, 'http://ex.org/old', 'http://ex.org/new');
      // The sub-select is a 'group' wrapping a 'query'
      const inner = (result[0] as any).patterns[0];
      expect(inner.type).toBe('query');
      const subBgp = inner.where[0];
      expect(subBgp.triples[0].subject.value).toBe('http://ex.org/new');
    });

    it('substitutes in GROUP patterns', () => {
      const patterns = parseWhere(`SELECT * WHERE {
        { <http://ex.org/old> <http://ex.org/p> ?o . }
      }`);
      const result = substitutePatterns(patterns, 'http://ex.org/old', 'http://ex.org/new');
      const bgp = (result[0] as any).patterns[0];
      expect(bgp.triples[0].subject.value).toBe('http://ex.org/new');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('substituteExpression', () => {
    it('substitutes inside an operation expression', () => {
      const expr: Expression = {
        type: 'operation',
        operator: '=',
        args: [
          { termType: 'NamedNode', value: 'http://ex.org/old' } as any,
          { termType: 'NamedNode', value: 'http://ex.org/other' } as any,
        ],
      };
      const result = substituteExpression(expr, 'http://ex.org/old', 'http://ex.org/new') as any;
      expect(result.args[0].value).toBe('http://ex.org/new');
      expect(result.args[1].value).toBe('http://ex.org/other');
    });

    it('substitutes inside an aggregate expression', () => {
      const inner: Expression = { termType: 'NamedNode', value: 'http://ex.org/old' } as any;
      const expr: Expression = {
        type: 'aggregate',
        aggregation: 'count',
        expression: inner,
        distinct: false,
      } as any;
      const result = substituteExpression(expr, 'http://ex.org/old', 'http://ex.org/new') as any;
      expect(result.expression.value).toBe('http://ex.org/new');
    });

    it('substitutes a plain term expression (no type property)', () => {
      const expr: Expression = { termType: 'NamedNode', value: 'http://ex.org/old' } as any;
      const result = substituteExpression(expr, 'http://ex.org/old', 'http://ex.org/new') as any;
      expect(result.value).toBe('http://ex.org/new');
    });

    it('substitutes inside a functionCall expression', () => {
      const expr: Expression = {
        type: 'functionCall',
        function: 'http://ex.org/fn',
        args: [
          { termType: 'NamedNode', value: 'http://ex.org/old' } as any,
        ],
      } as any;
      const result = substituteExpression(expr, 'http://ex.org/old', 'http://ex.org/new') as any;
      expect(result.args[0].value).toBe('http://ex.org/new');
    });
  });
});
