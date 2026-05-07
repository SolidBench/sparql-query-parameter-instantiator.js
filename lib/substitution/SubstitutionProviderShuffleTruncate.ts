// eslint-disable-next-line ts/no-require-imports
import seedrandom = require('seedrandom');
import type { RawTerm } from '../variable/IVariableTemplate';
import type { ISubstitutionProvider } from './ISubstitutionProvider';

/**
 * A subsitution provider that wraps another provider and provides a random sample of the possible.
 * substitution values .
 * Used for generating sequences with a given set of possible entities, as the sequence
 * template provider will repeatedly loop over all possible substitutions to generate values for
 * template variables.
 */
export class SubstitutionProviderShuffleTruncate implements ISubstitutionProvider {
  private readonly maxEntities: number;
  private readonly seed: number;
  private readonly rng: seedrandom.PRNG;
  private readonly substitutionProvider: ISubstitutionProvider;

  public constructor(substitutionProvider: ISubstitutionProvider, seed: number, maxEntities: number) {
    this.substitutionProvider = substitutionProvider;
    this.maxEntities = maxEntities;
    this.seed = seed;
    this.rng = seedrandom(String(this.seed));
  }

  public async getValues(): Promise<RawTerm[]> {
    return this.getRandomSample(await this.substitutionProvider.getValues(), this.maxEntities);
  }

  public getRandomSample<T>(array: T[], n: number): T[] {
    if (n > array.length) {
      return array;
    }
    const copy = [ ...array ];
    const result: T[] = [];

    // Fisher-Yates Shuffle up to n items
    for (let i = copy.length - 1; i > copy.length - 1 - n; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [ copy[i], copy[j] ] = [ copy[j], copy[i] ];
      result.push(copy[i]);
    }
    return result;
  }
}
