import type * as RDF from 'rdf-js';
import type { ISubstitutionProvider } from '../substitution/ISubstitutionProvider';
import { VariableTemplateAdapter } from './VariableTemplateAdapter';

/**
 * A template for instantiating RDF Named Nodes from a variable value.
 */
export class VariableTemplateNamedNode extends VariableTemplateAdapter {
  public constructor(name: string, substitutionProvider: ISubstitutionProvider) {
    super(name, substitutionProvider);
  }

  public createTerm(value: string): RDF.Term {
    return this.DF.namedNode(value);
  }
}
