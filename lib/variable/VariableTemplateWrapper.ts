import type * as RDF from '@rdfjs/types';
import type { ISubstitutionProvider } from '../substitution/ISubstitutionProvider';
import type { IVariableTemplate } from './IVariableTemplate';

export class VariableTemplatedWrapper implements IVariableTemplate {
  public constructor(
    public readonly variableTemplate: IVariableTemplate,
    public readonly substitutionProvider?: ISubstitutionProvider,
  ) {}

  public createTerm(value: string): RDF.Term {
    return this.variableTemplate.createTerm(value);
  }

  public getName(): string {
    return this.variableTemplate.getName();
  }

  public getSubstitutionProvider(): ISubstitutionProvider | undefined {
    return this.substitutionProvider || this.variableTemplate.getSubstitutionProvider();
  }
}
