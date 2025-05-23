import * as fs from 'node:fs';
import { SubstitutionProviderCsv } from './SubstitutionProviderCsv';
import seedrandom = require('seedrandom');
const csvParser = require('csv-parser');
/**
 * A subsitution provider for CSV files that randomly selects elements. 
 * Used for generating sequences with a given set of possible entities, as the sequence
 * template provider will repeatedly loop over all possible substitutions to generate values for
 * template variables.
 */
export class SubstitutionProviderCsvTruncated extends SubstitutionProviderCsv {
  private readonly maxEntities: number;
  private readonly rng: seedrandom.PRNG;

  public constructor(csvFilePath: string, columnName: string, 
    maxEntities: number, seed: number, separator = ',',
  ) {
    super(csvFilePath, columnName, separator);
    this.maxEntities = maxEntities;
    this.rng = seedrandom(String(seed));
  }

  public getValues(): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        super.getValues().then(results => {
            return this.getRandomSample(results, this.maxEntities);
        })
    })
  }
  public getRandomSample<T>(array: T[], n: number): T[] {
    if (n > array.length){
        return array;
    }
    const copy = [...array];
    const result: T[] = [];

    // Fisher-Yates Shuffle up to n items
    for (let i = copy.length - 1; i > copy.length - 1 - n; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
        result.push(copy[i]);
    }
    return result;
    }
}
