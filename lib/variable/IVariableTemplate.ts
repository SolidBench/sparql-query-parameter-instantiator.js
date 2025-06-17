import type * as RDF from '@rdfjs/types';
import type { ISubstitutionProvider, ISubstitutionProviderProbabilities } from '../substitution/ISubstitutionProvider';

/**
 * A template for instantiating RDF terms from a variable value.
 */
export interface IVariableTemplate {
  getName: () => string;
  getSubstitutionProvider: () => ISubstitutionProvider | ISubstitutionProviderProbabilities | undefined;
  createTerm: (value: RawTerm) => RDF.Term;
}

export type RawTerm = string | number | RawTerm[];
