import { DataFactory } from 'rdf-data-factory';
import type * as RDF from 'rdf-js';
import type { ISubstitutionProvider } from '../substitution/ISubstitutionProvider';
import type { IVariableTemplate } from './IVariableTemplate';

/**
 * An adapter for instantiating RDF terms from a variable value.
 */
export abstract class VariableTemplateAdapter implements IVariableTemplate {
  private readonly name: string;
  private readonly substitutionProvider: ISubstitutionProvider;
  protected readonly DF = new DataFactory();

  public constructor(name: string, substitutionProvider: ISubstitutionProvider) {
    this.name = name;
    this.substitutionProvider = substitutionProvider;
  }

  public getName(): string {
    return this.name;
  }

  public getSubstitutionProvider(): ISubstitutionProvider {
    return this.substitutionProvider;
  }

  public abstract createTerm(value: string): RDF.Term;
}
