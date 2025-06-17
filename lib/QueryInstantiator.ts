import type { QueryTemplateProvider } from './QueryTemplateProvider';

/**
 * Instantiates query providers a number of times.
 */
export class QueryInstantiator {
  private readonly providers: QueryTemplateProvider[];
  private readonly count: number;

  public constructor(providers: QueryTemplateProvider[], count: number) {
    this.providers = providers;
    this.count = count;
  }

  protected async instantiateProvider(provider: QueryTemplateProvider): Promise<void> {
    const template = await provider.createTemplate();

    // Create queries files
    const queries = [];
    for (let i = 0; i < this.count; i++) {
      queries.push(template.instantiate(i));
    }
    const queriesFile = queries.join('\n\n');

    await provider.saveQueriesFile(queriesFile);
  }

  /**
   * Invoke all query providers.
   */
  public async instantiate(): Promise<void> {
    await Promise.all(this.providers.map(provider => this.instantiateProvider(provider)));
  }
}
