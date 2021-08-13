import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type { IValueTransformer } from './IValueTransformer';

const DF = new DataFactory();

/**
 * Replaces parts of an IRI.
 */
export class ValueTransformerReplaceIri implements IValueTransformer {
  private readonly search: RegExp;
  private readonly replacement: string;

  public constructor(searchRegex: string, replacementString: string) {
    this.search = new RegExp(searchRegex, 'u');
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
