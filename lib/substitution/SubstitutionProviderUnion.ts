import type { RawTerm } from '../variable/IVariableTemplate';
import type { ISubstitutionProvider } from './ISubstitutionProvider';

/**
 * A substitution provider that takes the union over the values of the given substitution provider.
 */
export class SubstitutionProviderUnion implements ISubstitutionProvider {
  private readonly substitutionProviders: ISubstitutionProvider[];

  /**
   * @param substitutionProviders The substitution provider to union over.
   */
  public constructor(substitutionProviders: ISubstitutionProvider[]) {
    this.substitutionProviders = substitutionProviders;
  }

  public async getValues(): Promise<RawTerm[]> {
    return (await Promise.all(this.substitutionProviders
      .map(substitutionProvider => substitutionProvider.getValues()))).flat();
  }
}
