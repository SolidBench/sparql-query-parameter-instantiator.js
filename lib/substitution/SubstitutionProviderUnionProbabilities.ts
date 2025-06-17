import type { RawTerm } from '../variable/IVariableTemplate';
import type { ISubstitutionProvider, ISubstitutionProviderProbabilities } from './ISubstitutionProvider';
import { SubstitutionProviderUnion } from './SubstitutionProviderUnion';

/**
 * A substitution provider that takes the union over the values of the given substitution provider.
 */
export class SubstitutionProviderUnionProbabilities extends SubstitutionProviderUnion implements ISubstitutionProviderProbabilities {
  protected readonly substitutionProviders: ISubstitutionProviderProbabilities[];
  /**
   * @param substitutionProviders The substitution provider to union over.
   */
  public constructor(substitutionProviders: ISubstitutionProviderProbabilities[]) {
    super(substitutionProviders);
    this.substitutionProviders = substitutionProviders;
  }

  public async getValues(): Promise<RawTerm[]> {
    return (await Promise.all(this.substitutionProviders
      .map(substitutionProvider => substitutionProvider.getValues()))).flat();
  }

  public async getValuesProbabilities(): Promise<Record<string, Record<string, number>[]>> {
    const results: Record<string, Record<string, number>[]> = {};
    for (const substitutionProvider of this.substitutionProviders) {
        const probabilities = await substitutionProvider.getValuesProbabilities();
        for (const [user, similarities] of Object.entries(probabilities)) {
          if (!(user in results)) {
            results[user] = [];
          }
          results[user].push(...similarities);
        }
    }
    for (const user of Object.keys(results)) {
      results[user].sort((a, b) => b.similarity - a.similarity);
    }
    return results;
  }
}
