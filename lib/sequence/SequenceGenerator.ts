import type * as RDF from '@rdfjs/types';
import type * as seedrandom from 'seedrandom';

import type { SelectQuery } from 'sparqljs';
import type { QuerySequenceTemplate } from '../QuerySequenceTemplate';
import type { INextTemplate, QuerySequenceTemplateProvider } from '../QuerySequenceTemplateProvider';
import { calculateExpectedMeanLogNormal, logNormal, logNormalRoundedUp, sampleHit, sampleProbability, sampleRandom } from '../utils/RandomUtils';
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

  public constructor(args: ISequenceGeneratorArgs) {
    this.meanLogSequenceLength = args.meanLogSequenceLength;
    this.stdLogSequenceLength = args.stdLogSequenceLength;
    console.log(`Expected sequence length: ${
        calculateExpectedMeanLogNormal(this.meanLogSequenceLength, this.stdLogSequenceLength)
        }`);
    // The mean and std of the distribution determining the simulated session length within sequences
    this.meanLogSessionLength = args.meanLogSessionLength;
    this.stdLogSessionLength = args.stdLogSessionLength;
    console.log(`Expected session length: ${
        calculateExpectedMeanLogNormal(this.meanLogSessionLength, this.stdLogSessionLength)
        }`);
    // The mean and std of the distribution determining the simulated probability of switching between
    // sessions within a sequence
    this.meanLogTransitionProbability = args.meanLogTransitionProbability;
    this.stdLogTransitionProbability = args.stdLogTransitionProbability;
    console.log(`Expected transition probability: ${
        calculateExpectedMeanLogNormal(
            this.meanLogTransitionProbability,
            this.stdLogTransitionProbability,
        )}`);
    this.refinementPatternProbability = args.refinementPatternProbability;
    this.temperature = args.temperature;
    this.findNextInstantiationValue = args.findNextInstantiationValue;
  }

  public initSequence(rng: seedrandom.PRNG, user: string, n: number): ISequenceInit {
    const sequenceLength = logNormalRoundedUp(
      rng,
      this.meanLogSequenceLength,
      this.stdLogSequenceLength,
    );
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

    console.log(`Instantiating sequence ${n} with length ${sequenceLength} 
            for user ${user} with session transition probability ${sessionTransitionProbability.toFixed(2)}`);
    return {
      sequenceLength,
      sessionTransitionProbability,
      sequenceMetadata,
    };
  }
  public startNewSession(
    rng: seedrandom.PRNG,
    templates: IQuerySequenceElementTemplate[],
    nSessions: number,
    templateCounts: Record<string, number>, // Add this parameter!
  ): IQuerySession {
    
    // Calculate raw weights penalized by how often the template was used
    let totalWeight = 0;
    const rawWeights = templates.map(t => {
      const currentCount = templateCounts[t.name] || 0;
      const weight = 1.0 / (currentCount*2 + 1);
      totalWeight += weight;
      return { entity: t, weight };
    });

    // Normalize into valid probabilities and sample
    const startQuery = sampleProbability(rng, rawWeights.map(rw => ({
      entity: rw.entity,
      probability: rw.weight / totalWeight,
    })));

    const newSession = {
      sessionId: nSessions,
      templates: [ startQuery ],
      task: startQuery.task,
      sessionLength: logNormalRoundedUp(
        rng,
        this.meanLogSessionLength,
        this.stdLogSessionLength,
      ),
      ended: false,
    };
    return newSession;
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
  ): Promise<SelectQuery> {
    let instantiateRefinementPattern = false;
    if (rng() < this.refinementPatternProbability) {
      instantiateRefinementPattern = true;
    }
    // Last ast is only defined if a previous query has been instantiated in the query
    // thus this can serve as starting point to determine next instantiation
    let nextInstantiators: Record<string, RDF.Term[]> = {};
    if (session.lastAst) {
      nextInstantiators = await this.determineNextInstantiator(
        session.lastAst,
        session.templates.at(-1)!.template,
        query.template,
      );
    }
    // Add template to session
    const { queries, patternMetadata, ast } = query.template.instantiate(
      templateCounts[query.name],
      instantiateRefinementPattern,
      nextInstantiators,
      user,
    );
    sequence.push(...queries);
    session.templates.push(query);
    session.lastAst = ast;

    // Update template counts
    templateCounts[query.name] += 1;
    // Close session if it is full
    if (session.templates.length >= session.sessionLength) {
      session.ended = true;
    }
    for (const metadata of patternMetadata) {
      sequenceMetadata.sequenceElements.push({
        session: {
          task: session.task,
          sessionLength: session.sessionLength,
          sessionId: session.sessionId,
        },
        template: query.name,
        nOpenSessions: sequenceSessions.filter(x => !x.ended).length,
        refinementMetadata: metadata,
      });
    }

    // Return the last template in the session
    return ast;
  }

  public async generateSequence(
    rng: seedrandom.PRNG,
    providers: QuerySequenceTemplateProvider[],
    templateCounts: Record<string,number>,
    // Templates: QuerySequenceTemplate[],
    user: string,
    n: number,
  ) {
    // Ensure QLever has finished setting up before generating the sequence
    await this.findNextInstantiationValue.getQLeverReadyStatus();

    const {
      sequenceLength,
      sessionTransitionProbability,
      sequenceMetadata,
    } = this.initSequence(rng, user, n);

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

    const createAndRegisterNewSession = async() => {
      const session = this.startNewSession(rng, templates, sequenceSessions.length, templateCounts);
      sequenceSessions.push(session);
      // Add query to the sequence and sessions and return the ast of the last query.
      const ast = await this.addTemplateToSequence(
        rng,
        session.templates[0],
        session,
        sequenceSessions,
        querySequence,
        user,
        templateCounts,
        sequenceMetadata,
      );
      return { session, ast };
    };

    let { session: currentSession, ast: lastAst } = await createAndRegisterNewSession();

    for (let i = 0; i < sequenceLength - 1; i++) {
      // Random chance of switching session
      const shouldSwitch = sampleHit(rng, sessionTransitionProbability);
      const openExtraSessions = sequenceSessions.filter(s => !s.ended && s !== currentSession);

      if (shouldSwitch || currentSession.ended) {
        if (openExtraSessions.length > 1 && sampleHit(rng, 0.5)) {
          // Switch to an existing open session
          currentSession = sampleRandom(rng, openExtraSessions);
        } else {
          // Start a new session
          ({ session: currentSession, ast: lastAst } = await createAndRegisterNewSession());
          continue;
        }
      }

      const lastElement = currentSession.templates.at(-1)!;
      const nextOptions = lastElement.nextFilePaths;

      if (nextOptions.length === 0) {
        currentSession.ended = true;
        ({ session: currentSession, ast: lastAst } = await createAndRegisterNewSession());
        continue;
      }

      // Weight according to the number of occurrences already in previous sequences
      // to ensure all queries are represented
      let totalWeight = 0;
      const rawWeights = nextOptions.map(t => {
        const currentCount = templateCounts[t.template] || 0;
        const weight = t.probability! / (currentCount*2 + 1);
        totalWeight += weight;
        return { entity: t, weight };
      });

      const choice = sampleProbability(rng, rawWeights.map(rw => ({
        entity: rw.entity,
        probability: rw.weight / totalWeight,
      })));
      // const choice = sampleProbability(rng, nextOptions.map(t => ({
      //   entity: t,
      //   probability: t.probability!,
      // })));

      const nextQuery = templates.find(t => t.name === choice.template);
      if (!nextQuery) {
        throw new Error(`Template not found: ${choice.template}`);
      }

      lastAst = await this.addTemplateToSequence(
        rng,
        nextQuery,
        currentSession,
        sequenceSessions,
        querySequence,
        user,
        templateCounts,
        sequenceMetadata,
      );
    }
    for (const template of templates) {
      sequenceMetadata.sequenceInstantiationCounts[template.name] =
        template.template.getInstantiationCounts();
    }
    return { querySequence, sequenceMetadata };
  }

  public async determineNextInstantiator(
    ast: SelectQuery,
    lastTemplate: QuerySequenceTemplate,
    nextTemplate: QuerySequenceTemplate,
  ): Promise<Record<string, RDF.Term[]>> {
    // Determine what query output variables should be used as possible values for instantiation
    // of the next template
    const mapping: Record<string, string[]> = this.mapOutputVariablesToInstatiationVariables(
      lastTemplate,
      nextTemplate,
    );
    return await this.findNextInstantiationValue.getNextQueryInstantiationValues(ast, mapping);
  }

  private mapOutputVariablesToInstatiationVariables(
    lastTemplate: QuerySequenceTemplate,
    nextTemplate: QuerySequenceTemplate,
  ) {
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
  // Private validateNoDangling(){
  //     const instantiatorTypes: Set<string> = new Set();
  //     const outputTypes: Set<string> = new Set();

  //     for (const template of this.templates){
  //         [...Object.values(template.instantiationVariableToType)].forEach(
  //             (type) => instantiatorTypes.add(type)
  //         );
  //         [...Object.values(template.outputPossibleInstantiationValue)].forEach(
  //             (type) => outputTypes.add(type)
  //         );
  //     }

  //     if (instantiatorTypes.size !== outputTypes.size){
  //         throw new Error(`Found differing number of instantiator and output types.`)
  //     }
  // }
}

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

export interface IProbabilities<T> {
  entity: T;
  probability: number;
}

export interface IQuerySession extends IQuerySessionMetadata {
  templates: IQuerySequenceElementTemplate[];
  ended: boolean;
  lastAst?: SelectQuery;
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
