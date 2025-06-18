import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import { Generator, Parser, SelectQuery, Triple } from 'sparqljs';
import { QuerySequenceTemplate } from '../lib/QuerySequenceTemplate';
import { IQueryRefinementPattern } from '../lib/QuerySequenceTemplateProvider';


const DF = new DataFactory();

describe('QueryTemplate', () => {
    describe('countTriplePatternsPerOperator', () => {
        let singleVariableMapping: Record<string, RDF.Term>;

        beforeEach(() => {
            singleVariableMapping = { s: DF.namedNode('ex:s1') }
        });
        it('counts a flat query with one BGP correctly', () => {
            const parsedQuery = new Parser().parse(`SELECT * WHERE { ?s ?p ?o. }`)

            const template = new QuerySequenceTemplate(
                parsedQuery,
                { s: [DF.namedNode('ex:s1')] },
                {},
            );

            const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping)
            expect(template.extractTriplePatternsPerOperator(syntaxTreeQuery.where!))
                .toEqual({ query: [[{
                    subject: DF.namedNode('ex:s1'),
                    predicate: DF.variable('p'),
                    object: DF.variable('o')
                }]]}
            );
        });

        it('counts a query with OPTIONAL block', () => {
            const parsedQuery = new Parser().parse(`
            SELECT * WHERE {
                ?s ?p ?o.
                OPTIONAL { ?x ?y ?z. ?a ?b ?c. }
            }
            `) 
            const template = new QuerySequenceTemplate(
                parsedQuery,
                { s: [DF.namedNode('ex:s1')] },
                {},
            );

            const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping)
            expect(template.extractTriplePatternsPerOperator(syntaxTreeQuery.where!))
            .toEqual({
                query: [[
                    {
                    subject: DF.namedNode('ex:s1'),
                    predicate: DF.variable('p'),
                    object: DF.variable('o')
                    }
                ]],
                optional: [[
                    {
                        subject: DF.variable('x'),
                        predicate: DF.variable('y'),
                        object: DF.variable('z')
                    },
                    {
                        subject: DF.variable('a'),
                        predicate: DF.variable('b'),
                        object: DF.variable('c')
                    }
                ]]
            })
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
            `) 
            const template = new QuerySequenceTemplate(
                parsedQuery,
                { s: [DF.namedNode('ex:s1')] },
                {},
            );

            const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping)
            expect(template.extractTriplePatternsPerOperator(syntaxTreeQuery.where!))
            .toEqual({
                union: [
                    [
                        {
                            subject: DF.variable('a'),
                            predicate: DF.variable('b'),
                            object: DF.variable('c')
                        },
                    ],
                    [
                        {
                            subject: DF.variable('d'),
                            predicate: DF.variable('e'),
                            object: DF.variable('f')
                        },
                        {
                            subject: DF.variable('g'),
                            predicate: DF.variable('h'),
                            object: DF.variable('i')
                        },
                    ]
                ]
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
            `) 
            const template = new QuerySequenceTemplate(
                parsedQuery,
                { s: [DF.namedNode('ex:s1')] },
                {},
            );

            const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping)
            expect(template.extractTriplePatternsPerOperator(syntaxTreeQuery.where!))
            .toEqual(
                { 
                    optional: [

                    ], 
                    union: [
                        [
                            {
                                subject: DF.variable('x'),
                                predicate: DF.variable('y'),
                                object: DF.variable('z')
                            }
                        ],
                        [                 
                            {
                                subject: DF.variable('a'),
                                predicate: DF.variable('b'),
                                object: DF.variable('c')
                            },
                        ]   
                    ]
                }
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
            `) 
            const template = new QuerySequenceTemplate(
                parsedQuery,
                { s: [DF.namedNode('ex:s1')] },
                {},
            );

            const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping)
            expect(template.extractTriplePatternsPerOperator(syntaxTreeQuery.where!)).toEqual(
                { 
                    union: [[
                        {
                            subject: DF.variable('a'),
                            predicate: DF.variable('b'),
                            object: DF.variable('c')
                        },

                    ]], 
                    optional: [[
                        {
                            subject: DF.variable('x'),
                            predicate: DF.variable('y'),
                            object: DF.variable('z')
                        },
                    ]]
                }
            );
        });

        it('handles nested empty OPTIONAL', () => {
            const parsedQuery = new Parser().parse(`
            SELECT * WHERE {
                OPTIONAL {
                }
                ?s ?p ?o.
            }
            `) 
            const template = new QuerySequenceTemplate(
                parsedQuery,
                { s: [DF.namedNode('ex:s1')] },
                {},
            );

            const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping)
            expect(template.extractTriplePatternsPerOperator(syntaxTreeQuery.where!)).toEqual(
                { 
                    query: [[
                        {
                            subject: DF.namedNode('ex:s1'),
                            predicate: DF.variable('p'),
                            object: DF.variable('o')
                        },
                    ]], 
                    optional: [] 
                }
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
            `) 
            const template = new QuerySequenceTemplate(
                parsedQuery,
                { s: [DF.namedNode('ex:s1')] },
                {},
            );

            const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping)
            expect(template.extractTriplePatternsPerOperator(syntaxTreeQuery.where!)).toEqual(
                { 
                    query: [
                        [
                            {
                                subject: DF.namedNode('ex:s1'),
                                predicate: DF.variable('p'),
                                object: DF.variable('o')
                            },
                        ],
                        [
                            {
                                subject: DF.variable('x'),
                                predicate: DF.variable('y'),
                                object: DF.variable('z')
                            },
                        ]
                    ], 
                }
            );
        });

        // it('ignores filters', () => {
        //     const parsedQuery = new Parser().parse(`
        //     SELECT * WHERE {
        //         ?s ?p ?o.
        //         FILTER(?o > 5)
        //     }
        //     `) 
        //     const template = new QuerySequenceTemplate(
        //         parsedQuery,
        //         { s: [DF.namedNode('ex:s1')] },
        //         {},
        //     );

        //     const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping)
        //     template.extractTriplePatternsPerOperator(syntaxTreeQuery.where!, operatorTriples, 'query')

        //     expect(operatorTriples).toEqual({ query: 1 });
        // });

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
            `) 
            const template = new QuerySequenceTemplate(
                parsedQuery,
                { s: [DF.namedNode('ex:s1')] },
                {},
            );

            const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping)
            expect(template.extractTriplePatternsPerOperator(syntaxTreeQuery.where!))
            .toEqual(
                { 
                    optional: [[
                        {
                            subject: DF.variable('x'),
                            predicate: DF.variable('y'),
                            object: DF.variable('z')
                        },
                    ]], 
                    union: [[
                        {
                            subject: DF.variable('a'),
                            predicate: DF.variable('b'),
                            object: DF.variable('c')
                        },
                    ]] 
                }
            );
        });

        it('handles empty WHERE clause', () => {
            const parsedQuery = new Parser().parse(`
            SELECT * WHERE {
            }
            `) 
            const template = new QuerySequenceTemplate(
                parsedQuery,
                { s: [DF.namedNode('ex:s1')] },
                {},
            );

            const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(parsedQuery, singleVariableMapping)
            expect(template.extractTriplePatternsPerOperator(syntaxTreeQuery.where!)).toEqual({});
        });
    });
    
    describe('findValidRefinementPatterns', () => {
        let template: QuerySequenceTemplate;
        let additionPattern1: IQueryRefinementPattern;
        let additionPattern2: IQueryRefinementPattern;
        let additionPattern3: IQueryRefinementPattern;
        let removalPattern1: IQueryRefinementPattern;
        let removalPattern2: IQueryRefinementPattern;
        let removalPattern3: IQueryRefinementPattern;

        let allPatterns: IQueryRefinementPattern[]

        let queryString: string;
        let variableMapping: Record<string, RDF.Term[]>;
        let singleVariableMapping: Record<string, RDF.Term>;

        beforeEach(() => {
            queryString = ` SELECT * WHERE {
                ?s ?p ?o
                }`
            template = new QuerySequenceTemplate(
                new Parser().parse(queryString), 
                { s: [ DF.namedNode('ex:s1') ]},
                {},
            );
            variableMapping = { s: [ DF.namedNode('ex:s1') ]};
            singleVariableMapping = { s: DF.namedNode('ex:s1') }

            additionPattern1 =   {
                "type": "QUERY",
                "operation": "addition",
                "description": "",
                "location": 0,
                "target": [
                {
                    "subject": "?s",
                    "predicate": "snvoc:isModeratorOf",
                    "object": "?forum"
                }
                ]
            }
            additionPattern2 = {
                "type": "QUERY",
                "operation": "addition",
                "description": "",
                "location": 0,
                "target": [ ]
            }
            additionPattern3 = {
                "type": "UNION",
                "operation": "addition",
                "description": "",
                "location": 0,
                "target": [
                {
                    "subject": "?s",
                    "predicate": "snvoc:isModeratorOf",
                    "object": "?forum"
                }
                ]
            }
            removalPattern1 =   {
                "type": "QUERY",
                "operation": "removal",
                "description": "",
                "location": 0,
                "target": [
                {
                    "subject": "?s",
                    "predicate": "snvoc:isModeratorOf",
                    "object": "?forum"
                }
                ]
            }
            removalPattern2 = {
                "type": "QUERY",
                "operation": "removal",
                "description": "",
                "location": 0,
                "target": [ ]
            }
            removalPattern3 = {
                "type": "UNION",
                "operation": "removal",
                "description": "",
                "location": 0,
                "target": [
                {
                    "subject": "?s",
                    "predicate": "snvoc:isModeratorOf",
                    "object": "?forum"
                }
                ]
            }
            allPatterns = [additionPattern1, additionPattern2, additionPattern3,
                removalPattern1, removalPattern2, removalPattern3
            ]
        })
        it('should correctly filter for 1 triple pattern query',
            () => {
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    }
                ]]
            }
            expect(template.findValidRefinementPatterns(
                operatorTriplePatterns, allPatterns, [], [])
            ).toEqual([additionPattern1, additionPattern3])
        });
        it('should correctly filter for 2 triple pattern query', () => {
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    },
                    {
                        subject: DF.namedNode('ex:s2'),
                        predicate: DF.variable('p1'),
                        object: DF.variable('o1'),
                    }
                ]]
            }
            expect(template.findValidRefinementPatterns(
                operatorTriplePatterns, allPatterns, [], [])
            ).toEqual([additionPattern1, additionPattern3, removalPattern2])
        });
        it('should correctly filter for 2 triple pattern query with tp in union', () => {
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    }
                ]],
                union: [[
                    {
                        subject: DF.variable('s'),
                        predicate: DF.namedNode('snvoc:isModeratorOf'),
                        object: DF.variable('forum'),
                    }
                ]]
            }
            expect(template.findValidRefinementPatterns(
                operatorTriplePatterns, allPatterns, [], [])
            ).toEqual([additionPattern1, additionPattern3, removalPattern2, removalPattern3])
        });
        it('should correctly filter for 2 triple pattern query with tp not in union', () => {
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    }
                ]],
                union: [[
                    {
                        subject: DF.variable('s'),
                        predicate: DF.namedNode('snvoc:isModerator'),
                        object: DF.variable('forum'),
                    }
                ]]
            }
            expect(template.findValidRefinementPatterns(
                operatorTriplePatterns, allPatterns, [], [])
            ).toEqual([additionPattern1, additionPattern3, removalPattern2])
        });
        it('should correctly filter for 2 triple pattern query with removal in query', () => {
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    },
                    {
                        subject: DF.variable('s'),
                        predicate: DF.namedNode('snvoc:isModeratorOf'),
                        object: DF.variable('forum'),
                    }
                ]]
            }
            expect(template.findValidRefinementPatterns(
                operatorTriplePatterns, allPatterns, [], [])
            ).toEqual([additionPattern1, additionPattern3, removalPattern1, removalPattern2])
        });
        it('should correctly filter already applied pattern in query', () => {
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    },
                    {
                        subject: DF.variable('s'),
                        predicate: DF.namedNode('snvoc:isModeratorOf'),
                        object: DF.variable('forum'),
                    }
                ]]
            }
            expect(template.findValidRefinementPatterns(
                operatorTriplePatterns, allPatterns, 
                [{
                    subject: "?s",
                    predicate: "snvoc:isModeratorOf",
                    object: "?forum"
                }], 
                [])
            ).toEqual([removalPattern1, removalPattern2])
        });
        it('should correctly filter already applied pattern in union', () => {
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    },
                ]],
                union: [[
                    {
                        subject: DF.variable('s'),
                        predicate: DF.namedNode('snvoc:isModeratorOf'),
                        object: DF.variable('forum'),
                    }
                ]]
            }
            expect(template.findValidRefinementPatterns(
                operatorTriplePatterns, allPatterns,                 
                [{
                    subject: "?s",
                    predicate: "snvoc:isModeratorOf",
                    object: "?forum"
                }], 
                [])
            ).toEqual([removalPattern2, removalPattern3])
        });
        it('should correctly filter for query with removed triples', () => {
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    },
                ]]
            }
            const removedTriples: Triple[] = [
                {
                    subject: DF.variable('s'),
                    predicate: DF.namedNode('snvoc:isModeratorOf'),
                    object: DF.variable('forum'),
                }
            ]
            expect(template.findValidRefinementPatterns(
                operatorTriplePatterns, allPatterns, [], removedTriples)
            ).toEqual([additionPattern1, additionPattern2, additionPattern3])
        });
    });
    describe('applyRefinementPattern', () => {
        let variableMappings: Record<string, RDF.Term[]>;
        beforeEach(() => {
            variableMappings = { s: [ DF.namedNode('ex:s1') ]}
        })
        it('should add triple to simple bgp with wildcard', () => {
            const queryString = ` SELECT * WHERE {
                ?s ?p ?o
            }`
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    },
                ]]
            }
            const refinementPattern: IQueryRefinementPattern =   {
                "type": "QUERY",
                "operation": "addition",
                "description": "Add triple for the person being a moderator of a forum",
                "location": 0,
                "target": [
                {
                    "subject": "?s",
                    "predicate": "snvoc:isModeratorOf",
                    "object": "?forum"
                }
                ]
            }

            const input = createRefinementInput(queryString, variableMappings, refinementPattern)
            const transformed = input.template.applyRefinementPattern(
                refinementPattern, input.query, operatorTriplePatterns, input.variableMapping, []
            );
            expect(new Generator().stringify(transformed.query)).toEqual(
                `SELECT * WHERE {
  <ex:s1> ?p ?o;
    <snvoc:isModeratorOf> ?forum.
}`
            )
        });
        it('should add triple to simple bgp without wildcard', () => {
            const queryString = ` SELECT ?o WHERE {
                ?s ?p ?o
            }`
            const refinementPattern: IQueryRefinementPattern =   {
                "type": "QUERY",
                "operation": "addition",
                "description": "Add triple for the person being a moderator of a forum",
                "location": 0,
                "target": [
                {
                    "subject": "?s",
                    "predicate": "snvoc:isModeratorOf",
                    "object": "?forum"
                }
                ]
            }
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    },
                ]]
            }

            const input = createRefinementInput(queryString, variableMappings, refinementPattern)
            const transformed = input.template.applyRefinementPattern(
                refinementPattern, input.query, operatorTriplePatterns, input.variableMapping, []
            );
            expect(new Generator().stringify(transformed.query)).toEqual(
                `SELECT ?o ?forum WHERE {
  <ex:s1> ?p ?o;
    <snvoc:isModeratorOf> ?forum.
}`
            )
        });
        it('should add triple to correct sub-bgp', () => {
            const queryString = ` SELECT ?o WHERE {
                ?s ?p ?o
                {
                    SELECT * WHERE {
                        ?s ?p1 <ex:o1>
                    }
                }
            }`
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [
                    [
                        {
                            subject: DF.namedNode('ex:s1'),
                            predicate: DF.variable('p'),
                            object: DF.variable('o'),
                        },
                    ],
                    [
                        {
                            subject: DF.namedNode('ex:s1'),
                            predicate: DF.variable('p'),
                            object: DF.namedNode('ex:o1'),
                        },
                    ]
                ]
            }

            const refinementPattern: IQueryRefinementPattern =   {
                "type": "QUERY",
                "operation": "addition",
                "description": "Add triple for the person being a moderator of a forum",
                "location": 1,
                "target": [
                {
                    "subject": "?s",
                    "predicate": "snvoc:isModeratorOf",
                    "object": "?forum"
                }
                ]
            }
            const input = createRefinementInput(queryString, variableMappings, refinementPattern)
            const transformed = input.template.applyRefinementPattern(
                refinementPattern, input.query, operatorTriplePatterns, input.variableMapping, []
            );
            expect(new Generator().stringify(transformed.query)).toEqual(
                `SELECT ?o ?forum WHERE {
  <ex:s1> ?p ?o.
  {
    SELECT * WHERE {
      <ex:s1> ?p1 <ex:o1>;
        <snvoc:isModeratorOf> ?forum.
    }
  }
}`
            )
        });
        it('should add new union operator to query (first position)', () => {
            const queryString = ` SELECT * WHERE {
                ?s ?p ?o
            }`
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    },
                ]]
            }
            const refinementPattern: IQueryRefinementPattern =   {
                "type": "UNION",
                "operation": "addition",
                "description": "Add union triple for the person being a moderator of a forum",
                "location": 0,
                "target": [
                {
                    "subject": "?s",
                    "predicate": "snvoc:isModeratorOf",
                    "object": "?forum"
                }
                ]
            }

            const input = createRefinementInput(queryString, variableMappings, refinementPattern)
            const transformed = input.template.applyRefinementPattern(
                refinementPattern, input.query, operatorTriplePatterns, input.variableMapping, []
            );
            expect(new Generator().stringify(transformed.query)).toEqual(
                `SELECT * WHERE {
  <ex:s1> ?p ?o.
  { <ex:s1> <snvoc:isModeratorOf> ?forum. }
  UNION
  {  }
}`
            )

        });
        it('should add new union operator to query (second position)', () => {
            const queryString = ` SELECT * WHERE {
                ?s ?p ?o
            }`
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    },
                ]]
            }
            const refinementPattern: IQueryRefinementPattern =   {
                "type": "UNION",
                "operation": "addition",
                "description": "Add union triple for the person being a moderator of a forum",
                "location": 1,
                "target": [
                {
                    "subject": "?s",
                    "predicate": "snvoc:isModeratorOf",
                    "object": "?forum"
                }
                ]
            }

            const input = createRefinementInput(queryString, variableMappings, refinementPattern)
            const transformed = input.template.applyRefinementPattern(
                refinementPattern, input.query, operatorTriplePatterns, input.variableMapping, []
            );
            expect(new Generator().stringify(transformed.query)).toEqual(
                `SELECT * WHERE {
  <ex:s1> ?p ?o.
  {  }
  UNION
  { <ex:s1> <snvoc:isModeratorOf> ?forum. }
}`
            )
        });

        it ('should add to the correct union operator block', () => {
            const queryString = `SELECT * WHERE {
                ?s ?p ?o.
                { ?x ?y ?z. }
                 UNION 
                { ?a ?b ?c. }
                { ?k ?l ?m. }
                 UNION 
                { ?x ?p ?o. }
            }`
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    },
                ]]
            }
            const refinementPattern: IQueryRefinementPattern =   {
                "type": "UNION",
                "operation": "addition",
                "description": "Add union triple for the person being a moderator of a forum",
                "location": 2,
                "target": [
                {
                    "subject": "?s",
                    "predicate": "snvoc:isModeratorOf",
                    "object": "?forum"
                }
                ]
            }

            const input = createRefinementInput(queryString, variableMappings, refinementPattern)
            const transformed = input.template.applyRefinementPattern(
                refinementPattern, input.query, operatorTriplePatterns, input.variableMapping, []
            );
            expect(new Generator().stringify(transformed.query)).toEqual(
`SELECT * WHERE {
  <ex:s1> ?p ?o.
  { ?x ?y ?z. }
  UNION
  { ?a ?b ?c. }
  {
    ?k ?l ?m.
    <ex:s1> <snvoc:isModeratorOf> ?forum.
  }
  UNION
  { ?x ?p ?o. }
}`
            )
            
        });
        it('should add new optional operator to query', () => {
            const queryString = ` SELECT * WHERE {
                ?s ?p ?o
            }`
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    },
                ]]
            }
            const refinementPattern: IQueryRefinementPattern =   {
                "type": "OPTIONAL",
                "operation": "addition",
                "description": "Add optional triple for the person being a moderator of a forum",
                "location": 0,
                "target": [
                {
                    "subject": "?s",
                    "predicate": "snvoc:isModeratorOf",
                    "object": "?forum"
                }
                ]
            }

            const input = createRefinementInput(queryString, variableMappings, refinementPattern)
            const transformed = input.template.applyRefinementPattern(
                refinementPattern, input.query, operatorTriplePatterns, input.variableMapping, []
            );
            expect(new Generator().stringify(transformed.query)).toEqual(
                `SELECT * WHERE {
  <ex:s1> ?p ?o.
  OPTIONAL { <ex:s1> <snvoc:isModeratorOf> ?forum. }
}`
            )
        });
        it('should add to correct optional operator block', () => {
            const queryString = ` SELECT * WHERE {
                ?s ?p ?o
                OPTIONAL { ?a ?b ?c }
                OPTIONAL { ?s ?y ?x }
            }`
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    },
                ]]
            }
            const refinementPattern: IQueryRefinementPattern =   {
                "type": "OPTIONAL",
                "operation": "addition",
                "description": "Add optional triple for the person being a moderator of a forum",
                "location": 1,
                "target": [
                {
                    "subject": "?s",
                    "predicate": "snvoc:isModeratorOf",
                    "object": "?forum"
                }
                ]
            }

            const input = createRefinementInput(queryString, variableMappings, refinementPattern)
            const transformed = input.template.applyRefinementPattern(
                refinementPattern, input.query, operatorTriplePatterns, input.variableMapping, []
            );
            expect(new Generator().stringify(transformed.query)).toEqual(
                `SELECT * WHERE {
  <ex:s1> ?p ?o.
  OPTIONAL { ?a ?b ?c. }
  OPTIONAL {
    <ex:s1> ?y ?x;
      <snvoc:isModeratorOf> ?forum.
  }
}`
            )
        });
        it('should remove random triple from simple bgp when target is not set', () => {
            const queryString = ` SELECT * WHERE {
                ?s ?p ?o.
                ?x ?o ?b
            }`
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    },
                ]]
            }
            const refinementPattern: IQueryRefinementPattern =   {
                "type": "QUERY",
                "operation": "removal",
                "description": "Remove random triple",
                "location": 0,
                "target": [ ]
            }

            const input = createRefinementInput(queryString, variableMappings, refinementPattern);
            
            (<any> input.template).rng = jest.fn().mockReturnValue(0.99);

            const transformed = input.template.applyRefinementPattern(
                refinementPattern, input.query, operatorTriplePatterns, input.variableMapping, []
            );
            expect(new Generator().stringify(transformed.query)).toEqual(
                `SELECT * WHERE { <ex:s1> ?p ?o. }`
            )
        });
        it('should remove any triple from simple bgp', () => {
            const queryString = ` SELECT * WHERE {
                ?s ?p ?o.
                ?x ?o ?b
            }`
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    },
                ]]
            }
            const refinementPattern: IQueryRefinementPattern =   {
                "type": "QUERY",
                "operation": "removal",
                "description": "Remove random triple",
                "location": 0,
                "target": [ 
                    {
                        "subject": "?s",
                        "predicate": "?p",
                        "object": "?o"
                    }
                ]
            }

            const input = createRefinementInput(queryString, variableMappings, refinementPattern);

            const transformed = input.template.applyRefinementPattern(
                refinementPattern, input.query, operatorTriplePatterns, input.variableMapping, []
            );
            expect(new Generator().stringify(transformed.query)).toEqual(
                `SELECT * WHERE { ?x ?o ?b. }`
            )
        });
        it('should remove correct random triple in nested query when target is not set', () => {
            const queryString = `
            SELECT * WHERE {
                {
                SELECT * WHERE {
                    ?s ?p ?o.
                }
                }
                ?x ?y ?z.
            }
            `
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    },
                ]]
            }
            const refinementPattern: IQueryRefinementPattern =   {
                "type": "QUERY",
                "operation": "removal",
                "description": "Remove random triple",
                "location": 1,
                "target": [ 
                ]
            }

            const input = createRefinementInput(queryString, variableMappings, refinementPattern);
            (<any> input.template).rng = jest.fn().mockReturnValue(0.99);

            const transformed = input.template.applyRefinementPattern(
                refinementPattern, input.query, operatorTriplePatterns, input.variableMapping, []
            );
            console.log(new Generator().stringify(transformed.query))
            expect(new Generator().stringify(transformed.query)).toEqual(
`SELECT * WHERE {
  { SELECT * WHERE { <ex:s1> ?p ?o. } }
  
}`
            )
        });
        it('should remove correct triple in nested query', () => {
            const queryString = `
            SELECT * WHERE {
                {
                SELECT * WHERE {
                    ?s ?p ?o.
                }
                }
                ?x ?y ?z.
            }
            `
            const operatorTriplePatterns: Record<string, Triple[][]> = {
                query: [[
                    {
                        subject: DF.namedNode('ex:s1'),
                        predicate: DF.variable('p'),
                        object: DF.variable('o'),
                    },
                ]]
            }
            const refinementPattern: IQueryRefinementPattern =   {
                "type": "QUERY",
                "operation": "removal",
                "description": "Remove random triple",
                "location": 0,
                "target": [ 
                    {
                        "subject": "?s",
                        "predicate": "?p",
                        "object": "?o"
                    }
                ]
            }

            const input = createRefinementInput(queryString, variableMappings, refinementPattern);

            const transformed = input.template.applyRefinementPattern(
                refinementPattern, input.query, operatorTriplePatterns, input.variableMapping, []
            );
            expect(new Generator().stringify(transformed.query)).toEqual(        
`SELECT * WHERE {
  { SELECT * WHERE {  } }
  ?x ?y ?z.
}`
            )
        });
        it('should remove correct union (left-side)', () => {
            const queryString = `
                SELECT * WHERE {
                { ?s ?p ?o } UNION { ?x ?y ?z }
                }`;

            const operatorTriplePatterns = {
                union: [[
                {
                    subject: DF.namedNode('ex:s1'),
                    predicate: DF.variable('p'),
                    object: DF.variable('o'),
                }
                ]]
            };

            const refinementPattern: IQueryRefinementPattern = {
                type: "UNION",
                operation: "removal",
                description: "",
                location: 0,
                target: [
                    {
                        "subject": "?s",
                        "predicate": "?p",
                        "object": "?o"
                    }
                ]
            };

            const input = createRefinementInput(queryString, variableMappings, refinementPattern);

            const transformed = input.template.applyRefinementPattern(
                refinementPattern, input.query, operatorTriplePatterns, input.variableMapping, []
            );

            expect(new Generator().stringify(transformed.query)).toEqual(
            `SELECT * WHERE {
  {  }
  UNION
  { ?x ?y ?z. }
}`
            );
        });
        // USE CHATGPT OUTPUT FOR THIS! ALSO CHECK IF WE CAN JUST REUSE REMOVAL CODE FOR ALL OPERATORS
        it('should remove correct union (right-side)', () => {
            const queryString = `
                SELECT * WHERE {
                { ?s ?p ?o } UNION { ?x ?y ?z }
                }`;

            const operatorTriplePatterns = {
                union: [[
                {
                    subject: DF.variable('x'),
                    predicate: DF.variable('y'),
                    object: DF.variable('z'),
                }
                ]]
            };

            const refinementPattern: IQueryRefinementPattern = {
                type: "UNION",
                operation: "removal",
                description: "",
                location: 1,
                target: [
                    {
                        "subject": "?x",
                        "predicate": "?y",
                        "object": "?z"
                    }
                ]
            };

            const input = createRefinementInput(queryString, variableMappings, refinementPattern);

            const transformed = input.template.applyRefinementPattern(
                refinementPattern, input.query, operatorTriplePatterns, input.variableMapping, []
            );

            expect(new Generator().stringify(transformed.query)).toEqual(
            `SELECT * WHERE {
  { <ex:s1> ?p ?o. }
  UNION
  {  }
}`
            );
        });
        it('should remove correct nested union', () => {
            const queryString = `
                SELECT * WHERE {
                {
                    { ?s ?p ?o. } UNION { 
                     { ?x ?y ?z. } UNION {
                        ?z ?k ?o.
                        ?s ?p ?o.
                      }
                     }
                }
                ?a ?b ?c.
                }`;
            const operatorTriplePatterns = {
                union: [[
                {
                    subject: DF.variable('x'),
                    predicate: DF.variable('y'),
                    object: DF.variable('z'),
                }
                ]]
            };

            const refinementPattern: IQueryRefinementPattern = {
                type: "UNION",
                operation: "removal",
                description: "",
                location: 2,
                target: [
                    {
                        "subject": "?z",
                        "predicate": "?k",
                        "object": "?o"
                    }
                ]
            };
            const input = createRefinementInput(queryString, variableMappings, refinementPattern);
            const transformed = input.template.applyRefinementPattern(
                refinementPattern, input.query, operatorTriplePatterns, input.variableMapping, []
            );

            expect(new Generator().stringify(transformed.query)).toEqual(
            `SELECT * WHERE {
  {
    { <ex:s1> ?p ?o. }
    UNION
    {
      { ?x ?y ?z. }
      UNION
      { <ex:s1> ?p ?o. }
    }
  }
  ?a ?b ?c.
}`
            );

        });
        it('should leave empty union operator if all triple patterns are removed', () => {
            const queryString = `
                SELECT * WHERE {
                { } UNION { ?x ?y ?z }
                }`;
            const operatorTriplePatterns = {
                union: [[
                {
                    subject: DF.variable('x'),
                    predicate: DF.variable('y'),
                    object: DF.variable('z'),
                }
                ]]
            };

            const refinementPattern: IQueryRefinementPattern = {
                type: "UNION",
                operation: "removal",
                description: "",
                location: 0,
                target: [
                    {
                        subject: "?s",
                        predicate: "?p",
                        object: "?o"
                    },
                    {
                        subject: "?x",
                        predicate: "?y",
                        object: "?z"
                    }
                ]
            };
            const input = createRefinementInput(queryString, variableMappings, refinementPattern);
            const transformed = input.template.applyRefinementPattern(
                refinementPattern, input.query, operatorTriplePatterns, input.variableMapping, []
            );

            expect(new Generator().stringify(transformed.query)).toEqual(
            `SELECT * WHERE {
  {  }
  UNION
  {  }
}`
            )
        });
    })
})


/**
 * Helper function to create the required input for instantiating a refinement pattern.
 * @param query Query string 
 * @param variableMappings Mapping variable names to potential values, only first will be picked for 
 * instantiation
 * @param refinementPattern The refinement pattern used to create alternative version of query
 * @returns input data required to apply refinement
 */
function createRefinementInput(query: string, variableMappings: Record<string, RDF.Term[]>,
    refinementPattern: IQueryRefinementPattern): IRefinementInput {
  const template = new QuerySequenceTemplate(
    new Parser().parse(query), 
    variableMappings,
    {},
    [refinementPattern]
   );

   // Simulate choosing a variable
   const singleVariableMapping = Object.fromEntries(
    Object.entries(variableMappings)
        .filter(([_, arr]) => arr.length > 0)
        .map(([key, arr]) => [key, arr[0]])
   );
   const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTree(new Parser().parse(query), singleVariableMapping)
   return {
    query: syntaxTreeQuery,
    variableMapping: singleVariableMapping,
    template: template
   }
}

export interface IRefinementInput {
    query: SelectQuery,
    variableMapping: Record<string, RDF.Term>
    template: QuerySequenceTemplate
}
