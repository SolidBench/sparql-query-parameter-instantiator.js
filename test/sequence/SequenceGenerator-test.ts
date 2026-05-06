import { DataFactory } from 'rdf-data-factory';
import type { SelectQuery } from 'sparqljs';
import type { QuerySequenceTemplate } from '../../lib/QuerySequenceTemplate';
import type { QuerySequenceTemplateProvider } from '../../lib/QuerySequenceTemplateProvider';
import type { QueryNextInstantiatorValue } from '../../lib/sequence/QueryNextInstantiationValue';
import type { IProbabilities, IQuerySequenceElementTemplate } from '../../lib/sequence/SequenceGenerator';
import { SequenceGenerator } from '../../lib/sequence/SequenceGenerator';
import * as RandomUtils from '../../lib/utils/RandomUtils';

const DF = new DataFactory();

jest.mock('../../lib//utils/RandomUtils', () => ({
  calculateExpectedMeanLogNormal: jest.fn().mockReturnValue(5),
  logNormal: jest.fn().mockReturnValue(0.5),
  logNormalRoundedUp: jest.fn().mockReturnValue(5),
  sampleHit: jest.fn().mockReturnValue(false),
  sampleProbability: jest.fn().mockImplementation((rng, items) => items[0].entity),
  sampleRandom: jest.fn().mockImplementation((rng, items) => items[0]),
}));

jest.mock('../../lib/logging/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

describe('SequenceGenerator', () => {
  let generator: SequenceGenerator;
  let mockFindNextInstantiationValue: jest.Mocked<QueryNextInstantiatorValue>;
  let mockRng: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFindNextInstantiationValue = <jest.Mocked<QueryNextInstantiatorValue>>
    <unknown> {
      getQLeverReadyStatus: jest.fn().mockResolvedValue(undefined),
      getNextQueryInstantiationValues: jest.fn().mockResolvedValue({
        instantiationValues: { var1: []},
        joinPlan: { operation: 'JOIN', children: []},
      }),
    };

    generator = new SequenceGenerator({
      meanLogSequenceLength: 1.5,
      stdLogSequenceLength: 0.5,
      meanLogSessionLength: 1,
      stdLogSessionLength: 0.2,
      meanLogTransitionProbability: -2,
      stdLogTransitionProbability: 0.5,
      refinementPatternProbability: 0.1,
      temperature: 0.5,
      findNextInstantiationValue: mockFindNextInstantiationValue,
    });

    mockRng = jest.fn();
  });

  describe('initSequence', () => {
    it('initializes sequence metadata correctly based on random distributions', () => {
      const user = 'testUser';
      const n = 1;

      const result = generator.initSequence(mockRng, user, n);

      expect(RandomUtils.logNormalRoundedUp).toHaveBeenCalledWith(mockRng, 1.5, 0.5);
      expect(RandomUtils.logNormal).toHaveBeenCalledWith(mockRng, -2, 0.5);
      expect(result.sequenceLength).toBe(5); // From mock
      expect(result.sessionTransitionProbability).toBe(0.5); // From mock
      expect(result.sequenceMetadata.user.user).toBe(user);
    });
  });

  describe('startNewSession', () => {
    it('weights start queries inversely to their previous occurrences', () => {
      const templates: any[] = [
        { name: 'TemplateA', task: 'Task1' },
        { name: 'TemplateB', task: 'Task1' },
      ];
      const expected: IProbabilities<IQuerySequenceElementTemplate> = {
        entity: templates[1],
        probability: 1 / 1.2,
      };
      const templateCounts = { TemplateA: 2, TemplateB: 0 };

      // Mock sampleProbability to return the second item (TemplateB)
      (<jest.Mock> RandomUtils.sampleProbability).mockImplementationOnce((rng, items) => items[1]);

      const session = generator.startNewSession(mockRng, templates, 1, templateCounts);

      // Verify calculation logic: weight = 1 / (count * 2 + 1)
      // TemplateA weight = 1 / (2*2 + 1) = 0.2
      // TemplateB weight = 1 / (0*2 + 1) = 1.0
      // Total weight = 1.2
      expect(RandomUtils.sampleProbability).toHaveBeenCalledWith(mockRng, [
        { entity: templates[0], probability: 0.2 / 1.2 },
        { entity: templates[1], probability: 1 / 1.2 },
      ]);

      expect(session.sessionId).toBe(1);
      expect(session.templates[0]).toEqual(expected);
      expect(session.queryCount).toBe(0);
      expect(session.ended).toBe(false);
    });
  });

  describe('determineNextInstantiator', () => {
    it('maps output variables to instantiation variables across templates', async() => {
      const mockAst = <SelectQuery> {};
      const lastTemplate = <QuerySequenceTemplate> <unknown> {
        outputVariableTypeMap: { outVar1: 'TypeA', outVar2: 'TypeB' },
      };

      const nextTemplate = <QuerySequenceTemplate> <unknown> {
        instantiationVariableTypeMap: { instVar1: 'TypeA', instVar2: 'TypeC' },
      };

      await generator.determineNextInstantiator(mockAst, lastTemplate, nextTemplate);

      expect(mockFindNextInstantiationValue.getNextQueryInstantiationValues).toHaveBeenCalledWith(
        mockAst,
        { outVar1: [ 'instVar1' ]},
      );
    });
    it('groups multiple output variables of the same type into an array', async() => {
      const mockAst = <SelectQuery> {};
      const lastTemplate = <QuerySequenceTemplate> <unknown> {
        outputVariableTypeMap: { outVar1: 'TypeA' },
      };

      const nextTemplate = <QuerySequenceTemplate> <unknown> {
        // Includes two variables of the same type to trigger array push branch
        instantiationVariableTypeMap: { instVar1: 'TypeA', instVar2: 'TypeA' },
      };

      await generator.determineNextInstantiator(mockAst, lastTemplate, nextTemplate);

      expect(mockFindNextInstantiationValue.getNextQueryInstantiationValues).toHaveBeenCalledWith(
        mockAst,
        { outVar1: [ 'instVar1', 'instVar2' ]},
      );
    });
  });

  describe('addTemplateToSequence', () => {
    let mockQueryTemplate: any;
    let mockSession: any;

    beforeEach(() => {
      const mockAst = <SelectQuery> <unknown> { type: 'query', queryType: 'SELECT' };

      mockQueryTemplate = {
        name: 'Query1',
        template: {
          instantiate: jest.fn().mockReturnValue({
            queries: [ 'SELECT * WHERE { ?s ?p ?o }' ],
            patternMetadata: [{ pattern: 'default' }],
            asts: [ mockAst ],
          }),
        },
      };

      mockSession = {
        sessionId: 0,
        task: 'Task1',
        templates: [],
        sessionLength: 2,
        queryCount: 0,
        ended: false,
      };
    });

    it('instantiates new query and updates session constraints', async() => {
      const sequence: string[] = [];
      const templateCounts: Record<string, number> = {};
      const sequenceMetadata: any = { sequenceElements: []};

      const result = await generator.addTemplateToSequence(
        mockRng,
        mockQueryTemplate,
        mockSession,
        [ mockSession ],
        sequence,
        'user1',
        templateCounts,
        sequenceMetadata,
      );

      expect(result.queriesAdded).toBe(1);
      expect(sequence).toHaveLength(1);
      expect(templateCounts.Query1).toBe(1);
      expect(mockSession.queryCount).toBe(1);
      expect(mockSession.ended).toBe(false);
      expect(sequenceMetadata.sequenceElements).toHaveLength(1);
    });

    it('ends the session if queryCount meets or exceeds sessionLength', async() => {
      mockSession.queryCount = 1; // 1 + 1 (new query) = 2, matches sessionLength = 2

      await generator.addTemplateToSequence(
        mockRng,
        mockQueryTemplate,
        mockSession,
        [ mockSession ],
        [],
        'user1',
        {},
        <any> { sequenceElements: []},
      );

      expect(mockSession.ended).toBe(true);
    });

    it('fetches instantiation values by mocking determineNextInstantiator to bypass AST requirements', async() => {
      const mockMappingResult = {
        instantiationValues: { testVar: [ DF.namedNode('ex:val1') ]},
      };
      const determineSpy = jest.spyOn(generator, 'determineNextInstantiator')
        .mockResolvedValue(mockMappingResult);

      const prevTemplate = { template: { outputVariableTypeMap: {}}};
      mockSession.lastAst = <any> { type: 'query' };
      mockSession.templates = [ prevTemplate ];

      await generator.addTemplateToSequence(
        mockRng,
        mockQueryTemplate,
        mockSession,
        [ mockSession ],
        [],
        'user1',
        {},
        <any> { sequenceElements: []},
      );

      // Verify it was called twice (once for values, once for the join plan in the loop)
      expect(determineSpy).toHaveBeenCalledTimes(2);

      // Verify that we attempt to instantiate the template with the previously obtained
      // instantiation values
      expect(mockQueryTemplate.template.instantiate).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Boolean),
        { testVar: [ DF.namedNode('ex:val1') ]},
        'user1',
      );
    });
  });

  describe('generateSequence', () => {
    it('executes the generation loop and respects sequence length', async() => {
      // Force sequence length to 2 to run the loop twice
      (<jest.Mock> RandomUtils.logNormalRoundedUp).mockReturnValueOnce(2);
      const mockMappingResult = {
        instantiationValues: { testVar: [ DF.namedNode('ex:val1') ]},
      };
      jest.spyOn(generator, 'determineNextInstantiator')
        .mockResolvedValue(mockMappingResult);

      const mockProvider: QuerySequenceTemplateProvider = <QuerySequenceTemplateProvider>
      <unknown> {
        queryTask: 'Task1',
        getTemplateName: () => 'Template1',
        getNextTemplates: () => [{ template: 'Template1', probability: 1 }],
        createTemplate: jest.fn().mockResolvedValue({
          getInstantiationCounts: jest.fn().mockReturnValue({}),
          instantiate: jest.fn().mockReturnValue({
            queries: [ 'query1' ],
            patternMetadata: [{}],
            asts: [{ type: 'query', queryType: 'SELECT' }],
          }),
        }),
      };

      const result = await generator.generateSequence(mockRng, [ mockProvider ], {}, 'user1', 1);

      expect(mockFindNextInstantiationValue.getQLeverReadyStatus).toHaveBeenCalledWith();
      expect(result.querySequence).toHaveLength(2);
      expect(result.sequenceMetadata.sequenceLength).toBe(2);
    });

    it('switches to an existing open session when probabilities align', async() => {
      const provider: any = {
        queryTask: 'T1',
        getTemplateName: () => 'T1',
        getNextTemplates: () => [{ template: 'T1', probability: 1 }],
        createTemplate: jest.fn().mockResolvedValue({
          getInstantiationCounts: jest.fn().mockReturnValue({}),
          instantiate: jest.fn().mockReturnValue({ queries: [ 'q' ], patternMetadata: [{}], asts: [{}]}),
        }),
      };

      (<jest.Mock> RandomUtils.logNormalRoundedUp).mockReturnValue(3);
      const mockMappingResult = {
        instantiationValues: { testVar: [ DF.namedNode('ex:val1') ]},
      };
      jest.spyOn(generator, 'determineNextInstantiator')
        .mockResolvedValue(mockMappingResult);

      (<jest.Mock> RandomUtils.sampleHit)
        .mockReturnValueOnce(true) // Iteration 1: Switch to new session
        .mockReturnValueOnce(true) // Iteration 2: Switch again
        .mockReturnValueOnce(true); // Iteration 3: To new session!

      const result = await generator.generateSequence(mockRng, [ provider ], {}, 'user1', 1);
      expect(result.querySequence).toHaveLength(3);
      expect(result.sequenceMetadata.sequenceElements.map(element => element.session.sessionId))
        .toEqual([ 0, 1, 0 ]);
    });

    it('creates a new session when nextOptions is empty', async() => {
      (<jest.Mock> RandomUtils.logNormalRoundedUp).mockReturnValue(2);
      const mockMappingResult = {
        instantiationValues: { testVar: [ DF.namedNode('ex:val1') ]},
      };
      jest.spyOn(generator, 'determineNextInstantiator')
        .mockResolvedValue(mockMappingResult);

      const providerWithNoOptions: any = {
        queryTask: 'Task1',
        getTemplateName: () => 'TemplateEnd',
        getNextTemplates: () => [], // Empty options triggers session end
        createTemplate: jest.fn().mockResolvedValue({
          getInstantiationCounts: jest.fn().mockReturnValue({}),
          instantiate: jest.fn().mockReturnValue({ queries: [ 'q1' ], patternMetadata: [{}], asts: [{}]}),
        }),
      };

      const result = await generator.generateSequence(mockRng, [ providerWithNoOptions ], {}, 'user1', 1);
      expect(result.querySequence).toHaveLength(2);
      expect(result.sequenceMetadata.sequenceElements.map(element => element.session.sessionId))
        .toEqual([ 0, 1 ]);
    });

    it('throws an error if the next template is not found in the providers array', async() => {
      (<jest.Mock> RandomUtils.logNormalRoundedUp).mockReturnValue(2);

      const providerWithBadLink: any = {
        queryTask: 'Task1',
        getTemplateName: () => 'Template1',
        getNextTemplates: () => [{ template: 'NonExistent', probability: 1 }], // Force missing template
        createTemplate: jest.fn().mockResolvedValue({
          getInstantiationCounts: jest.fn().mockReturnValue({}),
          instantiate: jest.fn().mockReturnValue({ queries: [ 'q1' ], patternMetadata: [{}], asts: [{}]}),
        }),
      };

      await expect(
        generator.generateSequence(mockRng, [ providerWithBadLink ], {}, 'user1', 1),
      ).rejects.toThrow('Template not found: NonExistent');
    });
  });
});
