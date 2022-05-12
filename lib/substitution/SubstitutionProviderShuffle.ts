import type { ISubstitutionProvider } from './ISubstitutionProvider';

/**
 * A substitution provider that wraps over another substitution provider and shuffles all values based on a seed.
 */
export class SubstitutionProviderShuffle implements ISubstitutionProvider {
  private readonly substitutionProvider: ISubstitutionProvider;
  private seed: number;

  /**
   * @param substitutionProvider The substitution provider to shuffle.
   * @param seed The random seed for shuffling.
   */
  public constructor(substitutionProvider: ISubstitutionProvider, seed: number) {
    this.substitutionProvider = substitutionProvider;
    this.seed = seed;
  }

  public async getValues(): Promise<string[]> {
    return this.shuffle(await this.substitutionProvider.getValues());
  }

  protected nextRandom(): number {
    const x = Math.sin(this.seed++) * 10_000;
    return x - Math.floor(x);
  }

  protected shuffle(array: string[]): string[] {
    let currentIndex: number = array.length;
    let randomIndex;

    // While there remain elements to shuffle.
    while (currentIndex !== 0) {
      // Pick a remaining element.
      randomIndex = Math.floor(this.nextRandom() * currentIndex);
      currentIndex--;

      // And swap it with the current element.
      [ array[currentIndex], array[randomIndex] ] = [ array[randomIndex], array[currentIndex] ];
    }

    return array;
  }
}
