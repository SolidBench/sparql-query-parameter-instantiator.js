import { DataFactory } from 'rdf-data-factory';
import type * as RDF from 'rdf-js';
import type { ISubstitutionProvider } from '../substitution/ISubstitutionProvider';
import type { IValueTransformer } from '../valuetransformer/IValueTransformer';
import type { IVariableTemplate } from './IVariableTemplate';

/**
 * An adapter for instantiating RDF terms from a variable value.
 */
export abstract class VariableTemplateAdapter implements IVariableTemplate {
  private readonly name: string;
  private readonly substitutionProvider: ISubstitutionProvider;
  private readonly valueTransformers: IValueTransformer[];
  protected readonly DF = new DataFactory();

  public constructor(
    name: string,
    substitutionProvider: ISubstitutionProvider,
    valueTransformers?: IValueTransformer[],
  ) {
    this.name = name;
    this.substitutionProvider = substitutionProvider;
    this.valueTransformers = valueTransformers || [];
  }

  public getName(): string {
    return this.name;
  }

  public getSubstitutionProvider(): ISubstitutionProvider {
    return this.substitutionProvider;
  }

  public createTerm(value: string): RDF.Term {
    let term: RDF.Term = this.createTermInner(value);
    for (const valueTransformer of this.valueTransformers) {
      term = valueTransformer.transform(term);
    }
    return term;
  }

  public abstract createTermInner(value: string): RDF.Term;
}
