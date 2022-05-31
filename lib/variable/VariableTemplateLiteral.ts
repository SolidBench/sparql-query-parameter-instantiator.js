import type * as RDF from '@rdfjs/types';
import type { ISubstitutionProvider } from '../substitution/ISubstitutionProvider';
import type { IValueTransformer } from '../valuetransformer/IValueTransformer';
import type { RawTerm } from './IVariableTemplate';
import { VariableTemplateAdapter } from './VariableTemplateAdapter';

/**
 * A template for instantiating RDF Literals from a variable value.
 */
export class VariableTemplateLiteral extends VariableTemplateAdapter {
  private readonly language?: string;
  private readonly datatype?: RDF.NamedNode;

  public constructor(
    name: string,
    substitutionProvider?: ISubstitutionProvider,
    valueTransformers?: IValueTransformer[],
    language?: string,
    datatype?: string,
  ) {
    super(name, substitutionProvider, valueTransformers);
    this.language = language;
    this.datatype = datatype ? this.DF.namedNode(datatype) : undefined;
  }

  public createTermInner(value: RawTerm): RDF.Term {
    if (Array.isArray(value)) {
      throw new Error(`Received unsupported array value for the VariableTemplateLiteral for ${this.name}`);
    }
    return this.DF.literal(`${value}`, this.language || this.datatype);
  }
}
