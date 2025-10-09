import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type { SelectQuery } from 'sparqljs';
import { Parser } from 'sparqljs';
import { QuerySequenceTemplate } from '../../lib/QuerySequenceTemplate';
import { extractTriplePatternsPerOperator } from '../../lib/utils/RefinementSequenceUtils';

const seedrandomFn = require('seedrandom');

const rng = seedrandomFn('test');

const DF = new DataFactory();

describe('countTriplePatternsPerOperator', () => {
  let singleVariableMapping: Record<string, RDF.Term>;

  beforeEach(() => {
    singleVariableMapping = { s: DF.namedNode('ex:s1') };
  });
  it('counts a flat query with one BGP correctly', () => {
    const parsedQuery = new Parser().parse(`SELECT * WHERE { ?s ?p ?o. }`);

    const template = new QuerySequenceTemplate(
      parsedQuery,
      { s: [ DF.namedNode('ex:s1') ]},
      {},
      rng,
      2,
      6,
    );

    const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping);
    expect(extractTriplePatternsPerOperator(syntaxTreeQuery.where!))
      .toEqual({ bgp: [[{
        subject: DF.namedNode('ex:s1'),
        predicate: DF.variable('p'),
        object: DF.variable('o'),
      }]]});
  });

  it('counts a query with OPTIONAL block', () => {
    const parsedQuery = new Parser().parse(`
        SELECT * WHERE {
            ?s ?p ?o.
            OPTIONAL { ?x ?y ?z. ?a ?b ?c. }
        }
        `);
    const template = new QuerySequenceTemplate(
      parsedQuery,
      { s: [ DF.namedNode('ex:s1') ]},
      {},
      rng,
      2,
      6,
    );

    const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping);
    expect(extractTriplePatternsPerOperator(syntaxTreeQuery.where!))
      .toEqual({
        bgp: [[
          {
            subject: DF.namedNode('ex:s1'),
            predicate: DF.variable('p'),
            object: DF.variable('o'),
          },
        ]],
        optional: [[
          {
            subject: DF.variable('x'),
            predicate: DF.variable('y'),
            object: DF.variable('z'),
          },
          {
            subject: DF.variable('a'),
            predicate: DF.variable('b'),
            object: DF.variable('c'),
          },
        ]],
      });
  });
  it('counts UNION block correctly', () => {
    const parsedQuery = new Parser().parse(`
        SELECT * WHERE {
            {
            ?a ?b ?c.
            } UNION {
            ?d ?e ?f.
            ?g ?h ?i.
            }
        }
        `);
    const template = new QuerySequenceTemplate(
      parsedQuery,
      { s: [ DF.namedNode('ex:s1') ]},
      {},
      rng,
      2,
      6,
    );

    const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping);
    expect(extractTriplePatternsPerOperator(syntaxTreeQuery.where!))
      .toEqual({
        union: [
          [
            {
              subject: DF.variable('a'),
              predicate: DF.variable('b'),
              object: DF.variable('c'),
            },
          ],
          [
            {
              subject: DF.variable('d'),
              predicate: DF.variable('e'),
              object: DF.variable('f'),
            },
            {
              subject: DF.variable('g'),
              predicate: DF.variable('h'),
              object: DF.variable('i'),
            },
          ],
        ],
      });
  });

  it('counts nested UNION inside OPTIONAL', () => {
    const parsedQuery = new Parser().parse(`
        SELECT * WHERE {
            OPTIONAL {
            {
                ?x ?y ?z.
            } UNION {
                ?a ?b ?c.
            }
            }
        }
        `);
    const template = new QuerySequenceTemplate(
      parsedQuery,
      { s: [ DF.namedNode('ex:s1') ]},
      {},
      rng,
      2,
      6,
    );

    const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping);
    expect(extractTriplePatternsPerOperator(syntaxTreeQuery.where!))
      .toEqual(
        {
          optional: [

          ],
          union: [
            [
              {
                subject: DF.variable('x'),
                predicate: DF.variable('y'),
                object: DF.variable('z'),
              },
            ],
            [
              {
                subject: DF.variable('a'),
                predicate: DF.variable('b'),
                object: DF.variable('c'),
              },
            ],
          ],
        },
      );
  });

  it('handles nested OPTIONAL inside UNION', () => {
    const parsedQuery = new Parser().parse(`
        SELECT * WHERE {
            {
            OPTIONAL { ?x ?y ?z. }
            } UNION {
            ?a ?b ?c.
            }
        }
        `);
    const template = new QuerySequenceTemplate(
      parsedQuery,
      { s: [ DF.namedNode('ex:s1') ]},
      {},
      rng,
      2,
      6,
    );

    const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping);
    expect(extractTriplePatternsPerOperator(syntaxTreeQuery.where!)).toEqual(
      {
        union: [[
          {
            subject: DF.variable('a'),
            predicate: DF.variable('b'),
            object: DF.variable('c'),
          },

        ]],
        optional: [[
          {
            subject: DF.variable('x'),
            predicate: DF.variable('y'),
            object: DF.variable('z'),
          },
        ]],
      },
    );
  });

  it('handles nested empty OPTIONAL', () => {
    const parsedQuery = new Parser().parse(`
        SELECT * WHERE {
            OPTIONAL {
            }
            ?s ?p ?o.
        }
        `);
    const template = new QuerySequenceTemplate(
      parsedQuery,
      { s: [ DF.namedNode('ex:s1') ]},
      {},
      rng,
      2,
      6,
    );

    const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping);
    expect(extractTriplePatternsPerOperator(syntaxTreeQuery.where!)).toEqual(
      {
        bgp: [[
          {
            subject: DF.namedNode('ex:s1'),
            predicate: DF.variable('p'),
            object: DF.variable('o'),
          },
        ]],
        optional: [],
      },
    );
  });

  it('counts subqueries correctly', () => {
    const parsedQuery = new Parser().parse(`
        SELECT * WHERE {
            {
            SELECT * WHERE {
                ?s ?p ?o.
            }
            }
            ?x ?y ?z.
        }
        `);
    const template = new QuerySequenceTemplate(
      parsedQuery,
      { s: [ DF.namedNode('ex:s1') ]},
      {},
      rng,
      2,
      6,
    );

    const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping);
    expect(extractTriplePatternsPerOperator(syntaxTreeQuery.where!)).toEqual(
      {
        bgp: [
          [
            {
              subject: DF.namedNode('ex:s1'),
              predicate: DF.variable('p'),
              object: DF.variable('o'),
            },
          ],
          [
            {
              subject: DF.variable('x'),
              predicate: DF.variable('y'),
              object: DF.variable('z'),
            },
          ],
        ],
      },
    );
  });
  it('handles deeply nested blocks', () => {
    const parsedQuery = new Parser().parse(`
        SELECT * WHERE {
            OPTIONAL {
            {
                {
                ?a ?b ?c.
                } UNION {
                OPTIONAL {
                    ?x ?y ?z.
                }
                }
            }
            }
        }
        `);
    const template = new QuerySequenceTemplate(
      parsedQuery,
      { s: [ DF.namedNode('ex:s1') ]},
      {},
      rng,
      2,
      6,
    );

    const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping);
    expect(extractTriplePatternsPerOperator(syntaxTreeQuery.where!))
      .toEqual(
        {
          optional: [[
            {
              subject: DF.variable('x'),
              predicate: DF.variable('y'),
              object: DF.variable('z'),
            },
          ]],
          union: [[
            {
              subject: DF.variable('a'),
              predicate: DF.variable('b'),
              object: DF.variable('c'),
            },
          ]],
        },
      );
  });

  it('handles empty WHERE clause', () => {
    const parsedQuery = new Parser().parse(`
        SELECT * WHERE {
        }
        `);
    const template = new QuerySequenceTemplate(
      parsedQuery,
      { s: [ DF.namedNode('ex:s1') ]},
      {},
      rng,
      2,
      6,
    );

    const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping);
    expect(extractTriplePatternsPerOperator(syntaxTreeQuery.where!)).toEqual({});
  });
});
