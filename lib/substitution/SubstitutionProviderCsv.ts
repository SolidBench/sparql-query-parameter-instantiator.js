import * as fs from 'node:fs';
import type { ISubstitutionProvider } from './ISubstitutionProvider';

// eslint-disable-next-line ts/no-require-imports,ts/no-var-requires
const csvParser = require('csv-parser');

/**
 * A subsitution provider for CSV files.
 */
export class SubstitutionProviderCsv implements ISubstitutionProvider {
  private readonly csvFilePath: string;
  private readonly columnName: string;
  private readonly separator: string;

  public constructor(csvFilePath: string, columnName: string, separator = ',') {
    this.csvFilePath = csvFilePath;
    this.columnName = columnName;
    this.separator = separator;
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
        .on('end', () => resolve(results));
    });
  }
}
