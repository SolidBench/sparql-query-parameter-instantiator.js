import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type { ISubstitutionProvider, ISubstitutionProviderProbabilities } from '../substitution/ISubstitutionProvider';
import type { IVariableTemplate } from './IVariableTemplate';

const DF = new DataFactory();

/**
 * A template for that always produces a new blank node.
 */
export class VariableTemplateVoid implements IVariableTemplate {
  public createTerm(): RDF.Term {
    return DF.blankNode();
  }

  public getName(): string {
    return '__void';
  }

  public getSubstitutionProvider(): ISubstitutionProvider | ISubstitutionProviderProbabilities |undefined {
    return undefined;
  }
}
