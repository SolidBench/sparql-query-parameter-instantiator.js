import * as fs from 'node:fs';
import * as path from 'node:path';

// eslint-disable-next-line ts/no-require-imports
import seedrandom = require('seedrandom');
import type { Logger } from 'winston';
import { logger } from './logging/logger';
import type { QuerySequenceTemplateProvider } from './QuerySequenceTemplateProvider';
import type { IQuerySequenceMetadata, SequenceGenerator } from './sequence/SequenceGenerator';
import type { IVariableTemplate, RawTerm } from './variable/IVariableTemplate';

/**
 * Instantiates query providers a number of times.
 */
export class QuerySequenceInstantiator {
  private readonly providers: QuerySequenceTemplateProvider[];
  private readonly personProvider: IVariableTemplate;

  private readonly count: number;
  private readonly rngSeeded: seedrandom.PRNG;

  private readonly sequenceGenerator: SequenceGenerator;

  private readonly destinationFilePath: string;
  private readonly metadataDestinationFilePath: string;

  private readonly templateCounts: Record<string, number>;

  private readonly log: Logger;

  public constructor(args: IQuerySequenceInstantiatorArgs) {
    this.providers = args.providers;
    this.personProvider = args.personProvider;

    this.count = args.count;
    this.rngSeeded = seedrandom(String(args.seed));

    this.sequenceGenerator = args.sequenceGenerator;

    this.destinationFilePath = args.destinationFilePath;
    this.metadataDestinationFilePath = args.metadataDestinationFilePath ?? this.destinationFilePath;
    this.templateCounts = Object.fromEntries(this.providers.map(p => [ p.getTemplateName(), 0 ]));

    this.log = logger.child({ module: 'QuerySequenceInstantiator' });
  }

  public async instantiateProviderSequence(n: number, user: string): Promise<void> {
    this.log.info('Current template counts in all generated sequences', { templateCounts: this.templateCounts });
    const { querySequence, sequenceMetadata } =
      await this.sequenceGenerator.generateSequence(
        this.rngSeeded,
        this.providers,
        this.templateCounts,
        user,
        n,
      );
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

  public async getPeople(): Promise<RawTerm[]> {
    const peopleSubProvider = this.personProvider.getSubstitutionProvider();
    if (!peopleSubProvider) {
      throw new Error(`No substitution provider defined for people provider in ${this.constructor.name}`);
    }
    return peopleSubProvider.getValues();
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
   * The sequence generator with the generation logic
   */
  sequenceGenerator: SequenceGenerator;
  /**
   * @param destinationFilePath - Path to write output
   */
  destinationFilePath: string;
  /**
   * @param metadataDestinationFilePath - Path to write metadata output
   */
  metadataDestinationFilePath?: string;
}
