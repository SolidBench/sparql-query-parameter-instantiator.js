import type * as RDF from '@rdfjs/types';
import type { ISubstitutionProvider } from '../substitution/ISubstitutionProvider';
import type { IVariableTemplate, RawTerm } from './IVariableTemplate';

/**
 * A template for wrapper another template and optionally overriding the substitution provider.
 */
export class VariableTemplateWrapper implements IVariableTemplate {
  public constructor(
    public readonly variableTemplate: IVariableTemplate,
    public readonly substitutionProvider?: ISubstitutionProvider,
  ) {}

  public createTerm(value: RawTerm): RDF.Term {
    return this.variableTemplate.createTerm(value);
  }

  public getName(): string {
    return this.variableTemplate.getName();
  }

  public getSubstitutionProvider(): ISubstitutionProvider | undefined {
    return this.substitutionProvider || this.variableTemplate.getSubstitutionProvider();
  }
}
