import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type { IValueTransformer } from './IValueTransformer';

const DF = new DataFactory();

/**
 * Pads strings until a given length.
 */
export class ValueTransformerPad implements IValueTransformer {
  public constructor(
    private readonly paddingCharacter: string,
    private readonly paddingLength: number,
    private readonly start: boolean,
  ) {}

  public transform(term: RDF.Term): RDF.Term {
    const value = this.start ?
      term.value.padStart(this.paddingLength, this.paddingCharacter) :
      term.value.padEnd(this.paddingLength, this.paddingCharacter);
    return term.termType === 'NamedNode' ? DF.namedNode(value) : DF.literal(value);
  }
}
