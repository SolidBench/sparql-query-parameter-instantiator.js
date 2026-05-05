import type * as RDF from '@rdfjs/types';
import type { Logger } from 'pino';
import type * as seedrandom from 'seedrandom';

import type { SelectQuery } from 'sparqljs';
import { logger } from '../logging/logger';
import type { QuerySequenceTemplate } from '../QuerySequenceTemplate';
import type { INextTemplate, QuerySequenceTemplateProvider } from '../QuerySequenceTemplateProvider';
import {
  calculateExpectedMeanLogNormal,
  logNormal,
  logNormalRoundedUp,
  sampleHit,
  sampleProbability,
  sampleRandom,
} from '../utils/RandomUtils';
import type { IJoinTreeNode } from './QLeverInstance';
import type { QueryNextInstantiatorValue } from './QueryNextInstantiationValue';

export class SequenceGenerator {
  private readonly meanLogSequenceLength: number;
  private readonly stdLogSequenceLength: number;
  private readonly meanLogSessionLength: number;
  private readonly stdLogSessionLength: number;
  private readonly meanLogTransitionProbability: number;
  private readonly stdLogTransitionProbability: number;
  private readonly refinementPatternProbability: number;
  private readonly temperature: number;
  private readonly findNextInstantiationValue: QueryNextInstantiatorValue;

  private readonly log: Logger;

  public constructor(args: ISequenceGeneratorArgs) {
    this.meanLogSequenceLength = args.meanLogSequenceLength;
    this.stdLogSequenceLength = args.stdLogSequenceLength;
    this.meanLogSessionLength = args.meanLogSessionLength;
    this.stdLogSessionLength = args.stdLogSessionLength;
    this.meanLogTransitionProbability = args.meanLogTransitionProbability;
    this.stdLogTransitionProbability = args.stdLogTransitionProbability;
    this.refinementPatternProbability = args.refinementPatternProbability;
    this.temperature = args.temperature;
    this.findNextInstantiationValue = args.findNextInstantiationValue;

    this.log = logger.child({ module: 'SequenceGenerator' });
    this.log.info({
      expectedSequenceLength: calculateExpectedMeanLogNormal(
        this.meanLogSequenceLength,
        this.stdLogSequenceLength,
      ),
      expectedSessionLength: calculateExpectedMeanLogNormal(
        this.meanLogSessionLength,
        this.stdLogSessionLength,
      ),
      expectedTransitionProbability: calculateExpectedMeanLogNormal(
        this.meanLogTransitionProbability,
        this.stdLogTransitionProbability,
      ),
    }, 'Sequence generation parameters initialized');
  }

  public initSequence(rng: seedrandom.PRNG, user: string, n: number): ISequenceInit {
    const sequenceLength = logNormalRoundedUp(rng, this.meanLogSequenceLength, this.stdLogSequenceLength);
    const sessionTransitionProbability = logNormal(
      rng,
      this.meanLogTransitionProbability,
      this.stdLogTransitionProbability,
    );

    const sequenceMetadata: IQuerySequenceMetadata = {
      user: { user, transitionProbability: sessionTransitionProbability },
      sequenceElements: [],
      sequenceLength,
      sequenceInstantiationCounts: {},
    };

    this.log.debug(
      {
        n,
        sequenceLength,
        user,
        sessionTransitionProbability: sessionTransitionProbability.toFixed(2),
      },
      'Instantiating sequence',
    );
    return { sequenceLength, sessionTransitionProbability, sequenceMetadata };
  }

  public startNewSession(
    rng: seedrandom.PRNG,
    templates: IQuerySequenceElementTemplate[],
    nSessions: number,
    templateCounts: Record<string, number>,
  ): IQuerySession {
    // Sample start query by these calculated weights based on
    // occurrences of each query to ensure approximately equal occurrences
    let totalWeight = 0;
    const rawWeights = templates.map((t) => {
      const currentCount = templateCounts[t.name] || 0;
      const weight = 1 / (currentCount * 2 + 1);
      totalWeight += weight;
      return { entity: t, weight };
    });

    const startQuery = sampleProbability(rng, rawWeights.map(rw => ({
      entity: rw.entity,
      probability: rw.weight / totalWeight,
    })));

    return {
      sessionId: nSessions,
      templates: [ startQuery ],
      task: startQuery.task,
      sessionLength: logNormalRoundedUp(rng, this.meanLogSessionLength, this.stdLogSessionLength),
      queryCount: 0,
      ended: false,
    };
  }

  public async addTemplateToSequence(
    rng: seedrandom.PRNG,
    query: IQuerySequenceElementTemplate,
    session: IQuerySession,
    sequenceSessions: IQuerySession[],
    sequence: string[],
    user: string,
    templateCounts: Record<string, number>,
    sequenceMetadata: IQuerySequenceMetadata,
  ): Promise<{ ast: SelectQuery; queriesAdded: number }> {
    const instantiateRefinementPattern = rng() < this.refinementPatternProbability;
    let nextInstantiators: Record<string, RDF.Term[]> = {};

    // Fetch instantiation values for the new query by taking the AST of
    // the previous query in the session (not always the previous query in whole sequence)
    const sessionHasLastAst = Boolean(session.lastAst);
    if (session.lastAst) {
      const previousTemplate = session.templates.at(-1)!;
      const { instantiationValues } = await this.determineNextInstantiator(
        session.lastAst,
        previousTemplate.template,
        query.template,
      );
      nextInstantiators = instantiationValues;
    }

    // Instantiate the new query, outputs are arrays due to possible
    // refinement pattern instantiations
    const currentCount = templateCounts[query.name] || 0;
    const { queries, patternMetadata, asts } = query.template.instantiate(
      currentCount,
      instantiateRefinementPattern,
      nextInstantiators,
      user,
    );

    sequence.push(...queries);

    if (session.templates.at(-1)?.name !== query.name) {
      session.templates.push(query);
    }

    session.lastAst = asts.at(-1)!;
    session.queryCount += queries.length;
    templateCounts[query.name] = currentCount + 1;

    if (session.queryCount >= session.sessionLength) {
      session.ended = true;
    }

    const nOpenSessions = sequenceSessions.filter(x => !x.ended).length;

    // For all generated queries (including refinement patterns), we get
    // join plans and any additional metadata
    for (let i = 0; i < queries.length; i++) {
      const currentAst = asts[i];

      // Fetch the join plan for this specific query.
      // Passing the current template twice safely executes the query without side-effects on external mappings.
      let joinPlan: IJoinTreeNode | undefined;
      if (sessionHasLastAst) {
        const result = await this.determineNextInstantiator(
          currentAst,
          query.template,
          query.template,
        );
        joinPlan = result.joinPlan;
      }

      sequenceMetadata.sequenceElements.push({
        session: {
          task: session.task,
          sessionLength: session.sessionLength,
          sessionId: session.sessionId,
        },
        template: query.name,
        nOpenSessions,
        refinementMetadata: patternMetadata[i],
        joinPlanCentralized: joinPlan,
      });
    }
    return { ast: session.lastAst, queriesAdded: queries.length };
  }

  public async createAndRegisterNewSession(
    rng: seedrandom.PRNG,
    user: string,
    templates: IQuerySequenceElementTemplate[],
    templateCounts: Record<string, number>,
    sequenceSessions: IQuerySession[],
    querySequence: string[],
    sequenceMetadata: IQuerySequenceMetadata,
  ): Promise<ISessionStart> {
    const session = this.startNewSession(rng, templates, sequenceSessions.length, templateCounts);
    sequenceSessions.push(session);
    const result = await this.addTemplateToSequence(
      rng,
      session.templates[0],
      session,
      sequenceSessions,
      querySequence,
      user,
      templateCounts,
      sequenceMetadata,
    );
    return { session, ...result };
  };

  public async generateSequence(
    rng: seedrandom.PRNG,
    providers: QuerySequenceTemplateProvider[],
    templateCounts: Record<string, number>,
    user: string,
    n: number,
  ): Promise<IQuerySequence> {
    await this.findNextInstantiationValue.getQLeverReadyStatus();

    const { sequenceLength, sessionTransitionProbability, sequenceMetadata } = this.initSequence(rng, user, n);

    const templates: IQuerySequenceElementTemplate[] = await Promise.all(
      providers.map(async provider => ({
        task: provider.queryTask,
        name: provider.getTemplateName(),
        nextFilePaths: provider.getNextTemplates(),
        template: await provider.createTemplate(rng, this.temperature),
      })),
    );

    const sequenceSessions: IQuerySession[] = [];
    const querySequence: string[] = [];

    let { session: currentSession, queriesAdded } = await this.createAndRegisterNewSession(
      rng,
      user,
      templates,
      templateCounts,
      sequenceSessions,
      querySequence,
      sequenceMetadata,
    );
    let totalQueriesGenerated = queriesAdded;

    // Control execution loop using total queries to properly handle batch refinement generation
    while (totalQueriesGenerated < sequenceLength) {
      const openExtraSessions = sequenceSessions.filter(s => !s.ended && s !== currentSession);
      const shouldSwitch = sampleHit(rng, sessionTransitionProbability);

      if (shouldSwitch || currentSession.ended) {
        if (openExtraSessions.length > 0 && sampleHit(rng, 0.5)) {
          currentSession = sampleRandom(rng, openExtraSessions);
          continue;
        } else {
          const res = await this.createAndRegisterNewSession(
            rng,
            user,
            templates,
            templateCounts,
            sequenceSessions,
            querySequence,
            sequenceMetadata,
          );
          currentSession = res.session;
          totalQueriesGenerated += res.queriesAdded;
          continue;
        }
      }

      const lastElement = currentSession.templates.at(-1)!;
      const nextOptions = lastElement.nextFilePaths;

      if (nextOptions.length === 0) {
        currentSession.ended = true;
        const res = await this.createAndRegisterNewSession(
          rng,
          user,
          templates,
          templateCounts,
          sequenceSessions,
          querySequence,
          sequenceMetadata,
        );
        currentSession = res.session;
        totalQueriesGenerated += res.queriesAdded;
        continue;
      }

      let totalWeight = 0;
      const rawWeights = nextOptions.map((t) => {
        const currentCount = templateCounts[t.template] || 0;
        const weight = t.probability! / (currentCount * 2 + 1);
        totalWeight += weight;
        return { entity: t, weight };
      });

      const choice = sampleProbability(rng, rawWeights.map(rw => ({
        entity: rw.entity,
        probability: rw.weight / totalWeight,
      })));

      const nextQuery = templates.find(t => t.name === choice.template);
      if (!nextQuery) {
        throw new Error(`Template not found: ${choice.template}`);
      }

      const res = await this.addTemplateToSequence(
        rng,
        nextQuery,
        currentSession,
        sequenceSessions,
        querySequence,
        user,
        templateCounts,
        sequenceMetadata,
      );
      totalQueriesGenerated += res.queriesAdded;
    }

    // Update metadata counts and correct the sequence length parameter
    for (const template of templates) {
      sequenceMetadata.sequenceInstantiationCounts[template.name] = template.template.getInstantiationCounts();
    }
    sequenceMetadata.sequenceLength = totalQueriesGenerated;

    return { querySequence, sequenceMetadata };
  }

  public async determineNextInstantiator(
    ast: SelectQuery,
    lastTemplate: QuerySequenceTemplate,
    nextTemplate: QuerySequenceTemplate,
  ): Promise<{ instantiationValues: Record<string, RDF.Term[]>; joinPlan?: IJoinTreeNode }> {
    const mapping: Record<string, string[]> = this.mapOutputVariablesToInstatiationVariables(
      lastTemplate,
      nextTemplate,
    );
    return await this.findNextInstantiationValue.getNextQueryInstantiationValues(ast, mapping);
  }

  private mapOutputVariablesToInstatiationVariables(
    lastTemplate: QuerySequenceTemplate,
    nextTemplate: QuerySequenceTemplate,
  ): Record<string, string[]> {
    const typeToInstVars: Record<string, string[]> = {};
    for (const [ instVar, type ] of Object.entries(nextTemplate.instantiationVariableTypeMap)) {
      if (!typeToInstVars[type]) {
        typeToInstVars[type] = [];
      }
      typeToInstVars[type].push(instVar);
    }

    const mapping: Record<string, string[]> = {};
    for (const [ variable, type ] of Object.entries(lastTemplate.outputVariableTypeMap)) {
      if (typeToInstVars[type]) {
        mapping[variable] = typeToInstVars[type];
      }
    }
    return mapping;
  }
}

// Interfaces remain the same as previously defined, with `queryCount: number` added to `IQuerySession`.
export interface ISequenceInit {
  sequenceLength: number;
  sessionTransitionProbability: number;
  sequenceMetadata: IQuerySequenceMetadata;
}

export interface ISequenceGeneratorArgs {
  /**
   * @param meanLogSequenceLength - Mean sequence length
   * @range {float}
   * @default: 1.7
   */
  meanLogSequenceLength: number;
  /**
   * @param stdLogSequenceLength - Standard deviation of sequence length
   * @range {float}
   * @default: .5
   */
  stdLogSequenceLength: number;
  /**
   * @param meanLogSequenceLength - Mean session length
   * @range {float}
   * @default: 1.7
   */
  meanLogSessionLength: number;
  /**
   * @param stdLogSessionLength - Standard deviation of session length
   * @range {float}
   * @default: .5
   */
  stdLogSessionLength: number;
  /**
   * @param meanLogTransitionProbability - Log Mean session transition probability
   * @range {float}
   * @default: -2
   */
  meanLogTransitionProbability: number;
  /**
   * @param stdLogSequenceLength - Log Standard deviation of session transition probability
   * @range {float}
   * @default: .5
   */
  stdLogTransitionProbability: number;
  /**
   * The probability of instantiation a refinement sequence from a given template
   * @param refinementPatternProbability
   * @range {float}
   * @default: .1
   */
  refinementPatternProbability: number;
  /**
   * @param temperature - Softmax temperature
   * @range {float}
   * @default: .5
   */
  temperature: number;
  /**
   * Class that finds the next instantiation value within a session based on the last query in
   * that session
   */
  findNextInstantiationValue: QueryNextInstantiatorValue;
}

export interface IQuerySequence {
  /**
   * String representing the query sequence
   */
  querySequence: string[];
  /**
   * Metadata on the generation process underlying the sequence
   */
  sequenceMetadata: IQuerySequenceMetadata;
}

export interface ISessionStart {
  /**
   * The started session
   */
  session: IQuerySession;
  /**
   * Ast of the new query in session
   */
  ast: SelectQuery;
  /**
   * Queries added to session at start, can be > 1 when
   * a refinement pattern is instantiated
   */
  queriesAdded: number;

}

export interface IProbabilities<T> {
  entity: T;
  probability: number;
}

export interface IQuerySession extends IQuerySessionMetadata {
  templates: IQuerySequenceElementTemplate[];
  ended: boolean;
  lastAst?: SelectQuery;
  queryCount: number;
}

export interface IQuerySessionMetadata {
  task: string;
  sessionLength: number;
  sessionId: number;
}

export interface IQuerySequenceElementTemplate {
  task: string;
  name: string;
  nextFilePaths: INextTemplate[];
  template: QuerySequenceTemplate;
}

export interface IQuerySequenceElementMetadata {
  session: IQuerySessionMetadata;
  template: string;
  nOpenSessions: number;
  refinementMetadata: Record<string, any>;
  joinPlanCentralized?: IJoinTreeNode;
}

export interface IQuerySequenceMetadata {
  user: IUserMetadata;
  sequenceElements: IQuerySequenceElementMetadata[];
  sequenceLength: number;
  sequenceInstantiationCounts: InstantiationCounts;
}

export interface IUserMetadata {
  user: string;
  transitionProbability: number;
}

/**
 * Counter mapping:
 * template -> user -> variable -> instatiation value -> # of instantiations with that value
 */
export type InstantiationCounts = Record<string, Record<string, Record<string, number>>>;
