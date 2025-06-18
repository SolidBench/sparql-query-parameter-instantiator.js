import * as fs from 'node:fs';
import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type { IValueTransformer } from './IValueTransformer';

const DF = new DataFactory();

/**
 * Replaces parts of an IRI.
 */
export class ValueTransformerCsvMap implements IValueTransformer {
  private readonly file: string;
  private readonly mapping: Record<string, string>;

  public constructor(file: string) {
    this.file = file;
    this.mapping = this.readMapping();
  }

  public readMapping(): Record<string, string> {
    const mapping: Record<string, string> = {};
    const content = fs.readFileSync(this.file, 'utf-8').trim();
    const lines = content.split('\n');
    for (const line of lines) {
      const [ key, value ] = line.split(',');
      if (key && value) {
        mapping[key.trim()] = value.trim();
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
