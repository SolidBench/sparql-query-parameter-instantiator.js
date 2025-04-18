import type * as RDF from '@rdfjs/types';
import type { ISubstitutionProvider } from '../substitution/ISubstitutionProvider';
import type { IValueTransformer } from '../valuetransformer/IValueTransformer';
import type { IVariableTemplate, RawTerm } from './IVariableTemplate';
import { VariableTemplateAdapter } from './VariableTemplateAdapter';

/**
 * A template for instantiating arrays as RDF Literals concatenated by a given separator.
 * An inner variable template must be passed, which will be invoked for every array value.
 */
export class VariableTemplateList extends VariableTemplateAdapter {
  public constructor(
    name: string,
    public readonly separator: string,
    public readonly innerTemplate: IVariableTemplate,
    substitutionProvider?: ISubstitutionProvider,
    valueTransformers?: IValueTransformer[],
  ) {
    super(name, substitutionProvider, valueTransformers);
  }

  public createTermInner(value: RawTerm): RDF.Term {
    if (!Array.isArray(value)) {
      // eslint-disable-next-line unicorn/prefer-type-error
      throw new Error(`Received unsupported non-array value for the VariableTemplateList for ${this.name}`);
    }
    return this.DF.literal(
      value
        .map(val => this.innerTemplate.createTerm(val).value)
        .join(this.separator),
    );
  }
}
