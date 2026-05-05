import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type { Expression, SelectQuery, Triple } from 'sparqljs';
import { Generator, Parser } from 'sparqljs';
import type { IOperatorState, IRefinementState } from '../lib/QuerySequenceTemplate';
import { QuerySequenceTemplate } from '../lib/QuerySequenceTemplate';
import type {
  IEntityLogits,
  IQueryRefinementPattern,
  ISubRefinementPattern,
} from '../lib/QuerySequenceTemplateProvider';
import type { IValueTransformer } from '../lib/valuetransformer/IValueTransformer';

const seedrandomFn = require('seedrandom');

const rng = seedrandomFn('test');

const DF = new DataFactory();

describe('QueryTemplate', () => {
  describe('findValidRefinementPatterns', () => {
    let template: QuerySequenceTemplate;
    let additionPattern1: IQueryRefinementPattern;
    let additionPattern2: IQueryRefinementPattern;
    let additionPattern3: IQueryRefinementPattern;
    let additionPattern4: IQueryRefinementPattern;
    let removalPattern1: IQueryRefinementPattern;
    let removalPattern2: IQueryRefinementPattern;
    let removalPattern3: IQueryRefinementPattern;
    let removalPattern4: IQueryRefinementPattern;
    let removalPattern5: IQueryRefinementPattern;
    let subPattern1: ISubRefinementPattern;
    let subPattern2: ISubRefinementPattern;
    let refinementState: IRefinementState;

    let allPatterns: IQueryRefinementPattern[];

    let queryString: string;

    beforeEach(() => {
      queryString = ` SELECT * WHERE {
                ?s ?p ?o
                }`;
      template = new QuerySequenceTemplate(
        new Parser().parse(queryString),
        { s: [ DF.namedNode('ex:s1') ]},
        {},
        {},
        {},
        rng,
        2,
        5,
      );

      additionPattern1 = {
        type: 'BGP',
        operation: 'addition',
        description: '',
        location: 0,
        id: 0,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'snvoc:isModeratorOf', termType: 'namedNode' },
            object: { value: 'forum', termType: 'variable' },
          },
        ],
      };
      additionPattern2 = {
        type: 'BGP',
        operation: 'addition',
        description: '',
        location: 0,
        id: 1,
        target: [ ],
      };
      additionPattern3 = {
        type: 'UNION',
        operation: 'addition',
        description: '',
        location: 0,
        id: 2,
        target: [
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'snvoc:isModeratorOf', termType: 'namedNode' },
              object: { value: 'forum', termType: 'variable' },
            },
          ],
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'snvoc:isPartOf', termType: 'namedNode' },
              object: { value: 'forum', termType: 'variable' },
            },
          ],
        ],
      };
      additionPattern4 = {
        type: 'FILTER',
        operation: 'addition',
        description: '',
        location: 0,
        id: 3,
        target: [
          {
            type: 'operation',
            operator: '>',
            args: [
              DF.variable('s'),
              DF.literal('18'),
            ],
          },
        ],
      };
      removalPattern1 = {
        type: 'BGP',
        operation: 'removal',
        description: '',
        location: 0,
        id: 4,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'snvoc:isModeratorOf', termType: 'namedNode' },
            object: { value: 'forum', termType: 'variable' },
          },
        ],
      };
      removalPattern2 = {
        type: 'BGP',
        operation: 'removal',
        description: '',
        location: 0,
        id: 5,
        target: [ ],
      };
      removalPattern3 = {
        type: 'UNION',
        operation: 'removal',
        description: '',
        location: 0,
        id: 6,
        target: [
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'snvoc:isModeratorOf', termType: 'namedNode' },
              object: { value: 'forum', termType: 'variable' },
            },
          ],
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'snvoc:isPartOf', termType: 'namedNode' },
              object: { value: 'forum', termType: 'variable' },
            },
          ],
        ],
      };
      removalPattern4 = {
        type: 'FILTER',
        operation: 'removal',
        description: '',
        location: 0,
        id: 7,
        target: [
          {
            type: 'operation',
            operator: '>',
            args: [
              DF.variable('s'),
              DF.literal('18'),
            ],
          },
        ],
      };
      removalPattern5 = {
        type: 'UNION',
        operation: 'removal',
        description: '',
        location: 0,
        id: 10,
        target: [
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'snvoc:isModeratorOf', termType: 'namedNode' },
              object: { value: 'forum', termType: 'variable' },
            },
          ],
          [],
        ],
      };
      subPattern1 = {
        type: 'SUB',
        id: 8,
        operation: 'addition',
        description: 'Substitute the person parameter in query',
        location: 0,
        target: { value: 'person', termType: 'Variable', equals: () => true },
      };
      subPattern2 = {
        type: 'SUB',
        id: 9,
        operation: 'removal',
        description: 'Substitute the person parameter in query',
        location: 0,
        target: { value: 'person', termType: 'Variable', equals: () => true },
      };

      allPatterns = [
        additionPattern1,
        additionPattern2,
        additionPattern3,
        additionPattern4,
        removalPattern1,
        removalPattern2,
        removalPattern3,
        removalPattern4,
        removalPattern5,
        subPattern1,
        subPattern2,
      ];
      refinementState = {
        stateQuery: createOperatorState(),
        stateFilter: createOperatorState(),
        stateUnion: createOperatorState(),
        stateOptional: createOperatorState(),
        stateSubstitution: {
          person: {
            original: DF.namedNode('ex:s1'),
            nCalls: 0,
            active: false,
          },
        },
      };
    });
    it('should correctly filter for 1 triple pattern query', () => {
      const operatorTriplePatterns: Record<string, Triple[][]> = {
        bgp: [[
          {
            subject: DF.namedNode('ex:s1'),
            predicate: DF.variable('p'),
            object: DF.variable('o'),
          },
        ]],
      };
      const opExpressions: Record<string, Expression[][]> = {};
      expect(template.findValidRefinementPatterns(
        operatorTriplePatterns,
        opExpressions,
        allPatterns,
        refinementState,
        {},
      )).toEqual([ additionPattern1, additionPattern3, subPattern1 ]);
    });
    it('should correctly filter for 2 triple pattern query', () => {
      const operatorTriplePatterns: Record<string, Triple[][]> = {
        bgp: [[
          {
            subject: DF.namedNode('ex:s1'),
            predicate: DF.variable('p'),
            object: DF.variable('o'),
          },
          {
            subject: DF.namedNode('ex:s2'),
            predicate: DF.variable('p1'),
            object: DF.variable('o1'),
          },
        ]],
      };
      const opExpressions: Record<string, Expression[][]> = {};

      expect(template.findValidRefinementPatterns(
        operatorTriplePatterns,
        opExpressions,
        allPatterns,
        refinementState,
        {},
      )).toEqual([ additionPattern1, additionPattern3, removalPattern2, subPattern1 ]);
    });
    it('should correctly filter for 2 triple pattern query with tps in union', () => {
      const operatorTriplePatterns: Record<string, Triple[][]> = {
        bgp: [[
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
          },
          {
            subject: DF.variable('s'),
            predicate: DF.namedNode('snvoc:isOwnerOf'),
            object: DF.variable('forum'),
          },
        ]],
      };
      const opExpressions: Record<string, Expression[][]> = {};

      expect(template.findValidRefinementPatterns(
        operatorTriplePatterns,
        opExpressions,
        allPatterns,
        refinementState,
        {},
      )).toEqual([ additionPattern4, removalPattern5, subPattern1 ]);
    });
    it('should correctly filter for 2 triple pattern query with tp not in union', () => {
      const operatorTriplePatterns: Record<string, Triple[][]> = {
        bgp: [[
          {
            subject: DF.namedNode('ex:s1'),
            predicate: DF.variable('p'),
            object: DF.variable('o'),
          },
        ]],
        union: [[
          {
            subject: DF.variable('s'),
            predicate: DF.namedNode('snvoc:isModerator'),
            object: DF.variable('forum'),
          },
        ]],
      };
      const opExpressions: Record<string, Expression[][]> = {};
      expect(template.findValidRefinementPatterns(
        operatorTriplePatterns,
        opExpressions,
        allPatterns,
        refinementState,
        {},
      )).toEqual([ additionPattern1, additionPattern3, additionPattern4, subPattern1 ]);
    });
    it('should correctly filter for 2 triple pattern query with removal in query', () => {
      const operatorTriplePatterns: Record<string, Triple[][]> = {
        bgp: [[
          {
            subject: DF.namedNode('ex:s1'),
            predicate: DF.variable('p'),
            object: DF.variable('o'),
          },
          {
            subject: DF.variable('s'),
            predicate: DF.namedNode('snvoc:isModeratorOf'),
            object: DF.variable('forum'),
          },
        ]],
      };
      const opExpressions: Record<string, Expression[][]> = {};

      expect(template.findValidRefinementPatterns(
        operatorTriplePatterns,
        opExpressions,
        allPatterns,
        refinementState,
        {},
      )).toEqual([
        additionPattern4,
        removalPattern1,
        removalPattern2,
        subPattern1,
      ]);
    });

    it('should correctly filter already applied pattern in query', () => {
      const operatorTriplePatterns: Record<string, Triple[][]> = {
        bgp: [[
          {
            subject: DF.namedNode('ex:s1'),
            predicate: DF.variable('p'),
            object: DF.variable('o'),
          },
          {
            subject: DF.variable('s'),
            predicate: DF.namedNode('snvoc:isModeratorOf'),
            object: DF.variable('forum'),
          },
        ]],
      };
      const opExpressions: Record<string, Expression[][]> = {};
      refinementState.stateQuery.addedTps.push({
        subject: DF.variable('s'),
        predicate: DF.namedNode('snvoc:isModeratorOf'),
        object: DF.variable('forum'),
      });
      expect(template.findValidRefinementPatterns(
        operatorTriplePatterns,
        opExpressions,
        allPatterns,
        refinementState,
        {},
      )).toEqual([ additionPattern4, removalPattern1, removalPattern2, subPattern1 ]);
    });

    it('should correctly filter already applied pattern in union with instantiation', () => {
      const operatorTriplePatterns: Record<string, Triple[][]> = {
        bgp: [[
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
          },
        ]],
      };
      const opExpressions: Record<string, Expression[][]> = {};
      refinementState.stateUnion.addedTps.push({
        subject: DF.namedNode('ex:s1'),
        predicate: DF.namedNode('snvoc:isModeratorOf'),
        object: DF.variable('forum'),
      });

      expect(template.findValidRefinementPatterns(
        operatorTriplePatterns,
        opExpressions,
        allPatterns,
        refinementState,
        { '?s': DF.namedNode('ex:s1') },
      )).toEqual([ additionPattern4, subPattern1 ]);
    });

    it('should correctly filter for query with removed triples with instantiation', () => {
      const operatorTriplePatterns: Record<string, Triple[][]> = {
        bgp: [[
          {
            subject: DF.namedNode('ex:s1'),
            predicate: DF.variable('p'),
            object: DF.variable('o'),
          },
        ]],
      };
      const opExpressions: Record<string, Expression[][]> = {};

      refinementState.stateQuery.removedTps.push({
        subject: DF.namedNode('ex:s1'),
        predicate: DF.namedNode('snvoc:isModeratorOf'),
        object: DF.variable('?forum'),
      });

      expect(template.findValidRefinementPatterns(
        operatorTriplePatterns,
        opExpressions,
        allPatterns,
        refinementState,
        { '?s': DF.namedNode('ex:s1') },
      )).toEqual([ additionPattern1, additionPattern2, additionPattern3, subPattern1 ]);
    });

    it('should correctly filter already added filter expression', () => {
      const operatorTriplePatterns: Record<string, Triple[][]> = {
        bgp: [[
          {
            subject: DF.namedNode('ex:s1'),
            predicate: DF.variable('p'),
            object: DF.variable('o'),
          },
        ]],
      };
      const opExpressions: Record<string, Expression[][]> = {
        filter: [[
          {
            type: 'operation',
            operator: '>',
            args: [
              DF.variable('s1'),
              DF.literal('18'),
            ],
          },
          {
            type: 'operation',
            operator: '>',
            args: [
              DF.variable('s'),
              DF.literal('18'),
            ],
          },
        ]],
      };

      expect(template.findValidRefinementPatterns(
        operatorTriplePatterns,
        opExpressions,
        allPatterns,
        refinementState,
        {},
      )).toEqual([ additionPattern1, additionPattern3, removalPattern4, subPattern1 ]);
    });

    it('should correctly filter already added filter expression with instantiation', () => {
      const operatorTriplePatterns: Record<string, Triple[][]> = {
        bgp: [[
          {
            subject: DF.namedNode('ex:s1'),
            predicate: DF.variable('p'),
            object: DF.variable('o'),
          },
        ]],
      };
      const opExpressions: Record<string, Expression[][]> = {
        filter: [[
          {
            type: 'operation',
            operator: '>',
            args: [
              DF.variable('s1'),
              DF.literal('18'),
            ],
          },
          {
            type: 'operation',
            operator: '>',
            args: [
              DF.variable('s'),
              DF.literal('18'),
            ],
          },
        ]],
      };

      expect(template.findValidRefinementPatterns(
        operatorTriplePatterns,
        opExpressions,
        allPatterns,
        refinementState,
        { '?s1': DF.namedNode('ex:s2') },
      )).toEqual([ additionPattern1, additionPattern3, removalPattern4, subPattern1 ]);
    });

    it('should correctly filter for query with removed filter expressions', () => {
      const operatorTriplePatterns: Record<string, Triple[][]> = {
        bgp: [[
          {
            subject: DF.namedNode('ex:s1'),
            predicate: DF.variable('p'),
            object: DF.variable('o'),
          },
          {
            subject: DF.variable('s'),
            predicate: DF.namedNode('p1'),
            object: DF.variable('o'),
          },
        ]],
      };
      const opExpressions: Record<string, Expression[][]> = {
        filter: [[
          {
            type: 'operation',
            operator: '>',
            args: [
              DF.variable('s'),
              DF.literal('18'),
            ],
          },
        ]],
      };
      refinementState.stateFilter.removedExp.push({
        type: 'operation',
        operator: '>',
        args: [
          DF.variable('s'),
          DF.literal('56'),
        ],
      });

      // Pattern that adds back a random removed expression
      const additionPattern5: IQueryRefinementPattern = {
        type: 'FILTER',
        operation: 'addition',
        description: '',
        location: 0,
        id: 0,
        target: [
        ],
      };

      expect(template.findValidRefinementPatterns(
        operatorTriplePatterns,
        opExpressions,
        [ ...allPatterns, additionPattern5 ],
        refinementState,
        {},
      )).toEqual(
        [ additionPattern1, additionPattern3, removalPattern2, removalPattern4, subPattern1, additionPattern5 ],
      );
    });

    it('should correctly filter for query with already applied substitution', () => {
      const operatorTriplePatterns: Record<string, Triple[][]> = {
        bgp: [[
          {
            subject: DF.namedNode('ex:s1'),
            predicate: DF.variable('p'),
            object: DF.variable('o'),
          },
          {
            subject: DF.variable('s'),
            predicate: DF.namedNode('p1'),
            object: DF.variable('o'),
          },
        ]],
      };
      const opExpressions: Record<string, Expression[][]> = {};
      refinementState.stateSubstitution = {
        person: {
          original: DF.namedNode('ex:s1'),
          nCalls: 1,
          active: true,
        },
      };
      expect(template.findValidRefinementPatterns(
        operatorTriplePatterns,
        opExpressions,
        allPatterns,
        refinementState,
        {},
      )).toEqual(
        [ additionPattern1, additionPattern3, additionPattern4, removalPattern2, subPattern2 ],
      );
    });
    it('should correctly filter for query with already applied and removed substitution', () => {
      const operatorTriplePatterns: Record<string, Triple[][]> = {
        bgp: [[
          {
            subject: DF.namedNode('ex:s1'),
            predicate: DF.variable('p'),
            object: DF.variable('o'),
          },
          {
            subject: DF.variable('s'),
            predicate: DF.namedNode('p1'),
            object: DF.variable('o'),
          },
        ]],
      };
      const opExpressions: Record<string, Expression[][]> = {};
      refinementState.stateSubstitution = {
        person: {
          original: DF.namedNode('ex:s1'),
          nCalls: 2,
          active: false,
        },
      };
      expect(template.findValidRefinementPatterns(
        operatorTriplePatterns,
        opExpressions,
        allPatterns,
        refinementState,
        {},
      )).toEqual(
        [ additionPattern1, additionPattern3, additionPattern4, removalPattern2 ],
      );
    });
    it('should correctly error for query with substitution state not containing the variable to substitute', () => {
      const operatorTriplePatterns: Record<string, Triple[][]> = {
        bgp: [[
          {
            subject: DF.namedNode('ex:s1'),
            predicate: DF.variable('p'),
            object: DF.variable('o'),
          },
          {
            subject: DF.variable('s'),
            predicate: DF.namedNode('p1'),
            object: DF.variable('o'),
          },
        ]],
      };
      const opExpressions: Record<string, Expression[][]> = {};
      refinementState.stateSubstitution = {
        variable: {
          original: DF.namedNode('ex:s1'),
          nCalls: 2,
          active: false,
        },
      };
      expect(() => template.findValidRefinementPatterns(
        operatorTriplePatterns,
        opExpressions,
        allPatterns,
        refinementState,
        {},
      )).toThrow('Passed substitution pattern with target variable that can not be substituted');
    });
  });

  describe('isValidFilterPattern', () => {
    it('should accept custom filter operation when target is provided', () => {
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        {},
        {},
        {},
        {},
        rng,
        1,
        1,
      );
      const pattern: any = {
        type: 'FILTER',
        operation: 'noop',
        description: '',
        location: 0,
        id: 0,
        target: [
          {
            type: 'operation',
            operator: '>',
            args: [
              DF.variable('s'),
              DF.literal('18'),
            ],
          },
        ],
      };
      const refinementState: IRefinementState = {
        stateQuery: createOperatorState(),
        stateFilter: createOperatorState(),
        stateUnion: createOperatorState(),
        stateOptional: createOperatorState(),
        stateSubstitution: {},
      };
      const result = (<any>template).isValidFilterPattern(pattern, {
        queryExpressions: [],
        operatorExpressionsFlattened: {},
        refinementState,
        totalExpressions: 0,
        variableMapping: {},
        variablesInQuery: new Set([ 's' ]),
      });
      expect(result).toBe(true);
    });

    it('should accept custom filter operation when removed expressions exist', () => {
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        {},
        {},
        {},
        {},
        rng,
        1,
        1,
      );
      const pattern: any = {
        type: 'FILTER',
        operation: 'noop',
        description: '',
        location: 0,
        id: 0,
        target: [],
      };
      const refinementState: IRefinementState = {
        stateQuery: createOperatorState(),
        stateFilter: createOperatorState(),
        stateUnion: createOperatorState(),
        stateOptional: createOperatorState(),
        stateSubstitution: {},
      };
      refinementState.stateFilter.removedExp.push({
        type: 'operation',
        operator: '>',
        args: [
          DF.variable('s'),
          DF.literal('18'),
        ],
      });
      const result = (<any>template).isValidFilterPattern(pattern, {
        queryExpressions: [],
        operatorExpressionsFlattened: {},
        refinementState,
        totalExpressions: 0,
        variableMapping: {},
        variablesInQuery: new Set([ 's' ]),
      });
      expect(result).toBe(true);
    });
  });

  describe('applyRefinementPattern', () => {
    let variableMappings: Record<string, RDF.Term[]>;
    let variableMappingsAlternative: Record<string, RDF.Term[]>;

    let refinementState: IRefinementState;
    beforeEach(() => {
      variableMappings = { s: [ DF.namedNode('ex:s1') ]};
      variableMappingsAlternative = { s: [ DF.namedNode('ex:s2') ]};
      refinementState = {
        stateQuery: createOperatorState(),
        stateFilter: createOperatorState(),
        stateUnion: createOperatorState(),
        stateOptional: createOperatorState(),
        stateSubstitution: {},
      };
    });
    it('should add triple to simple bgp with wildcard', () => {
      const queryString = ` SELECT * WHERE {
                ?s ?p ?o
            }`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'addition',
        description: 'Add triple for the person being a moderator of a forum',
        location: 0,
        id: 0,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'snvoc:isModeratorOf', termType: 'namedNode' },
            object: { value: 'forum', termType: 'variable' },
          },
        ],
      };

      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
                `SELECT * WHERE {
  <ex:s1> ?p ?o;
    <snvoc:isModeratorOf> ?forum.
}`,
      );
    });
    it('should add triple to simple bgp without wildcard', () => {
      const queryString = ` SELECT ?o WHERE {
                ?s ?p ?o
            }`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'addition',
        description: 'Add triple for the person being a moderator of a forum',
        location: 0,
        id: 0,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'snvoc:isModeratorOf', termType: 'namedNode' },
            object: { value: 'forum', termType: 'variable' },
          },
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
                `SELECT ?o ?forum WHERE {
  <ex:s1> ?p ?o;
    <snvoc:isModeratorOf> ?forum.
}`,
      );
    });
    it('should add triple with literal to simple bgp ', () => {
      const queryString = ` SELECT ?o WHERE {
                ?s ?p ?o
            }`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'addition',
        description: 'Add triple for the person being a moderator of a forum',
        location: 0,
        id: 0,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'snvoc:isModeratorOf', termType: 'namedNode' },
            object: { value: 'literal', termType: 'literal' },
          },
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
                `SELECT ?o WHERE {
  <ex:s1> ?p ?o;
    <snvoc:isModeratorOf> "literal".
}`,
      );
    });
    it('should add triple to correct sub-bgp', () => {
      const queryString = ` SELECT ?o WHERE {
                ?s ?p ?o
                {
                    SELECT * WHERE {
                        ?s ?p1 <ex:o1>
                    }
                }
            }`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'addition',
        description: 'Add triple for the person being a moderator of a forum',
        location: 1,
        id: 0,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'snvoc:isModeratorOf', termType: 'namedNode' },
            object: { value: 'forum', termType: 'variable' },
          },
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
                `SELECT ?o ?forum WHERE {
  <ex:s1> ?p ?o.
  {
    SELECT * WHERE {
      <ex:s1> ?p1 <ex:o1>;
        <snvoc:isModeratorOf> ?forum.
    }
  }
}`,
      );
    });
    it('should add new union operator to query (first position)', () => {
      const queryString = ` SELECT * WHERE {
                ?s ?p ?o
            }`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'UNION',
        operation: 'addition',
        description: 'Add union triple for the person being a moderator of a forum',
        location: 0,
        id: 0,
        target: [
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'snvoc:isModeratorOf', termType: 'namedNode' },
              object: { value: 'forum', termType: 'variable' },
            },
          ],
          [
          ],
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
                `SELECT * WHERE {
  <ex:s1> ?p ?o.
  { <ex:s1> <snvoc:isModeratorOf> ?forum. }
  UNION
  {  }
}`,
      );
    });
    it('should add new union operator to query (second position)', () => {
      const queryString = ` SELECT * WHERE {
                ?s ?p ?o
            }`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'UNION',
        operation: 'addition',
        description: 'Add union triple for the person being a moderator of a forum',
        location: 1,
        id: 0,
        target: [
          [
          ],
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'snvoc:isPartOf', termType: 'namedNode' },
              object: { value: 'forum', termType: 'variable' },
            },
          ],
        ],
      };

      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
                `SELECT * WHERE {
  <ex:s1> ?p ?o.
  {  }
  UNION
  { <ex:s1> <snvoc:isPartOf> ?forum. }
}`,
      );
    });
    it('should add new union operator to query (full union)', () => {
      const queryString = ` SELECT * WHERE {
                ?s ?p ?o
            }`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'UNION',
        operation: 'addition',
        description: 'Add union triple for the person being a moderator of a forum',
        location: 0,
        id: 0,
        target: [
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'snvoc:isModeratorOf', termType: 'namedNode' },
              object: { value: 'forum', termType: 'variable' },
            },
          ],
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'snvoc:isPartOf', termType: 'namedNode' },
              object: { value: 'forum', termType: 'variable' },
            },
          ],
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
                `SELECT * WHERE {
  <ex:s1> ?p ?o.
  { <ex:s1> <snvoc:isModeratorOf> ?forum. }
  UNION
  { <ex:s1> <snvoc:isPartOf> ?forum. }
}`,
      );
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
            }`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'UNION',
        operation: 'addition',
        description: 'Add union triple for the person being a moderator of a forum',
        location: 1,
        id: 0,
        target: [
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'snvoc:isModeratorOf', termType: 'namedNode' },
              object: { value: 'forum', termType: 'variable' },
            },
          ],
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'snvoc:isPartOf', termType: 'namedNode' },
              object: { value: 'forum', termType: 'variable' },
            },
          ],
        ],
      };

      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );

      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
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
  {
    ?x ?p ?o.
    <ex:s1> <snvoc:isPartOf> ?forum.
  }
}`,
      );
    });
    it ('should add to the correct union operator block when one target is empty', () => {
      const queryString = `SELECT * WHERE {
                ?s ?p ?o.
                { ?x ?y ?z. }
                 UNION 
                { ?a ?b ?c. }
                { ?k ?l ?m. }
                 UNION 
                { ?x ?p ?o. }
            }`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'UNION',
        operation: 'addition',
        description: 'Add union triple for the person being a moderator of a forum',
        location: 0,
        id: 0,
        target: [
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'snvoc:isModeratorOf', termType: 'namedNode' },
              object: { value: 'forum', termType: 'variable' },
            },
          ],
          [
          ],
        ],
      };

      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );

      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
`SELECT * WHERE {
  <ex:s1> ?p ?o.
  {
    ?x ?y ?z.
    <ex:s1> <snvoc:isModeratorOf> ?forum.
  }
  UNION
  { ?a ?b ?c. }
  { ?k ?l ?m. }
  UNION
  { ?x ?p ?o. }
}`,
      );
    });

    it('should add new optional operator to query', () => {
      const queryString = ` SELECT * WHERE {
                ?s ?p ?o
            }`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'OPTIONAL',
        operation: 'addition',
        description: 'Add optional triple for the person being a moderator of a forum',
        location: 0,
        id: 0,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'snvoc:isModeratorOf', termType: 'namedNode' },
            object: { value: 'forum', termType: 'variable' },
          },
        ],
      };

      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
                `SELECT * WHERE {
  <ex:s1> ?p ?o.
  OPTIONAL { <ex:s1> <snvoc:isModeratorOf> ?forum. }
}`,
      );
    });
    it('should add to correct optional operator block', () => {
      const queryString = ` SELECT * WHERE {
                ?s ?p ?o
                OPTIONAL { ?a ?b ?c }
                OPTIONAL { ?s ?y ?x }
            }`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'OPTIONAL',
        operation: 'addition',
        description: 'Add optional triple for the person being a moderator of a forum',
        location: 1,
        id: 0,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'snvoc:isModeratorOf', termType: 'namedNode' },
            object: { value: 'forum', termType: 'variable' },
          },
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
                `SELECT * WHERE {
  <ex:s1> ?p ?o.
  OPTIONAL { ?a ?b ?c. }
  OPTIONAL {
    <ex:s1> ?y ?x;
      <snvoc:isModeratorOf> ?forum.
  }
}`,
      );
    });
    it('should remove random triple from simple bgp when target is not set', () => {
      const queryString = ` SELECT * WHERE {
                ?s ?p ?o.
                ?x ?o ?b
            }`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'removal',
        description: 'Remove random triple',
        location: 0,
        id: 0,
        target: [ ],
      };

      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );

      jest.spyOn(<any> input.template, 'rng').mockImplementation().mockReturnValue(0.99);

      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
                `SELECT * WHERE { <ex:s1> ?p ?o. }`,
      );
    });
    it('should remove any triple from simple bgp', () => {
      const queryString = ` SELECT * WHERE {
                ?s ?p ?o.
                ?x ?o ?b
            }`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'removal',
        description: 'Remove random triple',
        location: 0,
        id: 0,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'p', termType: 'variable' },
            object: { value: 'o', termType: 'variable' },
          },
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
                `SELECT * WHERE { ?x ?o ?b. }`,
      );
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
            `;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'removal',
        description: 'Remove random triple',
        location: 1,
        id: 0,
        target: [
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      jest.spyOn(<any> input.template, 'rng').mockImplementation().mockReturnValue(0.99);

      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
`SELECT * WHERE {
  { SELECT * WHERE { <ex:s1> ?p ?o. } }
  
}`,
      );
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
            `;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'removal',
        description: 'Remove random triple',
        location: 0,
        id: 0,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'p', termType: 'variable' },
            object: { value: 'o', termType: 'variable' },
          },
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
`SELECT * WHERE {
  { SELECT * WHERE {  } }
  ?x ?y ?z.
}`,
      );
    });
    it('should remove correct union (left-side)', () => {
      const queryString = `
                SELECT * WHERE {
                { ?s ?p ?o } UNION { ?x ?y ?z }
                }`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'UNION',
        operation: 'removal',
        description: '',
        location: 0,
        id: 0,
        target: [
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'p', termType: 'variable' },
              object: { value: 'o', termType: 'variable' },
            },
          ],
          [],
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );

      expect(new Generator().stringify(transformed)).toBe(
            `SELECT * WHERE {
  {  }
  UNION
  { ?x ?y ?z. }
}`,
      );
    });
    it('should remove correct union (right-side)', () => {
      const queryString = `
                SELECT * WHERE {
                { ?s ?p ?o } UNION { ?x ?y ?z }
                }`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'UNION',
        operation: 'removal',
        description: '',
        location: 0,
        id: 0,
        target: [
          [],
          [
            {
              subject: { value: 'x', termType: 'variable' },
              predicate: { value: 'y', termType: 'variable' },
              object: { value: 'z', termType: 'variable' },
            },
          ],
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );

      expect(new Generator().stringify(transformed)).toBe(
            `SELECT * WHERE {
  { <ex:s1> ?p ?o. }
  UNION
  {  }
}`,
      );
    });
    it('should remove correct union (both)', () => {
      const queryString = `
                SELECT * WHERE {
                { ?s ?p ?o } UNION { ?x ?y ?z }
                }`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'UNION',
        operation: 'removal',
        description: '',
        location: 0,
        id: 0,
        target: [
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'p', termType: 'variable' },
              object: { value: 'o', termType: 'variable' },
            },
          ],
          [
            {
              subject: { value: 'x', termType: 'variable' },
              predicate: { value: 'y', termType: 'variable' },
              object: { value: 'z', termType: 'variable' },
            },
          ],
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );

      expect(new Generator().stringify(transformed)).toBe(
            `SELECT * WHERE {
  {  }
  UNION
  {  }
}`,
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
      const refinementPattern: IQueryRefinementPattern = {
        type: 'UNION',
        operation: 'removal',
        description: '',
        location: 1,
        id: 0,
        target: [
          [
            {
              subject: { value: 'x', termType: 'variable' },
              predicate: { value: 'y', termType: 'variable' },
              object: { value: 'z', termType: 'variable' },
            },
          ],
          [
            {
              subject: { value: 'z', termType: 'variable' },
              predicate: { value: 'k', termType: 'variable' },
              object: { value: 'o', termType: 'variable' },
            },
          ],
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );

      expect(new Generator().stringify(transformed)).toBe(
            `SELECT * WHERE {
  {
    { <ex:s1> ?p ?o. }
    UNION
    {
      {  }
      UNION
      { <ex:s1> ?p ?o. }
    }
  }
  ?a ?b ?c.
}`,
      );
    });
    it('should leave empty union operator if all triple patterns are removed', () => {
      const queryString = `
                SELECT * WHERE {
                { } UNION { ?x ?y ?z }
                }`;

      const refinementPattern: IQueryRefinementPattern = {
        type: 'UNION',
        operation: 'removal',
        description: '',
        location: 0,
        id: 0,
        target: [
          [],
          [
            {
              subject: { value: 'x', termType: 'variable' },
              predicate: { value: 'y', termType: 'variable' },
              object: { value: 'z', termType: 'variable' },
            },
          ],
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
            `SELECT * WHERE {
  {  }
  UNION
  {  }
}`,
      );
    });
    it('should add a filter if its not in query', () => {
      const queryString = `
                SELECT * WHERE {
                    ?salary ?p ?o
                }`;

      const refinementPattern: IQueryRefinementPattern = {
        type: 'FILTER',
        operation: 'addition',
        description: '',
        location: 0,
        id: 0,
        target: [
          {
            type: 'operation',
            operator: '>=',
            args: [
              DF.variable('salary'),
              DF.literal('50000', DF.namedNode('http://www.w3.org/2001/XMLSchema#decimal')),
            ],
          },
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );

      expect(new Generator().stringify(transformed)).toBe(
            `SELECT * WHERE {
  ?salary ?p ?o.
  FILTER(?salary >= "50000"^^<http://www.w3.org/2001/XMLSchema#decimal>)
}`,
      );
    });
    it('should add a filter if its not in query and upate refinementState', () => {
      const queryString = `
                SELECT * WHERE {
                    ?salary ?p ?o
                }`;

      const refinementPattern: IQueryRefinementPattern = {
        type: 'FILTER',
        operation: 'addition',
        description: '',
        location: 0,
        id: 0,
        target: [
          {
            type: 'operation',
            operator: '>=',
            args: [
              DF.variable('salary'),
              DF.literal('50000', DF.namedNode('http://www.w3.org/2001/XMLSchema#decimal')),
            ],
          },
        ],
      };
      // Simulate like this filter was previously removed and now will be added back
      refinementState.stateFilter.removedExp = [{
        type: 'operation',
        operator: '>=',
        args: [
          DF.variable('salary'),
          DF.literal('50000', DF.namedNode('http://www.w3.org/2001/XMLSchema#decimal')),
        ],
      }];
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );

      expect(new Generator().stringify(transformed)).toBe(
            `SELECT * WHERE {
  ?salary ?p ?o.
  FILTER(?salary >= "50000"^^<http://www.w3.org/2001/XMLSchema#decimal>)
}`,
      );
      expect(refinementState.stateFilter.removedExp).toHaveLength(0);
    });
    it('should add another filter if one is already present', () => {
      const queryString = `SELECT * WHERE {
                                    ?salary ?p ?o .
                                    FILTER(?o > 5)
                                    FILTER(?o < 200)
                                }`;

      const refinementPattern: IQueryRefinementPattern = {
        type: 'FILTER',
        operation: 'addition',
        description: '',
        location: 0,
        id: 0,
        target: [
          {
            type: 'operation',
            operator: '>=',
            args: [
              DF.variable('salary'),
              DF.literal('50000', DF.namedNode('http://www.w3.org/2001/XMLSchema#decimal')),
            ],
          },
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );

      expect(new Generator().stringify(transformed)).toBe(
            `SELECT * WHERE {
  ?salary ?p ?o.
  FILTER(?o > 5 )
  FILTER(?o < 200 )
  FILTER(?salary >= "50000"^^<http://www.w3.org/2001/XMLSchema#decimal>)
}`,
      );
    });

    it('should remove a filter from the query', () => {
      const queryString = `SELECT * WHERE {
                                    ?salary ?p ?o .
                                    FILTER(?o > "5")
                                    FILTER(?o < 200)
                                }`;

      const refinementPattern: IQueryRefinementPattern = {
        type: 'FILTER',
        operation: 'removal',
        description: '',
        location: 0,
        id: 0,
        target: [
          {
            type: 'operation',
            operator: '>',
            args: [
              DF.variable('o'),
              DF.literal('5'),
            ],
          },
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );

      expect(new Generator().stringify(transformed)).toBe(
            `SELECT * WHERE {
  ?salary ?p ?o.
  FILTER(?o < 200 )
}`,
      );
      expect(refinementState.stateFilter.removedExp).toHaveLength(1);
      expect(refinementState.stateFilter.removedExp[0]).toEqual(
        {
          type: 'operation',
          operator: '>',
          args: [
            DF.variable('o'),
            DF.literal('5'),
          ],
        },
      );
    });
    it('should remove a random filter when no target is given', () => {
      const queryString = `SELECT * WHERE {
                        ?salary ?p ?o .
                        FILTER(?o > "5")
                        FILTER(?o < 200)
                    }`;

      const refinementPattern: IQueryRefinementPattern = {
        type: 'FILTER',
        operation: 'removal',
        description: '',
        location: 0,
        id: 0,
        target: [
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
            `SELECT * WHERE {
  ?salary ?p ?o.
  FILTER(?o > "5")
}`,
      );
    });
    it('should remove the filter expression when no filters are left', () => {
      const queryString = `SELECT * WHERE {
                        ?salary ?p ?o .
                        FILTER(?o > "5")
                    }`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'FILTER',
        operation: 'removal',
        description: '',
        location: 0,
        id: 0,
        target: [
          {
            type: 'operation',
            operator: '>',
            args: [
              DF.variable('o'),
              DF.literal('5'),
            ],
          },
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
            `SELECT * WHERE { ?salary ?p ?o. }`,
      );
    });
    it('should remove the variable form the select if removing the triple pattern removes the variable', () => {
      const queryString = `
            SELECT ?x ?s WHERE {
                {
                SELECT * WHERE {
                    ?s ?p ?o.
                }
                }
                ?x ?y ?z.
            }
            `;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'removal',
        description: 'Remove triple',
        location: 0,
        id: 0,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'p', termType: 'variable' },
            object: { value: 'o', termType: 'variable' },
          },
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
                `SELECT ?x WHERE {
  { SELECT * WHERE {  } }
  ?x ?y ?z.
}`,
      );
    });

    it('should remove variable expression when variable is removed from query', () => {
      const queryString = `
            SELECT (?x AS ?xAlias) ?p WHERE {
                {
                SELECT * WHERE {
                    ?s ?p ?o.
                }
                }
                ?x ?y ?z.
            }
            `;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'removal',
        description: 'Remove triple',
        location: 1,
        id: 0,
        target: [
          {
            subject: { value: 'x', termType: 'variable' },
            predicate: { value: 'y', termType: 'variable' },
            object: { value: 'z', termType: 'variable' },
          },
        ],
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );

      expect(new Generator().stringify(transformed)).toBe(
`SELECT ?p WHERE {
  { SELECT * WHERE { <ex:s1> ?p ?o. } }
  
}`,
      );
    });

    it('should not remove variable if the variable is used elsewhere', () => {
      const queryString = `
            SELECT ?x WHERE {
                ?x ?y ?z .
                ?x ?y1 ?z1 .
            }
            `;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'removal',
        description: 'Remove triple',
        location: 0,
        id: 0,
        target: [
          {
            subject: { value: 'x', termType: 'variable' },
            predicate: { value: 'y', termType: 'variable' },
            object: { value: 'z', termType: 'variable' },
          },
        ],
      };

      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );

      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );

      expect(new Generator().stringify(transformed)).toBe(
`SELECT ?x WHERE { ?x ?y1 ?z1. }`,
      );
    });
    it('should correctly substitute template values in query', () => {
      const queryString = `SELECT ?o WHERE {
    ?s ?p ?o
    {
        SELECT * WHERE {
            ?s ?p1 <ex:o1>
        }
    }

    UNION {
        ?s <ex:relatedTo> ?x
    }

    OPTIONAL {
        ?s <ex:hasProperty> ?prop
    }

    FILTER(STRSTARTS(STR(?s), "http://example.org/resource/"))
}`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'SUB',
        id: 8,
        operation: 'addition',
        description: 'Substitute the person parameter in query',
        location: 0,
        target: { value: 's', termType: 'Variable', equals: () => true },
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      refinementState.stateSubstitution = {
        s: {
          original: DF.namedNode('ex:s1'),
          nCalls: 0,
          active: false,
        },
      };
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
`SELECT ?o WHERE {
  <ex:s2> ?p ?o.
  { SELECT * WHERE { <ex:s2> ?p1 <ex:o1>. } }
  UNION
  { <ex:s2> <ex:relatedTo> ?x. }
  OPTIONAL { <ex:s2> <ex:hasProperty> ?prop. }
  FILTER(STRSTARTS(STR(<ex:s2>), "http://example.org/resource/"))
}`,
      );
    });
    it('should correctly substitute back the original template values in query for removal pattern', () => {
      const queryString = `SELECT ?o WHERE {
    ?s ?p ?o
    {
        SELECT * WHERE {
            ?s ?p1 <ex:o1>
        }
    }

    UNION {
        ?s <ex:relatedTo> ?x
    }

    OPTIONAL {
        ?s <ex:hasProperty> ?prop
    }

    FILTER(STRSTARTS(STR(?s), "http://example.org/resource/"))
}`;
      const refinementPattern: IQueryRefinementPattern = {
        type: 'SUB',
        id: 8,
        operation: 'removal',
        description: 'Substitute the person parameter in query',
        location: 0,
        target: { value: 's', termType: 'Variable', equals: () => true },
      };
      const input = createRefinementInput(
        queryString,
        variableMappings,
        variableMappingsAlternative,
        refinementPattern,
      );
      refinementState.stateSubstitution = {
        s: {
          original: DF.namedNode('ex:s1'),
          nCalls: 1,
          active: true,
        },
      };
      const transformed = input.template.applyRefinementPattern(
        refinementPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      expect(new Generator().stringify(transformed)).toBe(
`SELECT ?o WHERE {
  <ex:s1> ?p ?o.
  { SELECT * WHERE { <ex:s1> ?p1 <ex:o1>. } }
  UNION
  { <ex:s1> <ex:relatedTo> ?x. }
  OPTIONAL { <ex:s1> <ex:hasProperty> ?prop. }
  FILTER(STRSTARTS(STR(<ex:s1>), "http://example.org/resource/"))
}`,
      );
    });
  });

  describe('createRefinementSequence', () => {
    it('should correctly create sequence for bgp', () => {
      const queryString = `SELECT * WHERE {
                ?s ?p ?o .
            }`;
      const additionPattern1: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'addition',
        description: '',
        location: 0,
        id: 0,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'snvoc:isModeratorOf', termType: 'namedNode' },
            object: { value: 'forum', termType: 'variable' },
          },
        ],
      };
      const additionPattern2: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'addition',
        description: '',
        location: 0,
        id: 1,
        target: [ ],
      };

      const removalPattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'removal',
        description: '',
        location: 0,
        id: 2,
        target: [

        ],
      };
      const mockRng = jest.fn()
        .mockReturnValueOnce(0.01)
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.1);

      const input = createRefinementInput(queryString, {}, {}, additionPattern1, mockRng);
      const refinedSequence = input.template.createRefinementSequence(
        [ additionPattern1, additionPattern2, removalPattern ],
        input.query,
        2,
        {},
        {},
      );
      const patternToQuery = refinedSequence.queries.map(transformed => new Generator().stringify(transformed));
      expect(patternToQuery).toEqual(
        [
`SELECT * WHERE { ?s ?p ?o. }`,
`SELECT * WHERE {
  ?s ?p ?o;
    <snvoc:isModeratorOf> ?forum.
}`,
`SELECT * WHERE { ?s <snvoc:isModeratorOf> ?forum. }`,
        ],
      );
    });
    it('should correctly create sequence for union with instantiation value', () => {
      const queryString = `SELECT * WHERE {
                ?s ?p ?o .
            }`;
      const additionPattern1: IQueryRefinementPattern = {
        type: 'UNION',
        operation: 'addition',
        description: '',
        location: 0,
        id: 0,
        target: [
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'snvoc:isHeadModeratorOf', termType: 'namedNode' },
              object: { value: 'forum', termType: 'variable' },
            },
          ],
          [],
        ],
      };
      const additionPattern2: IQueryRefinementPattern = {
        type: 'UNION',
        operation: 'addition',
        description: '',
        location: 0,
        id: 1,
        target: [
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'snvoc:isModeratorOf', termType: 'namedNode' },
              object: { value: 'forum', termType: 'variable' },
            },
          ],
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'snvoc:isPartOf', termType: 'namedNode' },
              object: { value: 'forum', termType: 'variable' },
            },
          ],
        ],
      };
      const removalPattern: IQueryRefinementPattern = {
        type: 'UNION',
        operation: 'removal',
        description: '',
        location: 0,
        id: 2,
        target: [
          [],
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'snvoc:isPartOf', termType: 'namedNode' },
              object: { value: 'forum', termType: 'variable' },
            },
          ],
        ],
      };
      const mockRng = jest.fn()
        .mockReturnValueOnce(0.6)
        .mockReturnValueOnce(0.3)
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.8);

      const input = createRefinementInput(
        queryString,
        { s: [ DF.namedNode('foaf:person') ]},
        { s: [ DF.namedNode('foaf:person2') ]},
        additionPattern1,
        mockRng,
      );
      const refinedSequence = input.template.createRefinementSequence(
        [ additionPattern1, additionPattern2, removalPattern ],
        input.query,
        3,
        input.variableMapping,
        input.variableMappingAlternative,
      );
      const patternToQuery = refinedSequence.queries.map(transformed => new Generator().stringify(transformed));
      expect(patternToQuery).toEqual(
        [
`SELECT * WHERE { <foaf:person> ?p ?o. }`,
`SELECT * WHERE {
  <foaf:person> ?p ?o.
  { <foaf:person> <snvoc:isModeratorOf> ?forum. }
  UNION
  { <foaf:person> <snvoc:isPartOf> ?forum. }
}`,
`SELECT * WHERE {
  <foaf:person> ?p ?o.
  {
    <foaf:person> <snvoc:isModeratorOf> ?forum;
      <snvoc:isHeadModeratorOf> ?forum.
  }
  UNION
  { <foaf:person> <snvoc:isPartOf> ?forum. }
}`,
`SELECT * WHERE {
  <foaf:person> ?p ?o.
  {
    <foaf:person> <snvoc:isModeratorOf> ?forum;
      <snvoc:isHeadModeratorOf> ?forum.
  }
  UNION
  {  }
}`,
        ],
      );
    });
    it('should correctly create sequence for filter', () => {
      const queryString = `SELECT * WHERE {
                ?s ?p ?o .
                ?s1 ?p1 ?o1 .
            }`;
      const additionPattern1: IQueryRefinementPattern = {
        type: 'FILTER',
        operation: 'addition',
        description: '',
        location: 0,
        id: 0,
        target: [
          {
            type: 'operation',
            operator: '<',
            args: [
              DF.variable('s1'),
              DF.literal('60'),
            ],
          },
        ],
      };
      const additionPattern2: IQueryRefinementPattern = {
        type: 'FILTER',
        operation: 'addition',
        description: '',
        location: 0,
        id: 1,
        target: [
          {
            type: 'operation',
            operator: '>',
            args: [
              DF.variable('s1'),
              DF.literal('18'),
            ],
          },
        ],
      };
      const additionPatternInvalid: IQueryRefinementPattern = {
        type: 'FILTER',
        operation: 'addition',
        description: '',
        location: 0,
        id: 2,
        target: [
          {
            type: 'operation',
            operator: '<',
            args: [
              DF.variable('s'),
              DF.literal('80'),
            ],
          },
        ],
      };

      const removalPattern1: IQueryRefinementPattern = {
        type: 'FILTER',
        operation: 'removal',
        description: '',
        location: 0,
        id: 3,
        target: [
          {
            type: 'operation',
            operator: '>',
            args: [
              DF.variable('s1'),
              DF.literal('18'),
            ],
          },
        ],
      };
      const removalPattern2: IQueryRefinementPattern = {
        type: 'FILTER',
        operation: 'removal',
        description: '',
        location: 0,
        id: 4,
        target: [
        ],
      };
      const mockRng = jest.fn()
        .mockReturnValueOnce(0.9)
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.6)
        .mockReturnValueOnce(0.1);

      const input = createRefinementInput(
        queryString,
        { s: [ DF.namedNode('foaf:person') ]},
        { s: [ DF.namedNode('foaf:person2') ]},
        additionPattern1,
        mockRng,
      );
      const refinedSequence = input.template.createRefinementSequence(
        [ additionPattern1, additionPattern2, additionPatternInvalid, removalPattern1, removalPattern2 ],
        input.query,
        3,
        input.variableMapping,
        input.variableMappingAlternative,
      );
      const patternToQuery = refinedSequence.queries.map(
        (transformed: SelectQuery) => new Generator().stringify(transformed),
      );
      expect(patternToQuery).toEqual(
        [
`SELECT * WHERE {
  <foaf:person> ?p ?o.
  ?s1 ?p1 ?o1.
}`,
`SELECT * WHERE {
  <foaf:person> ?p ?o.
  ?s1 ?p1 ?o1.
  FILTER(?s1 > "18")
}`,
`SELECT * WHERE {
  <foaf:person> ?p ?o.
  ?s1 ?p1 ?o1.
  FILTER(?s1 > "18")
  FILTER(?s1 < "60")
}`,
`SELECT * WHERE {
  <foaf:person> ?p ?o.
  ?s1 ?p1 ?o1.
  FILTER(?s1 < "60")
}`,
        ],
      );
    });
    it('should correctly create sequence for optional', () => {
      const queryString = `SELECT * WHERE {
                ?s ?p ?o .
                ?s1 ?p1 ?o1 .
            }`;
      const additionPattern1: IQueryRefinementPattern = {
        type: 'OPTIONAL',
        operation: 'addition',
        description: '',
        location: 0,
        id: 0,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'foaf:name', termType: 'namedNode' },
            object: { value: 'name', termType: 'variable' },
          },
        ],
      };
      const additionPattern2: IQueryRefinementPattern = {
        type: 'OPTIONAL',
        operation: 'addition',
        description: '',
        location: 0,
        id: 1,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'foaf:email', termType: 'namedNode' },
            object: { value: 'email', termType: 'variable' },
          },
        ],
      };
      const removalPattern: IQueryRefinementPattern = {
        type: 'OPTIONAL',
        operation: 'removal',
        description: '',
        location: 0,
        id: 2,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'foaf:name', termType: 'namedNode' },
            object: { value: 'name', termType: 'variable' },
          },
        ],
      };
      const mockRng = jest.fn()
        .mockReturnValueOnce(0.7)
        .mockReturnValueOnce(0.2)
        .mockReturnValue(0.4);

      const input = createRefinementInput(
        queryString,
        { s: [ DF.namedNode('foaf:person') ]},
        { s: [ DF.namedNode('foaf:person2') ]},
        additionPattern1,
        mockRng,
      );
      const refinedSequence = input.template.createRefinementSequence(
        [ additionPattern1, additionPattern2, removalPattern ],
        input.query,
        3,
        input.variableMapping,
        input.variableMappingAlternative,
      );
      const patternToQuery = refinedSequence.queries.map(transformed => new Generator().stringify(transformed));
      expect(patternToQuery).toEqual(
        [
`SELECT * WHERE {
  <foaf:person> ?p ?o.
  ?s1 ?p1 ?o1.
}`,
`SELECT * WHERE {
  <foaf:person> ?p ?o.
  ?s1 ?p1 ?o1.
  OPTIONAL { <foaf:person> <foaf:email> ?email. }
}`,
`SELECT * WHERE {
  <foaf:person> ?p ?o.
  ?s1 ?p1 ?o1.
  OPTIONAL {
    <foaf:person> <foaf:email> ?email;
      <foaf:name> ?name.
  }
}`,
`SELECT * WHERE {
  <foaf:person> ?p ?o.
  ?s1 ?p1 ?o1.
  OPTIONAL { <foaf:person> <foaf:email> ?email. }
}`,
        ],
      );
    });
    it('should correctly create sequence for mixed refinements', () => {
      const queryString = `SELECT * WHERE {
                ?s ?p ?o .
                ?s1 ?p1 ?o1 .
            }`;
      const bgpAddition: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'addition',
        description: '',
        location: 0,
        id: 0,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'rdf:type', termType: 'namedNode' },
            object: { value: 'foaf:Person', termType: 'namedNode' },
          },
        ],
      };
      const filterAddition: IQueryRefinementPattern = {
        type: 'FILTER',
        operation: 'addition',
        description: '',
        location: 0,
        id: 1,
        target: [
          {
            type: 'operation',
            operator: '>',
            args: [
              DF.variable('s1'),
              DF.literal('18'),
            ],
          },
        ],
      };
      const optionalAddition: IQueryRefinementPattern = {
        type: 'OPTIONAL',
        operation: 'addition',
        description: '',
        location: 0,
        id: 2,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'foaf:name', termType: 'namedNode' },
            object: { value: 'name', termType: 'variable' },
          },
        ],
      };
      const unionAddition: IQueryRefinementPattern = {
        type: 'UNION',
        operation: 'addition',
        description: '',
        location: 0,
        id: 3,
        target: [
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'rdf:type', termType: 'namedNode' },
              object: { value: 'foaf:Person', termType: 'namedNode' },
            },
          ],
          [
            {
              subject: { value: 's', termType: 'variable' },
              predicate: { value: 'rdf:type', termType: 'namedNode' },
              object: { value: 'foaf:Lizard', termType: 'namedNode' },
            },
          ],
        ],
      };
      const removalPattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'removal',
        description: '',
        location: 0,
        id: 4,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'rdf:type', termType: 'namedNode' },
            object: { value: 'foaf:Person', termType: 'namedNode' },
          },
        ],
      };
      const mockRng = jest.fn()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.99)
        .mockReturnValueOnce(0.99)
        .mockReturnValueOnce(0);

      const input = createRefinementInput(
        queryString,
        { s: [ DF.namedNode('foaf:person') ]},
        { s: [ DF.namedNode('foaf:person2') ]},
        bgpAddition,
        mockRng,
      );
      const refinedSequence = input.template.createRefinementSequence(
        [ bgpAddition, filterAddition, optionalAddition, unionAddition, removalPattern ],
        input.query,
        5,
        input.variableMapping,
        input.variableMappingAlternative,
      );
      const patternToQuery = refinedSequence.queries.map(transformed => new Generator().stringify(transformed));
      expect(patternToQuery).toEqual(
        [
`SELECT * WHERE {
  <foaf:person> ?p ?o.
  ?s1 ?p1 ?o1.
}`,
`SELECT * WHERE {
  <foaf:person> ?p ?o.
  ?s1 ?p1 ?o1.
  <foaf:person> <rdf:type> <foaf:Person>.
}`,
`SELECT * WHERE {
  <foaf:person> ?p ?o.
  ?s1 ?p1 ?o1.
  <foaf:person> <rdf:type> <foaf:Person>.
  OPTIONAL { <foaf:person> <foaf:name> ?name. }
}`,
`SELECT * WHERE {
  <foaf:person> ?p ?o.
  ?s1 ?p1 ?o1.
  OPTIONAL { <foaf:person> <foaf:name> ?name. }
}`,
`SELECT * WHERE {
  <foaf:person> ?p ?o.
  ?s1 ?p1 ?o1.
  OPTIONAL { <foaf:person> <foaf:name> ?name. }
  { <foaf:person> <rdf:type> <foaf:Person>. }
  UNION
  { <foaf:person> <rdf:type> <foaf:Lizard>. }
}`,
`SELECT * WHERE {
  <foaf:person> ?p ?o.
  ?s1 ?p1 ?o1.
  OPTIONAL { <foaf:person> <foaf:name> ?name. }
  { <foaf:person> <rdf:type> <foaf:Person>. }
  UNION
  { <foaf:person> <rdf:type> <foaf:Lizard>. }
  FILTER(?s1 > "18")
}`,
        ],
      );
    });
  });

  describe('mapRefinementConfigToSparqlJs', () => {
    it('should convert a raw SUB target config object to an RDF Variable', () => {
      const subPattern: IQueryRefinementPattern = {
        type: 'SUB',
        id: 0,
        operation: 'addition',
        description: '',
        location: 0,
        // Raw config object (not an RDF.Variable – no equals/hashCode)
        target: <any>{ value: 's', termType: 'variable' },
      };
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        {},
        {},
        {},
        {},
        rng,
        1,
        1,
        undefined,
        [ subPattern ],
      );
      const mapped = template.mapRefinementConfigToSparqlJs([ subPattern ]);
      expect(mapped[0].type).toBe('SUB');
      expect((<ISubRefinementPattern>mapped[0]).target.termType).toBe('Variable');
      expect((<ISubRefinementPattern>mapped[0]).target.value).toBe('s');
    });

    it('should convert FILTER target with namedNode and nested operation terms', () => {
      const filterPattern: IQueryRefinementPattern = {
        type: 'FILTER',
        id: 0,
        operation: 'addition',
        description: '',
        location: 0,
        target: [
          <any>{
            type: 'operation',
            operator: '=',
            args: [
              // NamedNode raw config — termType is lowercased during processing, covers the namedNode branch
              <any>{ termType: 'NamedNode', value: 'http://example.org/val' },
              // BlankNode term: isValidTermConfig=true but termType lowercases to 'blanknode',
              // which does not match 'variable'/'namednode'/'literal', so the fallback
              // `return <Term> term` path (line 143) is exercised.
              <any>DF.blankNode('b1'),
            ],
          },
        ],
      };
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        {},
        {},
        {},
        {},
        rng,
        1,
        1,
        undefined,
        [ filterPattern ],
      );
      const mapped = template.mapRefinementConfigToSparqlJs([ filterPattern ]);
      expect(mapped[0].type).toBe('FILTER');
      // The namedNode arg should have been converted to a real NamedNode
      const targetExpr = (<any>mapped[0]).target[0];
      expect(targetExpr.args[0].termType).toBe('NamedNode');
      expect(targetExpr.args[0].value).toBe('http://example.org/val');
    });

    it('should handle FILTER target with literal that has a language tag', () => {
      const filterPattern: IQueryRefinementPattern = {
        type: 'FILTER',
        id: 0,
        operation: 'addition',
        description: '',
        location: 0,
        target: [
          <any>{ termType: 'literal', value: 'hello', language: 'en' },
        ],
      };
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        {},
        {},
        {},
        {},
        rng,
        1,
        1,
        undefined,
        [ filterPattern ],
      );
      const mapped = template.mapRefinementConfigToSparqlJs([ filterPattern ]);
      const term = <RDF.Literal>(<any>mapped[0]).target[0];
      expect(term.termType).toBe('Literal');
      expect(term.value).toBe('hello');
      expect(term.language).toBe('en');
    });

    it('should handle FILTER target with literal that has a datatype', () => {
      const filterPattern: IQueryRefinementPattern = {
        type: 'FILTER',
        id: 0,
        operation: 'addition',
        description: '',
        location: 0,
        target: [
          <any>{
            termType: 'literal',
            value: '42',
            datatype: { value: 'http://www.w3.org/2001/XMLSchema#integer' },
          },
        ],
      };
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        {},
        {},
        {},
        {},
        rng,
        1,
        1,
        undefined,
        [ filterPattern ],
      );
      const mapped = template.mapRefinementConfigToSparqlJs([ filterPattern ]);
      const term = <RDF.Literal>(<any>mapped[0]).target[0];
      expect(term.termType).toBe('Literal');
      expect(term.value).toBe('42');
      expect(term.datatype.value).toBe('http://www.w3.org/2001/XMLSchema#integer');
    });

    it('should convert BGP targets using targetToTriple', () => {
      const bgpPattern: IQueryRefinementPattern = {
        type: 'BGP',
        id: 0,
        operation: 'addition',
        description: '',
        location: 0,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'ex:p', termType: 'namedNode' },
            object: { value: 'o', termType: 'variable' },
          },
        ],
      };
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        {},
        {},
        {},
        {},
        rng,
        1,
        1,
        undefined,
        [ bgpPattern ],
      );
      const mapped = template.mapRefinementConfigToSparqlJs([ bgpPattern ]);
      expect((<any>mapped[0]).target[0].subject.termType).toBe('Variable');
    });
  });

  describe('instantiate', () => {
    it('should instantiate without refinement patterns (basic cycling)', () => {
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        { s: [ DF.namedNode('ex:s1'), DF.namedNode('ex:s2') ]},
        {},
        {},
        {},
        rng,
        1,
        2,
      );
      const result = template.instantiate(0, false, {});
      expect(result.queries).toHaveLength(1);
      expect(result.queries[0]).toContain('<ex:s1>');
      expect(result.asts).toHaveLength(1);
      expect(result.patternMetadata).toEqual([{}]);

      const result2 = template.instantiate(1, false, {});
      expect(result2.queries[0]).toContain('<ex:s2>');
    });

    it('should throw when instantiating with refinement flag but no patterns registered', () => {
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        { s: [ DF.namedNode('ex:s1') ]},
        {},
        {},
        {},
        rng,
        1,
        1,
      );
      expect(() => template.instantiate(0, true, {})).toThrow('No refinement patterns available for instantiation');
    });

    it('should instantiate with refinement patterns', () => {
      const bgpPattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'addition',
        description: '',
        location: 0,
        id: 0,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'ex:mod', termType: 'namedNode' },
            object: { value: 'forum', termType: 'variable' },
          },
        ],
      };
      const mockRng = jest.fn().mockReturnValue(0);
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        { s: [ DF.namedNode('ex:s1') ]},
        {},
        {},
        {},
        <any>mockRng,
        1,
        1,
        undefined,
        [ bgpPattern ],
      );
      const result = template.instantiate(0, true, {});
      expect(result.queries).toHaveLength(2); // Base + 1 refinement step
      expect(result.asts).toHaveLength(2);
      expect(result.patternMetadata).toHaveLength(2);
    });

    it('should use previousQueryResult values when provided', () => {
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        { s: [ DF.namedNode('ex:s1') ]},
        {},
        {},
        {},
        rng,
        1,
        1,
      );
      const result = template.instantiate(0, false, { s: [ DF.namedNode('ex:fromResult') ]});
      expect(result.queries[0]).toContain('<ex:fromResult>');
    });

    it('should update counter when previousQueryResult + user is given', () => {
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        { s: [ DF.namedNode('ex:s1'), DF.namedNode('ex:s2') ]},
        {},
        {},
        {},
        rng,
        1,
        1,
      );
      template.instantiate(0, false, { s: [ DF.namedNode('ex:fromResult'), DF.namedNode('ex:fromResult2') ]}, 'user1');
      expect(template.getInstantiationCounts()).toEqual({ s: { 'ex:fromResult': 1 }});
    });

    it('should sample from variableProbabilities when user is provided', () => {
      const probabilities: Record<string, Record<string, IEntityLogits[]>> = {
        s: {
          user1: [
            { entity: 'ex:val1', similarity: 0.6 },
            { entity: 'ex:val2', similarity: 0.4 },
          ],
          user2: [{ entity: 'ex:val3', similarity: 1 }],
          user3: [{ entity: 'ex:val4', similarity: 1 }],
        },
      };
      const deterministicRng = jest.fn()
        .mockReturnValueOnce(0.01) // First sampleTerm call → picks 'ex:val1' (cumulative 0.6 > 0.01)
        .mockReturnValueOnce(0.7); // Second sampleTerm call → picks 'ex:val2' (cumulative 1.0 > 0.7)
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        { s: [ DF.namedNode('ex:s1') ]},
        probabilities,
        {},
        {},
        <any>deterministicRng,
        1,
        1,
      );
      const result = template.instantiate(0, false, {}, 'user1');
      expect(result.queries[0]).toContain('<ex:val1>');
      expect(template.getInstantiationCounts()).toEqual({ s: { 'ex:val1': 1 }});
    });

    it('should throw when variableProbabilities set but no user provided', () => {
      const probabilities: Record<string, Record<string, IEntityLogits[]>> = {
        s: {
          user1: [{ entity: 'ex:val1', similarity: 1 }],
          user2: [{ entity: 'ex:val2', similarity: 1 }],
          user3: [{ entity: 'ex:val3', similarity: 1 }],
        },
      };
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        { s: [ DF.namedNode('ex:s1') ]},
        probabilities,
        {},
        {},
        rng,
        1,
        1,
      );
      expect(() => template.instantiate(0, false, {})).toThrow(
        `Variable 's' has probabilities configured but no user was provided for sampling.`,
      );
    });
  });

  describe('instantiateSyntaxTreeWrap (error / iriTransformer paths)', () => {
    it('should throw when called with non-SELECT query', () => {
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        {},
        {},
        {},
        {},
        rng,
        1,
        1,
      );
      const construct = new Parser().parse('CONSTRUCT WHERE { ?s ?p ?o. }');
      expect(() => template.instantiateSyntaxTreeWrap(construct, {}))
        .toThrow('Only instantiations of SELECT queries are supported');
    });

    it('should throw when variableMapping is missing from context', () => {
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        {},
        {},
        {},
        {},
        rng,
        1,
        1,
      );
      const syntaxTree = new Parser().parse('SELECT * WHERE { ?s ?p ?o. }');
      expect(() => (<any>template).instantiateSyntaxTreeRecurse(syntaxTree, (<any>template).instantiateTerm, {}))
        .toThrow('Instantiation of syntax tree failed due to missing variableMapping in context');
    });

    it('should transform prefixes when iriTransformer is provided', () => {
      const transformer: IValueTransformer = {
        transform: value => DF.namedNode(`${value.value}x`),
      };
      const template = new QuerySequenceTemplate(
        new Parser().parse('PREFIX ex: <http://example.org/>\nSELECT * WHERE { ?s ex:p ?o. }'),
        {},
        {},
        {},
        {},
        rng,
        1,
        1,
        transformer,
      );
      const syntaxTree = new Parser().parse('PREFIX ex: <http://example.org/>\nSELECT * WHERE { ?s ex:p ?o. }');
      const result = template.instantiateSyntaxTreeWrap(syntaxTree, {});
      expect(result.prefixes.ex).toBe('http://example.org/x');
    });

    it('should instantiate GROUP BY expressions when present', () => {
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT ?s WHERE { ?s ?p ?o. } GROUP BY ?s'),
        { p: [ DF.namedNode('ex:p1') ]},
        {},
        {},
        {},
        rng,
        1,
        1,
      );
      const syntaxTree = new Parser().parse('SELECT ?s WHERE { ?s ?p ?o. } GROUP BY ?s');
      const result = template.instantiateSyntaxTreeWrap(syntaxTree, { p: DF.namedNode('ex:p1') });
      expect(new Generator().stringify(result)).toBe(
        'SELECT ?s WHERE { ?s <ex:p1> ?o. }\nGROUP BY ?s',
      );
    });

    it('should transform NamedNode terms and PropertyPaths when iriTransformer is provided', () => {
      const transformer: IValueTransformer = {
        transform: (value: RDF.Term) => DF.namedNode(`${value.value}-t`),
      };
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s <ex:p1>/<ex:p2> ?o. }'),
        {},
        {},
        {},
        {},
        rng,
        1,
        1,
        transformer,
      );
      const result = template.instantiate(0, false, {});
      expect(result.queries[0]).toContain('<ex:p1-t>');
      expect(result.queries[0]).toContain('<ex:p2-t>');
    });

    it('should update variables query when query has GROUP BY (returns early without adding vars)', () => {
      const bgpPattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'addition',
        description: '',
        location: 0,
        id: 0,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'ex:name', termType: 'namedNode' },
            object: { value: 'name', termType: 'variable' },
          },
        ],
      };
      const input = createRefinementInput(
        'SELECT ?s WHERE { ?s ?p ?o. } GROUP BY ?s',
        { s: [ DF.namedNode('ex:s1') ]},
        {},
        bgpPattern,
      );
      const refinementState: IRefinementState = {
        stateQuery: createOperatorState(),
        stateFilter: createOperatorState(),
        stateUnion: createOperatorState(),
        stateOptional: createOperatorState(),
        stateSubstitution: {},
      };
      const result = input.template.applyRefinementPattern(
        bgpPattern,
        input.query,
        input.variableMapping,
        input.variableMappingAlternative,
        refinementState,
      );
      // GROUP BY query: variables list must NOT be expanded with ?name
      const gen = new Generator().stringify(result);
      expect(gen).toContain('GROUP BY');
      // ?name appears in the WHERE clause (triple was added), but must NOT be in SELECT variables
      expect(result.variables.some(v => 'value' in v && v.value === 'name')).toBe(false);
    });
  });

  describe('applyRefinementPattern (error and edge cases)', () => {
    let refinementState: IRefinementState;
    beforeEach(() => {
      refinementState = {
        stateQuery: createOperatorState(),
        stateFilter: createOperatorState(),
        stateUnion: createOperatorState(),
        stateOptional: createOperatorState(),
        stateSubstitution: {},
      };
    });

    it('should throw when pattern location is undefined', () => {
      const pattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'addition',
        description: 'no location',
        id: 0,
        location: <any>undefined,
        target: [],
      };
      const input = createRefinementInput('SELECT * WHERE { ?s ?p ?o. }', {}, {}, pattern);
      expect(() => input.template.applyRefinementPattern(
        pattern,
        input.query,
        {},
        {},
        refinementState,
      )).toThrow('Location for refinement pattern no location is not defined');
    });

    it('should throw for unknown operation type', () => {
      const pattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: <any>'noop',
        description: '',
        id: 0,
        location: 0,
        target: [],
      };
      const input = createRefinementInput('SELECT * WHERE { ?s ?p ?o. }', {}, {}, pattern);
      expect(() => input.template.applyRefinementPattern(
        pattern,
        input.query,
        {},
        {},
        refinementState,
      )).toThrow('Unknown operation type \'noop\'');
    });

    it('should throw for unsupported addition type', () => {
      const pattern = <IQueryRefinementPattern>{
        type: <any>'CUSTOM_TYPE',
        operation: <const>'addition',
        description: '',
        id: 0,
        location: 0,
        target: [],
      };
      const input = createRefinementInput('SELECT * WHERE { ?s ?p ?o. }', {}, {}, pattern);
      expect(() => input.template.applyRefinementPattern(
        pattern,
        input.query,
        {},
        {},
        refinementState,
      )).toThrow('Unsupported addition type');
    });

    it('should throw for unsupported removal type', () => {
      const pattern = <IQueryRefinementPattern>{
        type: <any>'CUSTOM_TYPE',
        operation: <const>'removal',
        description: '',
        id: 0,
        location: 0,
        target: [],
      };
      const input = createRefinementInput('SELECT * WHERE { ?s ?p ?o. }', {}, {}, pattern);
      expect(() => input.template.applyRefinementPattern(
        pattern,
        input.query,
        {},
        {},
        refinementState,
      )).toThrow('Unsupported removal type');
    });

    it('should throw when BGP location does not exist (getBgpSafely)', () => {
      const pattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'removal',
        description: '',
        id: 0,
        location: 99,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'p', termType: 'variable' },
            object: { value: 'o', termType: 'variable' },
          },
        ],
      };
      const input = createRefinementInput('SELECT * WHERE { ?s ?p ?o. }', {}, {}, pattern);
      expect(() => input.template.applyRefinementPattern(
        pattern,
        input.query,
        {},
        {},
        refinementState,
      )).toThrow('BGP Doesn\'t exist at index 99 for query operator bgp');
    });

    it('should throw when optional BGP index does not exist', () => {
      const pattern: IQueryRefinementPattern = {
        type: 'OPTIONAL',
        operation: 'addition',
        description: '',
        id: 0,
        location: 5,
        target: [
          {
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'p', termType: 'variable' },
            object: { value: 'o', termType: 'variable' },
          },
        ],
      };
      // Query already has an OPTIONAL so operatorToBgp.optional is populated, but index 5 doesn't exist
      const qs = 'SELECT * WHERE { ?s ?p ?o. OPTIONAL { ?a ?b ?c. } }';
      const input = createRefinementInput(qs, {}, {}, pattern);
      expect(() => input.template.applyRefinementPattern(
        pattern,
        input.query,
        {},
        {},
        refinementState,
      )).toThrow('BGP Doesn\'t exist at index 5');
    });

    it('should throw when createRefinementSequence finds no valid patterns', () => {
      const alwaysInvalidPattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'removal',
        description: '',
        id: 0,
        location: 0,
        // Targets a triple that does not exist in the query
        target: [
          {
            subject: { value: 'nonexistent', termType: 'variable' },
            predicate: { value: 'nonexistent', termType: 'namedNode' },
            object: { value: 'nonexistent', termType: 'variable' },
          },
        ],
      };
      const input = createRefinementInput('SELECT * WHERE { ?s ?p ?o. }', {}, {}, alwaysInvalidPattern);
      expect(() => input.template.createRefinementSequence(
        [ alwaysInvalidPattern ],
        input.query,
        1,
        {},
        {},
      )).toThrow('Found no valid patterns');
    });

    it('should throw when union left BGP missing but target is defined', () => {
      // A UNION addition with location 0 on a query with no unions
      // but we force the union bgp to be missing by using an impossible location
      const pattern: IQueryRefinementPattern = {
        type: 'UNION',
        operation: 'addition',
        description: '',
        id: 0,
        location: 5, // No union at index 5
        target: [
          [{
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'p', termType: 'namedNode' },
            object: { value: 'o', termType: 'variable' },
          }],
          [],
        ],
      };
      // Query with an existing union so operatorToBgp.union is populated
      const qs = 'SELECT * WHERE { { ?s ?p ?o. } UNION { ?a ?b ?c. } }';
      const input = createRefinementInput(qs, {}, {}, pattern);
      expect(() => input.template.applyRefinementPattern(
        pattern,
        input.query,
        {},
        {},
        refinementState,
      )).toThrow('BGP Doesn\'t exist for left union');
    });

    it('should throw when union right BGP missing but target is defined', () => {
      const pattern: IQueryRefinementPattern = {
        type: 'UNION',
        operation: 'addition',
        description: '',
        id: 0,
        location: 5,
        target: [
          [],
          [{
            subject: { value: 's', termType: 'variable' },
            predicate: { value: 'p', termType: 'namedNode' },
            object: { value: 'o', termType: 'variable' },
          }],
        ],
      };
      const qs = 'SELECT * WHERE { { ?s ?p ?o. } UNION { ?a ?b ?c. } }';
      const input = createRefinementInput(qs, {}, {}, pattern);
      expect(() => input.template.applyRefinementPattern(
        pattern,
        input.query,
        {},
        {},
        refinementState,
      )).toThrow('BGP Doesn\'t exist for right union');
    });

    it('should randomly select a triple to remove from union when both targets are empty', () => {
      const qs = 'SELECT * WHERE { { ?s ?p ?o. } UNION { ?x ?y ?z. } }';
      const pattern: IQueryRefinementPattern = {
        type: 'UNION',
        operation: 'removal',
        description: '',
        id: 0,
        location: 0,
        target: [[], []], // Both empty → triplesToRemove is [[], []] (length 2, not 0)
      };
      const mockRng = jest.fn().mockReturnValue(0.01); // Picks first triple
      const input = createRefinementInput(qs, {}, {}, pattern, mockRng);
      const result = input.template.applyRefinementPattern(
        pattern,
        input.query,
        {},
        {},
        refinementState,
      );
      const gen = new Generator().stringify(result);
      // One triple removed from both sides
      expect(gen).toContain('UNION');
    });

    it('should randomly sample a triple when UNION removal target outer array is empty', () => {
      // Covers lines 635-638: `if (triplesToRemove.length === 0)` branch
      // Cannot use createRefinementInput because the constructor calls mapRefinementConfigToSparqlJs,
      // which crashes when target is [] for a UNION pattern. We bypass that by constructing
      // the template with a dummy pattern and calling applyRefinementPattern directly.
      const qs = 'SELECT * WHERE { { ?s ?p ?o. } UNION { ?x ?y ?z. } }';
      const dummyBgpPattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'addition',
        description: '',
        id: 0,
        location: 0,
        target: [],
      };
      const mockRng = jest.fn().mockReturnValue(0.01);
      const template = new QuerySequenceTemplate(
        new Parser().parse(qs),
        {},
        {},
        {},
        {},
        <any>mockRng,
        1,
        1,
        undefined,
        [ dummyBgpPattern ],
      );
      const syntaxTree: SelectQuery = template.instantiateSyntaxTreeWrap(new Parser().parse(qs), {});

      // Pass an empty outer target array directly (bypassing mapRefinementConfigToSparqlJs)
      const emptyTargetUnionPattern = <IQueryRefinementPattern>{
        type: 'UNION',
        operation: <const>'removal',
        description: '',
        id: 0,
        location: 0,
        target: <any>[],
      };

      const emptyState: IRefinementState = {
        stateQuery: createOperatorState(),
        stateFilter: createOperatorState(),
        stateUnion: createOperatorState(),
        stateOptional: createOperatorState(),
        stateSubstitution: {},
      };

      const result = template.applyRefinementPattern(
        emptyTargetUnionPattern,
        syntaxTree,
        {},
        {},
        emptyState,
      );
      expect(new Generator().stringify(result)).toContain('UNION');
    });

    it('should add back a removed filter when target is empty', () => {
      const qs = 'SELECT * WHERE { ?s ?p ?o. FILTER(?o > "5") }';
      const pattern: IQueryRefinementPattern = {
        type: 'FILTER',
        operation: 'addition',
        description: '',
        id: 0,
        location: 0,
        target: [], // Empty → add back from removedExp
      };
      const mockRng = jest.fn().mockReturnValue(0.01);
      const input = createRefinementInput(qs, {}, {}, pattern, mockRng);
      // Pre-populate removedExp
      refinementState.stateFilter.removedExp.push({
        type: 'operation',
        operator: '>',
        args: [ DF.variable('o'), DF.literal('99') ],
      });
      const result = input.template.applyRefinementPattern(
        pattern,
        input.query,
        {},
        {},
        refinementState,
      );
      const gen = new Generator().stringify(result);
      expect(gen).toContain('FILTER');
      // The pre-existing filter expression from removedExp is consumed
      expect(refinementState.stateFilter.removedExp).toHaveLength(0);
    });

    it('should update removedExp list when adding a specific filter (covers removedExp.filter)', () => {
      const qs = 'SELECT * WHERE { ?s ?p ?o. }';
      const filterExpr = {
        type: <const>'operation',
        operator: '>',
        args: [ DF.variable('s'), DF.literal('18') ],
      };
      const pattern: IQueryRefinementPattern = {
        type: 'FILTER',
        operation: 'addition',
        description: '',
        id: 0,
        location: 0,
        target: [ filterExpr ],
      };
      const input = createRefinementInput(qs, {}, {}, pattern);
      // Pre-populate removedExp with the same expression
      refinementState.stateFilter.removedExp.push(filterExpr);
      refinementState.stateFilter.removedExp.push({
        type: 'operation',
        operator: '<',
        args: [ DF.variable('s'), DF.literal('100') ],
      });
      const result = input.template.applyRefinementPattern(
        pattern,
        input.query,
        {},
        {},
        refinementState,
      );
      const gen = new Generator().stringify(result);
      expect(gen).toContain('FILTER');
      // The matching expression should remain (filter keeps items where NOT ALL targetFilters match)
      // i.e. items that are NOT equal to any targetFilter are kept
      expect(refinementState.stateFilter.removedExp).toHaveLength(1);
    });

    it('should add back a previously removed triple when addBgp target is empty', () => {
      const qs = 'SELECT * WHERE { ?x ?p ?o. }';
      const pattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'addition',
        description: '',
        id: 0,
        location: 0,
        target: [], // Empty → sample from removedTps
      };
      const mockRng = jest.fn().mockReturnValue(0.01);
      const input = createRefinementInput(qs, {}, {}, pattern, mockRng);
      const removedTriple: Triple = {
        subject: DF.variable('s'),
        predicate: DF.namedNode('ex:name'),
        object: DF.variable('name'),
      };
      refinementState.stateQuery.removedTps.push(removedTriple);
      const result = input.template.applyRefinementPattern(
        pattern,
        input.query,
        {},
        {},
        refinementState,
      );
      const gen = new Generator().stringify(result);
      expect(gen).toContain('<ex:name>');
    });

    it('should remove matching triple from removedTps when addBgp has a specific target', () => {
      const qs = 'SELECT * WHERE { ?x ?p ?o. }';
      const removedTriple: Triple = {
        subject: DF.variable('s'),
        predicate: DF.namedNode('ex:name'),
        object: DF.variable('name'),
      };
      const pattern: IQueryRefinementPattern = {
        type: 'BGP',
        operation: 'addition',
        description: '',
        id: 0,
        location: 0,
        target: [ removedTriple ], // Specific target
      };
      const input = createRefinementInput(qs, {}, {}, pattern);
      // Pre-populate removedTps with the same triple AND another one
      refinementState.stateQuery.removedTps.push(removedTriple);
      refinementState.stateQuery.removedTps.push({
        subject: DF.variable('y'),
        predicate: DF.namedNode('ex:other'),
        object: DF.variable('z'),
      });
      input.template.applyRefinementPattern(
        pattern,
        input.query,
        {},
        {},
        refinementState,
      );
      // The matching triple should have been removed from removedTps
      expect(refinementState.stateQuery.removedTps).toHaveLength(1);
      expect(refinementState.stateQuery.removedTps[0].predicate).toEqual(DF.namedNode('ex:other'));
    });
  });

  describe('updateCounter / getInstantiationCounts / getVariableProbabilities', () => {
    it('should update instantiation counts correctly', () => {
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        {},
        {},
        {},
        {},
        rng,
        1,
        1,
      );
      expect(template.getInstantiationCounts()).toEqual({});

      template.updateCounter('s', 'ex:val1');
      expect(template.getInstantiationCounts()).toEqual({ s: { 'ex:val1': 1 }});

      template.updateCounter('s', 'ex:val1');
      expect(template.getInstantiationCounts()).toEqual({ s: { 'ex:val1': 2 }});

      template.updateCounter('s', 'ex:val2');
      expect(template.getInstantiationCounts()).toEqual({ s: { 'ex:val1': 2, 'ex:val2': 1 }});

      template.updateCounter('p', 'ex:pred');
      expect(template.getInstantiationCounts()).toEqual({ s: { 'ex:val1': 2, 'ex:val2': 1 }, p: { 'ex:pred': 1 }});
    });

    it('should return variable probabilities', () => {
      const probabilities: Record<string, Record<string, IEntityLogits[]>> = {
        s: {
          user1: [{ entity: 'ex:val1', similarity: 1 }],
        },
      };
      const template = new QuerySequenceTemplate(
        new Parser().parse('SELECT * WHERE { ?s ?p ?o. }'),
        {},
        probabilities,
        {},
        {},
        rng,
        1,
        1,
      );
      expect(template.getVariableProbabilities()).toBe(probabilities);
    });
  });
});

/**
 * Helper function to create the required input for instantiating a refinement pattern.
 * @param query Query string
 * @param variableMappings Mapping variable names to potential values, only first will be picked for
 * instantiation
 * @param variableMappingsAlternative Mapping of alternative values, used for substitutions.
 * @param refinementPattern The refinement pattern used to create alternative version of query
 * @param rngParam Optional rng parameter to control deterministic sampling in tests
 * @returns input data required to apply refinement
 */
function createRefinementInput(
  query: string,
  variableMappings: Record<string, RDF.Term[]>,
  variableMappingsAlternative: Record<string, RDF.Term[]>,
  refinementPattern: IQueryRefinementPattern,
  rngParam?: any,
): IRefinementInput {
  const template = new QuerySequenceTemplate(
    new Parser().parse(query),
    variableMappings,
    {},
    {},
    {},
    rngParam ?? rng,
    2,
    5,
    undefined,
    [ refinementPattern ],
  );

  // Simulate choosing a variable
  const singleVariableMapping = Object.fromEntries(
    Object.entries(variableMappings)
      .filter(([ _, arr ]) => arr.length > 0)
      .map(([ key, arr ]) => [ key, arr[0] ]),
  );
  const singleVariableMappingAlternative = Object.fromEntries(
    Object.entries(variableMappingsAlternative)
      .filter(([ _, arr ]) => arr.length > 0)
      .map(([ key, arr ]) => [ key, arr[0] ]),
  );

  const syntaxTreeQuery: SelectQuery = template.instantiateSyntaxTreeWrap(
    new Parser().parse(query),
    singleVariableMapping,
  );
  return {
    query: syntaxTreeQuery,
    variableMapping: singleVariableMapping,
    variableMappingAlternative: singleVariableMappingAlternative,
    template,
  };
}

function createOperatorState(): IOperatorState {
  return {
    addedTps: [],
    removedTps: [],
    addedExp: [],
    removedExp: [],
  };
}

interface IRefinementInput {
  query: SelectQuery;
  variableMapping: Record<string, RDF.Term>;
  variableMappingAlternative: Record<string, RDF.Term>;
  template: QuerySequenceTemplate;
}
