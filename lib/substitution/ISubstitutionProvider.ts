/**
 * Provides subsitution parameters.
 */
export interface ISubstitutionProvider {
  /**
   * Provide a list of values.
   */
  getValues: () => Promise<string[]>;
}
