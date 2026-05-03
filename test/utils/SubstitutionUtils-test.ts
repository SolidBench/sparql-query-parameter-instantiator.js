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
  return <Pattern[]> (<any> parsed).where;
}

describe('SubstitutionUtils', () => {
  // ──────────────────────────────────────────────────────────────────────────
  describe('substituteTerm', () => {
    it('replaces a matching NamedNode value', () => {
      const term = DF.namedNode('http://ex.org/old');
      const result = substituteTerm(<any> term, 'http://ex.org/old', 'http://ex.org/new');
      expect((result).value).toBe('http://ex.org/new');
    });

    it('leaves a non-matching NamedNode unchanged', () => {
      const term = DF.namedNode('http://ex.org/other');
      const result = substituteTerm(<any> term, 'http://ex.org/old', 'http://ex.org/new');
      expect((result).value).toBe('http://ex.org/other');
    });

    it('ignores terms that are not NamedNodes (variable)', () => {
      const term = DF.variable('s');
      const result = substituteTerm(<any> term, '?s', 'http://ex.org/new');
      expect((result).value).toBe('s');
    });

    it('ignores terms that are not NamedNodes (literal)', () => {
      const term = DF.literal('http://ex.org/old');
      const result = substituteTerm(<any> term, 'http://ex.org/old', 'http://ex.org/new');
      expect((result).value).toBe('http://ex.org/old');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('substituteTriple', () => {
    it('substitutes matching named nodes in subject, predicate, and object', () => {
      const triple: Triple = {
        subject: <any> DF.namedNode('http://ex.org/old'),
        predicate: <any> DF.namedNode('http://ex.org/old'),
        object: <any> DF.namedNode('http://ex.org/old'),
      };
      const result = substituteTriple(triple, 'http://ex.org/old', 'http://ex.org/new');
      expect((<any> result.subject).value).toBe('http://ex.org/new');
      expect((<any> result.predicate).value).toBe('http://ex.org/new');
      expect((<any> result.object).value).toBe('http://ex.org/new');
    });

    it('leaves non-matching terms unchanged', () => {
      const triple: Triple = {
        subject: <any> DF.variable('s'),
        predicate: <any> DF.namedNode('http://ex.org/p'),
        object: <any> DF.variable('o'),
      };
      const result = substituteTriple(triple, 'http://ex.org/old', 'http://ex.org/new');
      expect((<any> result.subject).termType).toBe('Variable');
      expect((<any> result.predicate).value).toBe('http://ex.org/p');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('substitutePatterns', () => {
    it('substitutes in a BGP pattern', () => {
      const patterns = parseWhere(`SELECT * WHERE {
        <http://ex.org/old> <http://ex.org/p> <http://ex.org/o> .
      }`);
      const result = substitutePatterns(patterns, 'http://ex.org/old', 'http://ex.org/new');
      expect((<any> result[0]).triples[0].subject.value).toBe('http://ex.org/new');
    });

    it('substitutes in a GRAPH pattern', () => {
      const patterns = parseWhere(`SELECT * WHERE {
        GRAPH <http://ex.org/g> { <http://ex.org/old> <http://ex.org/p> ?o . }
      }`);
      const result = substitutePatterns(patterns, 'http://ex.org/old', 'http://ex.org/new');
      expect((<any> result[0]).type).toBe('graph');
      expect((<any> result[0]).patterns[0].triples[0].subject.value).toBe('http://ex.org/new');
    });

    it('substitutes in nested OPTIONAL patterns', () => {
      const patterns = parseWhere(`SELECT * WHERE {
        OPTIONAL { <http://ex.org/old> <http://ex.org/p> ?o . }
      }`);
      const result = substitutePatterns(patterns, 'http://ex.org/old', 'http://ex.org/new');
      const optionalBgp = (<any> result[0]).patterns[0];
      expect(optionalBgp.triples[0].subject.value).toBe('http://ex.org/new');
    });

    it('substitutes in UNION patterns', () => {
      const patterns = parseWhere(`SELECT * WHERE {
        { <http://ex.org/old> <http://ex.org/p> ?o . }
        UNION
        { ?s <http://ex.org/p> <http://ex.org/old> . }
      }`);
      const result = substitutePatterns(patterns, 'http://ex.org/old', 'http://ex.org/new');
      const [ left, right ] = (<any> result[0]).patterns;
      expect(left.triples[0].subject.value).toBe('http://ex.org/new');
      expect(right.triples[0].object.value).toBe('http://ex.org/new');
    });

    it('substitutes in FILTER expressions', () => {
      const patterns = parseWhere(`SELECT * WHERE {
        ?s ?p ?o .
        FILTER(?o = <http://ex.org/old>)
      }`);
      const result = substitutePatterns(patterns, 'http://ex.org/old', 'http://ex.org/new');
      const filter = <any> result[1];
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
      expect((<any> result[0]).type).toBe('values');
    });

    it('substitutes in a nested sub-query (query pattern)', () => {
      const patterns = parseWhere(`SELECT * WHERE {
        { SELECT * WHERE { <http://ex.org/old> <http://ex.org/p> ?o . } }
      }`);
      const result = substitutePatterns(patterns, 'http://ex.org/old', 'http://ex.org/new');
      // The sub-select is a 'group' wrapping a 'query'
      const inner = (<any> result[0]).patterns[0];
      expect(inner.type).toBe('query');
      const subBgp = inner.where[0];
      expect(subBgp.triples[0].subject.value).toBe('http://ex.org/new');
    });

    it('substitutes in GROUP patterns', () => {
      const patterns = parseWhere(`SELECT * WHERE {
        { <http://ex.org/old> <http://ex.org/p> ?o . }
      }`);
      const result = substitutePatterns(patterns, 'http://ex.org/old', 'http://ex.org/new');
      const bgp = (<any> result[0]).patterns[0];
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
          <any> { termType: 'NamedNode', value: 'http://ex.org/old' },
          <any> { termType: 'NamedNode', value: 'http://ex.org/other' },
        ],
      };
      const result = <any> substituteExpression(expr, 'http://ex.org/old', 'http://ex.org/new');
      expect(result.args[0].value).toBe('http://ex.org/new');
      expect(result.args[1].value).toBe('http://ex.org/other');
    });

    it('substitutes inside an aggregate expression', () => {
      const inner: Expression = <any> { termType: 'NamedNode', value: 'http://ex.org/old' };
      const expr: Expression = <any> {
        type: 'aggregate',
        aggregation: 'count',
        expression: inner,
        distinct: false,
      };
      const result = <any> substituteExpression(expr, 'http://ex.org/old', 'http://ex.org/new');
      expect(result.expression.value).toBe('http://ex.org/new');
    });

    it('substitutes a plain term expression (no type property)', () => {
      const expr: Expression = <any> { termType: 'NamedNode', value: 'http://ex.org/old' };
      const result = <any> substituteExpression(expr, 'http://ex.org/old', 'http://ex.org/new');
      expect(result.value).toBe('http://ex.org/new');
    });

    it('substitutes inside a functionCall expression', () => {
      const expr: Expression = <any> {
        type: 'functionCall',
        function: 'http://ex.org/fn',
        args: [
          <any> { termType: 'NamedNode', value: 'http://ex.org/old' },
        ],
      };
      const result = <any> substituteExpression(expr, 'http://ex.org/old', 'http://ex.org/new');
      expect(result.args[0].value).toBe('http://ex.org/new');
    });

    it('substitutes inside a group expression (NOT EXISTS)', () => {
      const patterns = parseWhere(`SELECT * WHERE {
        FILTER NOT EXISTS { <http://ex.org/old> <http://ex.org/p> ?o . }
      }`);
      const result = substitutePatterns(patterns, 'http://ex.org/old', 'http://ex.org/new');
      const filterExpr = (<any> result[0]).expression;
      // The notexists operation wraps a group pattern as its argument
      const groupArg = filterExpr.args[0];
      expect(groupArg.type).toBe('group');
      expect(groupArg.patterns[0].triples[0].subject.value).toBe('http://ex.org/new');
    });

    it('substitutes inside a bgp expression (manually constructed)', () => {
      const expr: Expression = <any> {
        type: 'bgp',
        triples: [
          {
            subject: DF.namedNode('http://ex.org/old'),
            predicate: DF.namedNode('http://ex.org/p'),
            object: DF.variable('o'),
          },
        ],
      };
      const result = <any> substituteExpression(expr, 'http://ex.org/old', 'http://ex.org/new');
      expect(result.triples[0].subject.value).toBe('http://ex.org/new');
    });
  });
});
