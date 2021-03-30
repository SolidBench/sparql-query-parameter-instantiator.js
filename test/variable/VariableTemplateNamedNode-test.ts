import 'jest-rdf';
import { DataFactory } from 'rdf-data-factory';
import type { ISubstitutionProvider } from '../../lib/substitution/ISubstitutionProvider';
import { ValueTransformerReplaceIri } from '../../lib/valuetransformer/ValueTransformerReplaceIri';
import { VariableTemplateNamedNode } from '../../lib/variable/VariableTemplateNamedNode';
const DF = new DataFactory();

describe('VariableTemplateNamedNode', () => {
  let substitutionProvider: ISubstitutionProvider;
  let variable: VariableTemplateNamedNode;

  describe('without variable transformers', () => {
    beforeEach(() => {
      substitutionProvider = <any> {};
      variable = new VariableTemplateNamedNode('varName', substitutionProvider);
    });

    describe('createTerm', () => {
      it('should produce a named node', () => {
        expect(variable.createTerm('ex:a')).toEqualRdfTerm(DF.namedNode('ex:a'));
      });
    });

    describe('getName', () => {
      it('should return the name', () => {
        expect(variable.getName()).toEqual('varName');
      });
    });

    describe('getSubstitutionProvider', () => {
      it('should return the substitution provider', () => {
        expect(variable.getSubstitutionProvider()).toBe(substitutionProvider);
      });
    });
  });

  describe('with variable transformers', () => {
    beforeEach(() => {
      substitutionProvider = <any> {};
      variable = new VariableTemplateNamedNode('varName', substitutionProvider, [
        new ValueTransformerReplaceIri('a', 'b'),
        new ValueTransformerReplaceIri('b', 'c'),
      ]);
    });

    describe('createTerm', () => {
      it('should produce a named node', () => {
        expect(variable.createTerm('ex:a')).toEqualRdfTerm(DF.namedNode('ex:c'));
      });
    });
  });
});
