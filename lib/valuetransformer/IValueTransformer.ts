import type * as RDF from '@rdfjs/types';

/**
 * Transforms an RDF term to another RDF term.
 */
export interface IValueTransformer {
  transform: (value: RDF.Term) => RDF.Term;
}
