import type * as RDF from 'rdf-js';
import type { ISubstitutionProvider } from '../substitution/ISubstitutionProvider';

/**
 * A template for instantiating RDF terms from a variable value.
 */
export interface IVariableTemplate {
  getName: () => string;
  getSubstitutionProvider: () => ISubstitutionProvider;
  createTerm: (value: string) => RDF.Term;
}
