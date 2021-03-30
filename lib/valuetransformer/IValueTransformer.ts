import type * as RDF from 'rdf-js';

/**
 * Transforms an RDF term to another RDF term.
 */
export interface IValueTransformer {
  transform: (value: RDF.Term) => RDF.Term;
}
