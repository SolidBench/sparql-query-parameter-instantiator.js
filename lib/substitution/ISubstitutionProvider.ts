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
