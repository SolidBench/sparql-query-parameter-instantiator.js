import * as fs from 'node:fs';
import type { ISubstitutionProvider } from './ISubstitutionProvider';

// eslint-disable-next-line ts/no-require-imports, ts/no-var-requires
const csvParser = require('csv-parser');

/**
 * A subsitution provider for CSV files.
 */
export class SubstitutionProviderCsv implements ISubstitutionProvider {
  private readonly csvFilePath: string;
  private readonly columnName: string;
  private readonly separator: string;
  private readonly uniqueValues: boolean;

  public constructor(csvFilePath: string, columnName: string, separator = ',', uniqueValues = false) {
    this.csvFilePath = csvFilePath;
    this.columnName = columnName;
    this.separator = separator;
    this.uniqueValues = uniqueValues;
  }

  public getValues(): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      const results: string[] = [];
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
        .on('end', () => {
          if (this.uniqueValues) {
            resolve([ ...new Set(results) ]);
          }
          resolve(results);
        });
    });
  }
}
