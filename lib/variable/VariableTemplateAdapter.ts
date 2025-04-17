import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type { ISubstitutionProvider } from '../substitution/ISubstitutionProvider';
import type { IValueTransformer } from '../valuetransformer/IValueTransformer';
import type { IVariableTemplate, RawTerm } from './IVariableTemplate';

/**
 * An adapter for instantiating RDF terms from a variable value.
 */
export abstract class VariableTemplateAdapter implements IVariableTemplate {
  protected readonly name: string;
  protected readonly substitutionProvider: ISubstitutionProvider | undefined;
  protected readonly valueTransformers: IValueTransformer[];
  // eslint-disable-next-line ts/naming-convention
  protected readonly DF = new DataFactory();

  public constructor(
    name: string,
    substitutionProvider?: ISubstitutionProvider,
    valueTransformers?: IValueTransformer[],
  ) {
    this.name = name;
    this.substitutionProvider = substitutionProvider;
    // eslint-disable-next-line ts/prefer-nullish-coalescing
    this.valueTransformers = valueTransformers || [];
  }

  public getName(): string {
    return this.name;
  }

  public getSubstitutionProvider(): ISubstitutionProvider | undefined {
    return this.substitutionProvider;
  }

  public createTerm(value: RawTerm): RDF.Term {
    let term: RDF.Term = this.createTermInner(value);
    for (const valueTransformer of this.valueTransformers) {
      term = valueTransformer.transform(term);
    }
    return term;
  }

  public abstract createTermInner(value: RawTerm): RDF.Term;
}
