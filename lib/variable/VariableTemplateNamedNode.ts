import type * as RDF from '@rdfjs/types';
import type { ISubstitutionProvider } from '../substitution/ISubstitutionProvider';
import type { IValueTransformer } from '../valuetransformer/IValueTransformer';
import type { RawTerm } from './IVariableTemplate';
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

  public createTermInner(value: RawTerm): RDF.Term {
    if (Array.isArray(value)) {
      throw new Error(`Received unsupported array value for the VariableTemplateNamedNode for ${this.name}`);
    }
    return this.DF.namedNode(`${value}`);
  }
}
