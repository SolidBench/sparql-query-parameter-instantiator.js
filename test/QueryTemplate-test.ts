import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import { Parser } from 'sparqljs';
import { QueryTemplate } from '../lib/QueryTemplate';
const DF = new DataFactory();

describe('QueryTemplate', () => {
  describe('instantiate', () => {
    it('instantiated without variables', () => {
      expect(instantiate(`
SELECT * WHERE {
  ?s ?p ?o.
}`, {}, 0)).toEqual(`SELECT * WHERE { ?s ?p ?o. }`);
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
      }, 0)).toEqual(`SELECT * WHERE { <ex:s1> ?p ?o. }`);
      expect(instantiate(`
SELECT * WHERE {
  ?s ?p ?o.
}`, {
        s: [
          DF.namedNode('ex:s1'),
          DF.namedNode('ex:s2'),
        ],
      }, 1)).toEqual(`SELECT * WHERE { <ex:s2> ?p ?o. }`);
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
      }, 0)).toEqual(`SELECT * WHERE { <ex:s1> <ex:p1> ?o. }`);
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
      }, 1)).toEqual(`SELECT * WHERE { <ex:s2> <ex:p2> ?o. }`);
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
      }, 2)).toThrowError(`Attempted to instantiate a query template more than the number of provided subsitution parameters (2)`);
    });

    it('instantiated for a construct query', () => {
      expect(() => instantiate(`
CONSTRUCT WHERE {
  ?s ?p ?o.
}`, {}, 0)).toThrowError(`Only instantiations of SELECT queries are supported`);
    });

    it('instantiated for an update query', () => {
      expect(() => instantiate(`
DELETE WHERE {
  ?s ?p ?o.
}`, {}, 0)).toThrowError(`Only instantiations of SELECT queries are supported`);
    });

    it('should remove variables from the select clause', () => {
      expect(instantiate(`
SELECT ?s ?p ?o WHERE {
  ?s ?p ?o.
}`, { s: [ DF.namedNode('ex:s1') ]}, 0))
        .toEqual(`SELECT ?p ?o WHERE { <ex:s1> ?p ?o. }`);
    });

    it('should handle sub-projections', () => {
      expect(instantiate(`
SELECT * WHERE {
  SELECT * WHERE {
    ?s ?p ?o.
  }
}`, { s: [ DF.namedNode('ex:s1') ]}, 0))
        .toEqual(`SELECT * WHERE { SELECT * WHERE { <ex:s1> ?p ?o. } }`);
    });

    it('should handle GRAPH over triple patterns', () => {
      expect(instantiate(`
SELECT * WHERE {
  GRAPH ?g {
    ?s ?p ?o.
  }
}`, { s: [ DF.namedNode('ex:s1') ]}, 0))
        .toEqual(`SELECT * WHERE { GRAPH ?g { <ex:s1> ?p ?o. } }`);
    });

    it('should handle GRAPH over property paths', () => {
      expect(instantiate(`
SELECT * WHERE {
  GRAPH ?g {
    ?s <ex:p1>/<ex:p2> ?o.
  }
}`, { s: [ DF.namedNode('ex:s1') ]}, 0))
        .toEqual(`SELECT * WHERE { GRAPH ?g { <ex:s1> (<ex:p1>/<ex:p2>) ?o. } }`);
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
        .toEqual(`SELECT * WHERE {
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
        .toEqual(`SELECT * WHERE {
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
        .toEqual(`SELECT * WHERE {
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
        .toEqual(`SELECT * WHERE {
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
        .toEqual(`SELECT * WHERE {
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
        .toEqual(`SELECT * WHERE {
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
        .toEqual(`SELECT * WHERE {
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
        .toEqual(`SELECT * WHERE {
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
        .toEqual(`SELECT * WHERE {
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
        .toEqual(`SELECT (SUM(?s) AS ?sum) WHERE { ?s ?p ?o. }`);
    });

    it('should handle GROUP BY', () => {
      expect(instantiate(`
SELECT ?s WHERE { ?s ?p ?o. }
GROUP BY ?s`, { x: [ DF.namedNode('ex:s1') ]}, 0))
        .toEqual(`SELECT ?s WHERE { ?s ?p ?o. }
GROUP BY ?s`);
    });
  });
});

function instantiate(query: string, variableMappings: Record<string, RDF.Term[]>, counter: number): string {
  return new QueryTemplate(new Parser().parse(query), variableMappings).instantiate(counter);
}
