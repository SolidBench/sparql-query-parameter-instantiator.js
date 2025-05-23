import type * as RDF from '@rdfjs/types';
import type { ISubstitutionProvider, ISubstitutionProviderProbabilities } from '../substitution/ISubstitutionProvider';
import type { IVariableTemplate, RawTerm } from './IVariableTemplate';

/**
 * A template for wrapper another template and optionally overriding the substitution provider.
 */
export class VariableTemplateWrapper implements IVariableTemplate {
  public constructor(
    public readonly variableTemplate: IVariableTemplate,
    public readonly substitutionProvider?: ISubstitutionProvider | ISubstitutionProviderProbabilities,
  ) {}

  public createTerm(value: RawTerm): RDF.Term {
    return this.variableTemplate.createTerm(value);
  }

  public getName(): string {
    return this.variableTemplate.getName();
  }

  public getSubstitutionProvider(): ISubstitutionProvider | ISubstitutionProviderProbabilities | undefined {
    // eslint-disable-next-line ts/prefer-nullish-coalescing
    return this.substitutionProvider || this.variableTemplate.getSubstitutionProvider();
  }
}
