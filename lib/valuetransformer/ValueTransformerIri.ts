import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type { IValueTransformer } from './IValueTransformer';

const DF = new DataFactory();

/**
 * A value transformer that that replaces (parts of) IRIs,
 * deterministically distributing the replacements over a list of multiple destination IRI, based on a matched number.
 *
 * This requires at least one group-based replacement, of which the first group must match a number.
 *
 * The matched number is used to choose one of the `replacementStrings` in a deterministic way:
 *    replacementStrings[number % replacementStrings.length]
 * This is the same as QuadTransformerDistributeIri and is thus compatible with it.
 */
export class ValueTransformerIri implements IValueTransformer {
  private readonly search: RegExp;
  private readonly replacement: string;

  public constructor(searchRegex: string, replacementString: string) {
    this.search = new RegExp(searchRegex, 'gu');
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
