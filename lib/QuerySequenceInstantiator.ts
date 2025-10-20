import * as fs from 'node:fs';
import * as path from 'node:path';
import * as seedrandom from 'seedrandom';
import type { QuerySequenceTemplate } from './QuerySequenceTemplate';
import type { INextTemplate, QuerySequenceTemplateProvider } from './QuerySequenceTemplateProvider';
import type { IVariableTemplate, RawTerm } from './variable/IVariableTemplate';

/**
 * Instantiates query providers a number of times.
 */
export class QuerySequenceInstantiator {
  private readonly providers: QuerySequenceTemplateProvider[];
  private readonly personProvider: IVariableTemplate;
  
  private readonly count: number;
  private readonly rngSeeded: seedrandom.PRNG;

  private readonly meanLogSequenceLength: number;
  private readonly stdLogSequenceLength: number;

  private readonly meanLogSessionLength: number;
  private readonly stdLogSessionLength: number;

  private readonly meanLogTransitionProbability: number;
  private readonly stdLogTransitionProbability: number;

  private readonly refinementPatternProbability: number;

  private readonly temperature: number;

  private readonly destinationFilePath: string;
  private readonly metadataDestinationFilePath: string;

  public constructor(args: IQuerySequenceInstantiatorArgs) {
    this.providers = args.providers;
    this.personProvider = args.personProvider;
    this.temperature = args.temperature;
    this.count = args.count;
    this.rngSeeded = seedrandom(String(args.seed));

    // The mean and standard deviation of the distribution determining the simulated sequence length
    this.meanLogSequenceLength = args.meanLogSequenceLength;
    this.stdLogSequenceLength = args.stdLogSequenceLength;
    console.log(`Expected sequence length: ${
      this.calculateExpectedMeanLogNormal(this.meanLogSequenceLength, this.stdLogSequenceLength)
    }`);
    // The mean and std of the distribution determining the simulated session length within sequences
    this.meanLogSessionLength = args.meanLogSessionLength;
    this.stdLogSessionLength = args.stdLogSessionLength;
    console.log(`Expected session length: ${
      this.calculateExpectedMeanLogNormal(this.meanLogSessionLength, this.stdLogSessionLength)
    }`);
    // The mean and std of the distribution determining the simulated probability of switching between
    // sessions within a sequence
    this.meanLogTransitionProbability = args.meanLogTransitionProbability;
    this.stdLogTransitionProbability = args.stdLogTransitionProbability;
    console.log(`Expected transition probability: ${
      this.calculateExpectedMeanLogNormal(
        this.meanLogTransitionProbability,
        this.stdLogTransitionProbability,
      )}`);
    this.refinementPatternProbability = args.refinementPatternProbability;
    this.destinationFilePath = args.destinationFilePath;
    this.metadataDestinationFilePath = args.metadataDestinationFilePath || this.destinationFilePath;
  }

  public async instantiateProviderSequence(n: number, user: string): Promise<void> {
    const sequenceLength = this.logNormalRoundedUp(
      this.meanLogSequenceLength,
      this.stdLogSequenceLength,
    );
    const sessionTransitionProbability = this.logNormal(
      this.meanLogTransitionProbability,
      this.stdLogTransitionProbability,
    );
    const sequenceSessions: IQuerySession[] = [];
    const sequenceMetadata: IQuerySequenceMetadata = {
      user: { user, transitionProbability: sessionTransitionProbability },
      sequenceElements: [],
      sequenceLength,
    };

    console.log(`Instantiating sequence ${n} with length ${sequenceLength} 
      for user ${user} with session transition probability ${sessionTransitionProbability.toFixed(2)}`);

    const queryTasks = [ ...new Set(this.providers.map(x => x.queryTask)) ];
    const templates: IQuerySequenceElementTemplate[] = await Promise.all(
      this.providers.map(async provider => ({
        task: provider.queryTask,
        name: provider.getTemplateName(),
        nextFilePaths: provider.getNextTemplateName(),
        template: await provider.createTemplate(this.rngSeeded, this.temperature),
      })),
    );

    const taskToTemplate = Object.fromEntries(
      templates.map(template => [ template.task, templates.filter(p => p.task === template.task) ]),
    );
    const templateCounts: Record<string, number> = Object.fromEntries(
      this.providers.map(x => [ x.getTemplateName(), 0 ]),
    );
    let currentSession = this.startNewSession(taskToTemplate, queryTasks, sequenceSessions.length);
    sequenceSessions.push(currentSession);

    const startQuery = currentSession.templates.at(-1)!;

    // For the first query do it manually (not with function). Don't remember why but I don't want to touch it
    const instantiateOutput = startQuery.template.instantiate(templateCounts[startQuery.name], false, user);
    const querySequence = [ ...instantiateOutput.queries ];
    for (const metadata of instantiateOutput.patternMetadata) {
      sequenceMetadata.sequenceElements.push({
        session: {
          task: currentSession.task,
          sessionLength: currentSession.sessionLength,
          sessionId: currentSession.sessionId,
        },
        template: startQuery.name,
        nOpenSessions: sequenceSessions.filter(x => !x.ended).length,
        refinementMetadata: metadata,
      });
    }

    for (let i = 0; i < sequenceLength - 1; i++) {
      // Sample whether to continue the current session or start a new one
      const switchSession = this.sampleHit(sessionTransitionProbability * 2);
      if (switchSession || currentSession.ended) {
        const openExtraSessions = sequenceSessions.filter(x => !x.ended).filter(x => x !== currentSession);
        if (this.sampleHit(0.5) || openExtraSessions.length <= 1) {
          // Start a new session
          currentSession = this.startNewSession(taskToTemplate, queryTasks, sequenceSessions.length);
          sequenceSessions.push(currentSession);
          this.addTemplateToSequence(
            currentSession.templates[0],
            currentSession,
            sequenceSessions,
            querySequence,
            user,
            templateCounts,
            sequenceMetadata,
          );
          // At start of new session we already added template to sequence, so we can skip adding it again
          continue;
        } else {
          currentSession = this.sampleRandom(openExtraSessions);
        }
      }

      // Determine the possible next templates from current sequence tail
      const nextTemplateFilePaths = currentSession.templates.at(-1)!.nextFilePaths;

      // Terminal query, no next templates defined
      if (nextTemplateFilePaths.length === 0) {
        currentSession.ended = true;
        // If no next templates are defined, we end the session and continue with the next one.
        currentSession = this.startNewSession(taskToTemplate, queryTasks, sequenceSessions.length);
        sequenceSessions.push(currentSession);
        this.addTemplateToSequence(
          currentSession.templates[0],
          currentSession,
          sequenceSessions,
          querySequence,
          user,
          templateCounts,
          sequenceMetadata,
        );
        // At start of new session we already added template to sequence, so we can skip adding it again
        continue;
      }

      // Next templateFilePath with attached probability
      const nextTemplatesWithProbability: IProbabilities<INextTemplate>[] = 
        nextTemplateFilePaths.map(t => ({entity: t, probability: t.probability!}));
      const nextQueryFilePath = this.sampleProbability(nextTemplatesWithProbability);

      const nextQuery = templates.find(template => template.name === nextQueryFilePath.template);
      if (nextQuery === undefined){
        throw new Error(`No matching template found for nextTemplateFilePath: ${nextQueryFilePath.template}`);
      }

      this.addTemplateToSequence(
        nextQuery,
        currentSession,
        sequenceSessions,
        querySequence,
        user,
        templateCounts,
        sequenceMetadata,
      );
    }
    const sequenceFile = querySequence.join('\n\n');
    await this.saveSequenceToFile(`sequence_${n}.sparql`, sequenceFile);
    await this.saveMetadataToFile(`sequence_${n}.metadata.json`, sequenceMetadata);
  }

  /**
   * In this step we instantiate sequences. We must pass the appropriate parameters for sequence
   * length and the appropriate parameters for logical sessions in query sequences.
   */
  public async instantiate(): Promise<void> {
    const people = await this.getPeople();
    for (let i = 0; i < this.count; i++) {
      await this.instantiateProviderSequence(i, <string>people[i]);
    }
  }

  public startNewSession(
    taskToTemplate: Record<string, IQuerySequenceElementTemplate[]>,
    queryTasks: string[],
    nSessions: number,
  ): IQuerySession {
    const startQuery = this.sampleRandom(taskToTemplate[this.sampleRandom(queryTasks)]);
    const newSession = {
      sessionId: nSessions,
      templates: [ startQuery ],
      task: startQuery.task,
      sessionLength: this.logNormalRoundedUp(
        this.meanLogSessionLength,
        this.stdLogSessionLength,
      ),
      ended: false,
    };
    return newSession;
  }

  public addTemplateToSequence(
    query: IQuerySequenceElementTemplate,
    session: IQuerySession,
    sequenceSessions: IQuerySession[],
    sequence: string[],
    user: string,
    templateCounts: Record<string, number>,
    sequenceMetadata: IQuerySequenceMetadata,
  ): IQuerySequenceElementTemplate {
    let instantiateRefinementPattern = false;
    if (this.rngSeeded() < this.refinementPatternProbability) {
      instantiateRefinementPattern = true;
    }

    // Add template to session
    const { queries, patternMetadata } = query.template.instantiate(
      templateCounts[query.name],
      instantiateRefinementPattern,
      user,
    );
    sequence.push(...queries);
    session.templates.push(query);
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
    return session.templates.at(-1)!;
  }

  public async getPeople(): Promise<RawTerm[]> {
    const peopleSubProvider = this.personProvider.getSubstitutionProvider();
    if (!peopleSubProvider) {
      throw new Error(`No substitution provider defined for people provider in ${this.constructor.name}`);
    }
    return peopleSubProvider.getValues();
  }

  public logNormalRoundedUp(mean: number, stdev: number): number {
    return Math.ceil(this.logNormal(mean, stdev));
  }

  public logNormal(mean: number, stdev: number): number {
    const z = this.gaussianRandom(mean, stdev);
    return Math.exp(z);
  }

  public calculateExpectedMeanLogNormal(mean: number, stdev: number): number {
    return Math.exp(mean + 0.5 * stdev ^ 2);
  }

  public gaussianRandom(mean: number, stdev: number): number {
    const u = 1 - this.rngSeeded();
    const v = this.rngSeeded();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return z * stdev + mean;
  }

  public sampleRandom<T>(array: T[]): T {
    return array[Math.floor(this.rngSeeded() * array.length)];
  }

  public sampleProbability<T>(probabilities: IProbabilities<T>[]): T {
    const r = this.rngSeeded();
    let cumulative = 0;

    for (const item of probabilities) {
      cumulative += item.probability;
      if (r < cumulative) {
        return item.entity;
      }
    }
    throw new Error('Failed sampling, likely due to probabilities not summing to 1.');
  }

  public sampleHit(probabilityHit: number): boolean {
    return this.rngSeeded() < probabilityHit;
  }

  public async saveSequenceToFile(sequenceFileName: string, queries: string): Promise<void> {
    await fs.promises.writeFile(
      path.join(this.destinationFilePath, sequenceFileName),
      queries,
      'utf8',
    );
  }

  public async saveMetadataToFile(
    sequenceFileName: string,
    metadata: IQuerySequenceMetadata,
  ): Promise<void> {
    await fs.promises.writeFile(
      path.join(this.metadataDestinationFilePath, sequenceFileName),
      JSON.stringify(metadata, null, 2),
      'utf8',
    );
  }
}

/**
 * Configuration for QuerySequenceInstantiator
 */
export interface IQuerySequenceInstantiatorArgs {
  /**
   * @param providers - The list of template providers
   */
  providers: QuerySequenceTemplateProvider[];
  /**
   * @param personProvider - The provider for the people who
   * generate the sequence
   */
  personProvider: IVariableTemplate;
  /**
   * @param count - Number of query sequences to generate
   */
  count: number;
  /**
   * @param seed - RNG seed
   */
  seed: number;
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
   * @param destinationFilePath - Path to write output
   */
  destinationFilePath: string;
  /**
   * @param metadataDestinationFilePath - Path to write metadata output
   */
  metadataDestinationFilePath?: string;
}

export interface IProbabilities<T> {
  entity: T;
  probability: number;
}

export interface IQuerySession extends IQuerySessionMetadata {
  templates: IQuerySequenceElementTemplate[];
  ended: boolean;
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
}

export interface IUserMetadata {
  user: string;
  transitionProbability: number;
}
