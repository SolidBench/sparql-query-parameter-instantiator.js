import * as fs from 'node:fs';
import type { ISubstitutionProviderProbabilities } from './ISubstitutionProvider';
const csvParser = require('csv-parser');
/**
 * A subsitution provider for CSV files.
 */
export class SubstitutionProviderCsvSimilarityBasedProbability implements ISubstitutionProviderProbabilities {
  private readonly csvFilePath: string | undefined;
  private readonly columnName: string;
  private readonly columnNameSimilaritySubject: string;

  private readonly csvFilePathSimilarities: string;
  private readonly columnNameSimilarities: string = 'similarities';
  private readonly separator: string;

  public constructor(csvFilePath: string | undefined, columnName: string, columnNameSimilaritySubject: string, csvFilePathSimilarities: string, separator = ',') {
    this.csvFilePath = csvFilePath;
    this.csvFilePathSimilarities = csvFilePathSimilarities;
    this.columnName = columnName;
    this.columnNameSimilaritySubject = columnNameSimilaritySubject;

    this.separator = separator;
  }

  public getValues(): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      const results: string[] = [];
      if (this.csvFilePath) {
        fs.createReadStream(this.csvFilePath)
          .on('error', reject)
          .pipe(csvParser({ separator: this.separator }))
          .on('error', reject)
          .on('data', (data: any) => {
            if (!(this.columnName in data)) {
              reject(new Error(`The column ${this.columnName} was not set in the CSV file ${this.csvFilePath}`));
            }
            results.push(<string>data[this.columnName]);
          })
          .on('end', () => resolve(results));
      } else {
        resolve(results);
      }
    });
  }

  public getValuesProbabilities(): Promise<Record<string, Record<string, number>[]>> {
    return new Promise<Record<string, Record<string, number>[]>>((resolve, reject) => {
      const results: Record<string, Record<string, number>[]> = {};
      fs.createReadStream(this.csvFilePathSimilarities)
        .on('error', reject)
        .pipe(csvParser({ separator: this.separator }))
        .on('error', reject)
        .on('data', (data: any) => {
          if (!(this.columnNameSimilaritySubject in data || !(this.columnNameSimilarities in data))) {
            reject(new Error(`The column ${this.columnName} or ${this.columnNameSimilarities} 
                was not set in the CSV file ${this.csvFilePathSimilarities}`));
          }
          try {
            const similarities = JSON.parse(data[this.columnNameSimilarities]);
            results[<string>data[this.columnNameSimilaritySubject]] = similarities;
          } catch {
            throw new Error('Failed');
          }
        })
        .on('end', () => resolve(results));
    });
  }
}
