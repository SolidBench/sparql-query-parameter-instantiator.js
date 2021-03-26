import type { ISubstitutionProvider } from './ISubstitutionProvider';

/**
 * A static subsitution provider.
 */
export class SubstitutionProviderStatic implements ISubstitutionProvider {
  private readonly values: string[];

  public constructor(values: string[]) {
    this.values = values;
  }

  public async getValues(): Promise<string[]> {
    return this.values;
  }
}
