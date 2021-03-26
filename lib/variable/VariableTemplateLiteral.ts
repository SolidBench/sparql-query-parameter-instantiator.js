import type * as RDF from 'rdf-js';
import type { ISubstitutionProvider } from '../substitution/ISubstitutionProvider';
import { VariableTemplateAdapter } from './VariableTemplateAdapter';

/**
 * A template for instantiating RDF Literals from a variable value.
 */
export class VariableTemplateLiteral extends VariableTemplateAdapter {
  private readonly language?: string;
  private readonly datatype?: RDF.NamedNode;

  public constructor(name: string, substitutionProvider: ISubstitutionProvider, language?: string, datatype?: string) {
    super(name, substitutionProvider);
    this.language = language;
    this.datatype = datatype ? this.DF.namedNode(datatype) : undefined;
  }

  public createTerm(value: string): RDF.Term {
    return this.DF.literal(value, this.language || this.datatype);
  }
}
