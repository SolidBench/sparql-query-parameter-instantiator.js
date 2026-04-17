import { VariableTemplateVoid } from '../../lib/variable/VariableTemplateVoid';

describe('VariableTemplateVoid', () => {
  it('creates blank nodes', () => {
    const variable = new VariableTemplateVoid();
    const term = variable.createTerm();

    expect(term.termType).toBe('BlankNode');
  });

  it('returns static name and no substitution provider', () => {
    const variable = new VariableTemplateVoid();
    expect(variable.getName()).toBe('__void');
    expect(variable.getSubstitutionProvider()).toBeUndefined();
  });
});
