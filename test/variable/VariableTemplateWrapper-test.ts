import { DataFactory } from 'rdf-data-factory';
import { VariableTemplateWrapper } from '../../lib/variable/VariableTemplateWrapper';

describe('VariableTemplateWrapper', () => {
  const DF = new DataFactory();

  it('delegates createTerm and getName to wrapped template', () => {
    const wrapped = {
      createTerm: jest.fn(() => DF.namedNode('ex:a')),
      getName: jest.fn(() => 'v'),
      getSubstitutionProvider: jest.fn(() => undefined),
    };

    const wrapper = new VariableTemplateWrapper(wrapped as any);

    expect(wrapper.createTerm('input')).toEqual(DF.namedNode('ex:a'));
    expect(wrapper.getName()).toBe('v');
    expect(wrapped.createTerm).toHaveBeenCalledWith('input');
  });

  it('returns overriding substitution provider when set', () => {
    const override = { getValues: async() => [ 'x' ] };
    const wrapped = {
      createTerm: jest.fn(() => DF.namedNode('ex:a')),
      getName: jest.fn(() => 'v'),
      getSubstitutionProvider: jest.fn(() => ({ getValues: async() => [ 'y' ] })),
    };
    const wrapper = new VariableTemplateWrapper(wrapped as any, override as any);

    expect(wrapper.getSubstitutionProvider()).toBe(override);
  });

  it('falls back to wrapped substitution provider when no override is given', () => {
    const wrappedProvider = { getValues: async() => [ 'y' ] };
    const wrapped = {
      createTerm: jest.fn(() => DF.namedNode('ex:a')),
      getName: jest.fn(() => 'v'),
      getSubstitutionProvider: jest.fn(() => wrappedProvider),
    };
    const wrapper = new VariableTemplateWrapper(wrapped as any);

    expect(wrapper.getSubstitutionProvider()).toBe(wrappedProvider);
  });
});
