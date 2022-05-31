import type * as RDF from '@rdfjs/types';
import type { ISubstitutionProvider } from '../substitution/ISubstitutionProvider';

/**
 * A template for instantiating RDF terms from a variable value.
 */
export interface IVariableTemplate {
  getName: () => string;
  getSubstitutionProvider: () => ISubstitutionProvider | undefined;
  createTerm: (value: RawTerm) => RDF.Term;
}

export type RawTerm = string | number | RawTerm[];
