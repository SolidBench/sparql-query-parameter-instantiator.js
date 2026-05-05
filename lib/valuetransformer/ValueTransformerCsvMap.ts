import * as fs from 'node:fs';
import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type { IValueTransformer } from './IValueTransformer';
import { parse } from 'csv-parse/sync';

const DF = new DataFactory();

/**
 * Replaces parts of an IRI.
 */
export class ValueTransformerCsvMap implements IValueTransformer {
  private readonly file: string;
  private readonly mapping: Record<string, string>;
  private readonly invertMapping?: boolean;

  public constructor(file: string, invertMapping?: boolean) {
    this.file = file;
    this.invertMapping = invertMapping;
    this.mapping = this.readMapping();
  }

public readMapping(): Record<string, string> {
    const mapping: Record<string, string> = {};
    
    // eslint-disable-next-line no-sync
    const content = fs.readFileSync(this.file, 'utf-8');
    
    const records = parse(content, {
      skip_empty_lines: true,
      trim: true,
    });

    for (const record of records) {
      if (record.length >= 2) {
        const key = record[0];
        const value = record[1];
        
        if (key && value) {
          if (this.invertMapping) {
            mapping[value] = key;
          } else {
            mapping[key] = value;
          }
        }
      }
    }
    
    return mapping;
  }

  public transform(term: RDF.Term): RDF.Term {
    if (term.termType === 'NamedNode' && this.mapping[term.value]) {
      const value = this.mapping[term.value];
      return DF.namedNode(value);
    }
    return term;
  }
}
