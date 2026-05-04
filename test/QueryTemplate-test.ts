import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import { Parser } from 'sparqljs';
import { QueryTemplate } from '../lib/QueryTemplate';
import type { IValueTransformer } from '../lib/valuetransformer/IValueTransformer';

const DF = new DataFactory();

describe('QueryTemplate', () => {
  describe('instantiate', () => {
    it('instantiated without variables', () => {
      expect(instantiate(`
SELECT * WHERE {
  ?s ?p ?o.
}`, {}, 0)).toBe(`SELECT * WHERE { ?s ?p ?o. }`);
    });

    it('instantiated with one variable', () => {
      expect(instantiate(`
SELECT * WHERE {
  ?s ?p ?o.
}`, {
        s: [
          DF.namedNode('ex:s1'),
          DF.namedNode('ex:s2'),
        ],
      }, 0)).toBe(`SELECT * WHERE { <ex:s1> ?p ?o. }`);
      expect(instantiate(`
SELECT * WHERE {
  ?s ?p ?o.
}`, {
        s: [
          DF.namedNode('ex:s1'),
          DF.namedNode('ex:s2'),
        ],
      }, 1)).toBe(`SELECT * WHERE { <ex:s2> ?p ?o. }`);
    });

    it('instantiated with two variable', () => {
      expect(instantiate(`
SELECT * WHERE {
  ?s ?p ?o.
}`, {
        s: [
          DF.namedNode('ex:s1'),
          DF.namedNode('ex:s2'),
        ],
        p: [
          DF.namedNode('ex:p1'),
          DF.namedNode('ex:p2'),
        ],
      }, 0)).toBe(`SELECT * WHERE { <ex:s1> <ex:p1> ?o. }`);
      expect(instantiate(`
SELECT * WHERE {
  ?s ?p ?o.
}`, {
        s: [
          DF.namedNode('ex:s1'),
          DF.namedNode('ex:s2'),
        ],
        p: [
          DF.namedNode('ex:p1'),
          DF.namedNode('ex:p2'),
        ],
      }, 1)).toBe(`SELECT * WHERE { <ex:s2> <ex:p2> ?o. }`);
    });

    it('instantiated with a counter that is out of range', () => {
      expect(() => instantiate(`
SELECT * WHERE {
  ?s ?p ?o.
}`, {
        s: [
          DF.namedNode('ex:s1'),
          DF.namedNode('ex:s2'),
        ],
      }, 2)).toThrow(`Attempted to instantiate a query template more than the number of provided subsitution parameters (2)`);
    });

    it('instantiated for a construct query', () => {
      expect(() => instantiate(`
CONSTRUCT WHERE {
  ?s ?p ?o.
}`, {}, 0)).toThrow(`Only instantiations of SELECT queries are supported`);
    });

    it('instantiated for an update query', () => {
      expect(() => instantiate(`
DELETE WHERE {
  ?s ?p ?o.
}`, {}, 0)).toThrow(`Only instantiations of SELECT queries are supported`);
    });

    it('should remove variables from the select clause', () => {
      expect(instantiate(`
SELECT ?s ?p ?o WHERE {
  ?s ?p ?o.
}`, { s: [ DF.namedNode('ex:s1') ]}, 0))
        .toBe(`SELECT ?p ?o WHERE { <ex:s1> ?p ?o. }`);
    });

    it('should handle sub-projections', () => {
      expect(instantiate(`
SELECT * WHERE {
  SELECT * WHERE {
    ?s ?p ?o.
  }
}`, { s: [ DF.namedNode('ex:s1') ]}, 0))
        .toBe(`SELECT * WHERE { SELECT * WHERE { <ex:s1> ?p ?o. } }`);
    });

    it('should handle GRAPH over triple patterns', () => {
      expect(instantiate(`
SELECT * WHERE {
  GRAPH ?g {
    ?s ?p ?o.
  }
}`, { s: [ DF.namedNode('ex:s1') ]}, 0))
        .toBe(`SELECT * WHERE { GRAPH ?g { <ex:s1> ?p ?o. } }`);
    });

    it('should handle GRAPH over property paths', () => {
      expect(instantiate(`
SELECT * WHERE {
  GRAPH ?g {
    ?s <ex:p1>/<ex:p2> ?o.
  }
}`, { s: [ DF.namedNode('ex:s1') ]}, 0))
        .toBe(`SELECT * WHERE { GRAPH ?g { <ex:s1> (<ex:p1>/<ex:p2>) ?o. } }`);
    });

    it('should handle UNION', () => {
      expect(instantiate(`
SELECT * WHERE {
  {
    ?s ?p ?o.
  } UNION {
    ?s ?p ?o.
  }
}`, { s: [ DF.namedNode('ex:s1') ]}, 0))
        .toBe(`SELECT * WHERE {
  { <ex:s1> ?p ?o. }
  UNION
  { <ex:s1> ?p ?o. }
}`);
    });

    it('should handle BIND', () => {
      expect(instantiate(`
SELECT * WHERE {
  ?s ?p ?o.
  BIND(<ex:x> as ?x)
}`, { s: [ DF.namedNode('ex:s1') ]}, 0))
        .toBe(`SELECT * WHERE {
  <ex:s1> ?p ?o.
  BIND(<ex:x> AS ?x)
}`);
    });

    it('should handle BIND with expressions', () => {
      expect(instantiate(`
SELECT * WHERE {
  ?s ?p ?o.
  BIND(CONCAT("a", ?v) as ?x)
}`, { v: [ DF.literal('s1') ]}, 0))
        .toBe(`SELECT * WHERE {
  ?s ?p ?o.
  BIND(CONCAT("a", "s1") AS ?x)
}`);
    });

    it('should handle VALUES', () => {
      expect(instantiate(`
SELECT * WHERE {
  ?s ?p ?o.
  VALUES ?s {
    <ex:a>
    <ex:b>
  }
}`, { s: [ DF.namedNode('ex:s1') ]}, 0))
        .toBe(`SELECT * WHERE {
  <ex:s1> ?p ?o.
  VALUES ?s {
    <ex:a>
    <ex:b>
  }
}`);
    });

    it('should handle FILTER with one operation', () => {
      expect(instantiate(`
SELECT * WHERE {
  ?s ?p ?o.
  FILTER(?creationDate <= <ex:abc>(?x))
}`, { x: [ DF.namedNode('ex:s1') ]}, 0))
        .toBe(`SELECT * WHERE {
  ?s ?p ?o.
  FILTER(?creationDate <= (<ex:abc>(<ex:s1>)))
}`);
    });

    it('should handle FILTER with two operations', () => {
      expect(instantiate(`
SELECT * WHERE {
  ?s ?p ?o.
  FILTER(?creationDate <= <ex:abc>(?x) || ?creationDate >= <ex:abc>(?x))
}`, { x: [ DF.namedNode('ex:s1') ]}, 0))
        .toBe(`SELECT * WHERE {
  ?s ?p ?o.
  FILTER((?creationDate <= (<ex:abc>(<ex:s1>))) || (?creationDate >= (<ex:abc>(<ex:s1>))))
}`);
    });

    it('should handle FILTER NOT EXISTS', () => {
      expect(instantiate(`
SELECT * WHERE {
  ?s ?p ?o.
  FILTER NOT EXISTS {
    ?x ?p ?o.
  }
}`, { x: [ DF.namedNode('ex:s1') ]}, 0))
        .toBe(`SELECT * WHERE {
  ?s ?p ?o.
  FILTER(NOT EXISTS { <ex:s1> ?p ?o. })
}`);
    });

    it('should handle FILTER NOT EXISTS with GRAPH', () => {
      expect(instantiate(`
SELECT * WHERE {
  ?s ?p ?o.
  FILTER NOT EXISTS {
    GRAPH ?g {
      ?x ?p ?o.
    }
  }
}`, { x: [ DF.namedNode('ex:s1') ]}, 0))
        .toBe(`SELECT * WHERE {
  ?s ?p ?o.
  FILTER(NOT EXISTS { GRAPH ?g { <ex:s1> ?p ?o. } })
}`);
    });

    it('should handle FILTER NOT EXISTS with groups', () => {
      expect(instantiate(`
SELECT * WHERE {
  ?s ?p ?o.
  FILTER NOT EXISTS {
    {
      ?x ?p ?o.
    }
    {
      ?x ?p ?o.
    }
  }
}`, { x: [ DF.namedNode('ex:s1') ]}, 0))
        .toBe(`SELECT * WHERE {
  ?s ?p ?o.
  FILTER(NOT EXISTS {
    { <ex:s1> ?p ?o. }
    { <ex:s1> ?p ?o. }
  })
}`);
    });

    it('should handle aggregates', () => {
      expect(instantiate(`
SELECT (SUM(?s) AS ?sum) WHERE { ?s ?p ?o. }`, { x: [ DF.namedNode('ex:s1') ]}, 0))
        .toBe(`SELECT (SUM(?s) AS ?sum) WHERE { ?s ?p ?o. }`);
    });

    it('should handle GROUP BY', () => {
      expect(instantiate(`
SELECT ?s WHERE { ?s ?p ?o. }
GROUP BY ?s`, { x: [ DF.namedNode('ex:s1') ]}, 0))
        .toBe(`SELECT ?s WHERE { ?s ?p ?o. }
GROUP BY ?s`);
    });

    it('should throw when variable mapping is missing from context', () => {
      const query = `SELECT * WHERE { ?s ?p ?o. }`;
      const template = new QueryTemplate(new Parser().parse(query), {});
      const syntaxTree = new Parser().parse(query);
      expect(() => (<any>template).instantiateSyntaxTreeRecurse(
        syntaxTree,
        (<any>template).instantiateTerm,
        {},
      )).toThrow('Instantiation of syntax tree failed due to missing variableMapping in context');
    });

    it('should transform prefixes when transformer is provided', () => {
      const query = `PREFIX ex: <http://example.org/>
SELECT * WHERE { ?s ex:p ?o. }`;
      const syntaxTree = new Parser().parse(query);
      const transformer: IValueTransformer = {
        transform: value => DF.namedNode(`${value.value}transformed`),
      };
      const template = new QueryTemplate(syntaxTree, {}, transformer);
      const instantiated = template.instantiateSyntaxTreeWrap(syntaxTree, {});
      expect(instantiated.prefixes.ex).toBe('http://example.org/transformed');
    });

    it('should transform property paths when transformer is provided', () => {
      const query = `SELECT * WHERE { ?s <ex:p1>/<ex:p2> ?o. }`;
      const transformer: IValueTransformer = {
        transform: value => DF.namedNode(`${value.value}-t`),
      };
      const template = new QueryTemplate(new Parser().parse(query), {}, transformer);
      expect(template.instantiate(0))
        .toBe(`SELECT * WHERE { ?s (<ex:p1-t>/<ex:p2-t>) ?o. }`);
    });
  });
});

function instantiate(query: string, variableMappings: Record<string, RDF.Term[]>, counter: number): string {
  return new QueryTemplate(new Parser().parse(query), variableMappings).instantiate(counter);
}
