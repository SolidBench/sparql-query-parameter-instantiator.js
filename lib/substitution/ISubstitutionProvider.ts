import type { RawTerm } from '../variable/IVariableTemplate';

/**
 * Provides subsitution parameters.
 */
export interface ISubstitutionProvider {
  /**
   * Provide a list of values.
   */
  getValues: () => Promise<RawTerm[]>;
}

/**
 * 
 */

export interface ISubstitutionProviderProbabilities extends ISubstitutionProvider{
    /**
   * Provide a record mapping values to logits of selected the value.
   */
  getValuesProbabilities: () => Promise<Record<string , any>>;
}