import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type { IValueTransformer } from './IValueTransformer';

const DF = new DataFactory();

/**
 * Replaces parts of an IRI. Optionally you can choose to replace all occurrences
 * of the searchRegex with the replacement string.
 */
export class ValueTransformerReplaceIri implements IValueTransformer {
  private readonly search: RegExp;
  private readonly replacement: string;

  public constructor(searchRegex: string, replacementString: string, replaceAll = false) {
    this.search = new RegExp(searchRegex, 'u');
    if (replaceAll){
        this.search = new RegExp(searchRegex, 'gu')
    }
    this.replacement = replacementString;
  }

  public transform(term: RDF.Term): RDF.Term {
    if (term.termType === 'NamedNode') {
      const value = term.value.replace(this.search, this.replacement);
      return DF.namedNode(value);
    }
    return term;
  }
}