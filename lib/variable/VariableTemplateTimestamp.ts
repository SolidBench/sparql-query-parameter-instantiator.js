import type * as RDF from '@rdfjs/types';
import type { ISubstitutionProvider } from '../substitution/ISubstitutionProvider';
import type { IValueTransformer } from '../valuetransformer/IValueTransformer';
import { VariableTemplateAdapter } from './VariableTemplateAdapter';

/**
 * A template for instantiating RDF xsd:dateTime Literals from a variable value that represents a UNIX timestamp.
 */
export class VariableTemplateTimestamp extends VariableTemplateAdapter {
  private readonly datatype: RDF.NamedNode;

  public constructor(
    name: string,
    substitutionProvider: ISubstitutionProvider,
    valueTransformers?: IValueTransformer[],
    datatype = 'http://www.w3.org/2001/XMLSchema#dateTime',
  ) {
    super(name, substitutionProvider, valueTransformers);
    this.datatype = this.DF.namedNode(datatype);
  }

  public createTermInner(value: string): RDF.Term {
    return this.DF.literal(new Date(Number.parseInt(value, 10)).toISOString(), this.datatype);
  }
}
