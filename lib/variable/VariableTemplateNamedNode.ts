import type * as RDF from '@rdfjs/types';
import type { ISubstitutionProvider } from '../substitution/ISubstitutionProvider';
import type { IValueTransformer } from '../valuetransformer/IValueTransformer';
import { VariableTemplateAdapter } from './VariableTemplateAdapter';

/**
 * A template for instantiating RDF Named Nodes from a variable value.
 */
export class VariableTemplateNamedNode extends VariableTemplateAdapter {
  public constructor(
    name: string,
    substitutionProvider?: ISubstitutionProvider,
    valueTransformers?: IValueTransformer[],
  ) {
    super(name, substitutionProvider, valueTransformers);
  }

  public createTermInner(value: string): RDF.Term {
    return this.DF.namedNode(value);
  }
}
