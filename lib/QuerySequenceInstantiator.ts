import { QuerySequenceTemplateProvider } from './QuerySequenceTemplateProvider';
import type { QueryTemplateProvider } from './QueryTemplateProvider';
import * as seedrandom from 'seedrandom';

/**
 * Instantiates query providers a number of times.
 */
export class QuerySequenceInstantiator {
  private readonly providers: QuerySequenceTemplateProvider[];
  private readonly count: number;
  private readonly rngSeeded: seedrandom.PRNG;
  private readonly meanSequenceLength: number;
  private readonly stdSequenceLength: number;

  public constructor(providers: QuerySequenceTemplateProvider[], count: number, 
    seed: number, meanSequenceLength: number, stdSequenceLength: number) {
    this.providers = providers;
    this.count = count;
    this.rngSeeded = seedrandom(String(seed));
    this.meanSequenceLength = meanSequenceLength;
    this.stdSequenceLength = stdSequenceLength;
  }

  protected async instantiateProvider(provider: QuerySequenceTemplateProvider): Promise<void> {
    console.log(provider)
    const template = await provider.createTemplate();

    // Create queries files
    const queries = [];
    for (let i = 0; i < this.count; i++) {
      queries.push(template.instantiate(i));
    }
    const queriesFile = queries.join('\n\n');

    await provider.saveQueriesFile(queriesFile);
  }

  protected async instantiateProviderInSequence(provider: QuerySequenceTemplateProvider): Promise<string> {
    return "BOOP"
  }

  public async instantiateProviderSequence(){
    const sequenceLength = this.gaussianRandom(
      this.meanSequenceLength, this.stdSequenceLength
    );
    const queryTasks = [...new Set(this.providers.map(x=>x.queryTask))];
    const taskToProvider = Object.fromEntries(
      queryTasks.map(task => [task, this.providers.filter(p => p.queryTask === task)])
    );
    const templateNames: string[] = [];
    const patternOccurences: string[] = [];
    const templateCounts: Record<string, number> = Object.fromEntries(
      this.providers.map(x=>[x.templateFilePath, 0])
    )
    let currentQueryTail = this.sampleRandom(taskToProvider[this.sampleRandom(queryTasks)]);
    // TODO: Instantiate this provider. This requires a new Variable substitution type which can select randomly
    // from a list of possible values AND has probabilities attached to it
    const querySequence = [currentQueryTail]
    for (let i = 0; i < sequenceLength - 1; i++){
      const nextTemplateFilePaths = currentQueryTail.getNextTemplatePath();
      const nextProviders = this.providers.filter(x => nextTemplateFilePaths.has(x.templateFilePath));
      currentQueryTail = this.sampleRandom(nextProviders);
      querySequence.push(currentQueryTail);
      templateNames.push(currentQueryTail.templateFilePath);
    }
  }

  /**
   * In this step we instantiate sequences. We must pass the appropriate parameters for sequence
   * length and the appropriate parameters for logical sessions in query sequences.
   */
  public async instantiate(): Promise<void> {
    await Promise.all(this.providers.map(provider => this.instantiateProvider(provider)));
  }

  public gaussianRandom(mean=0, stdev=1) {
    const u = 1 - this.rngSeeded(); // Converting [0,1) to (0,1]
    const v = this.rngSeeded();
    const z = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    // Transform to the desired mean and standard deviation:
    return z * stdev + mean;
  }

  public sampleRandom<A>(array: A[]): A{
    return array[Math.floor(this.rngSeeded() * array.length)];
  }
}
