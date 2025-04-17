import 'jest-rdf';
import { DataFactory } from 'rdf-data-factory';
import type { ISubstitutionProvider } from '../../lib/substitution/ISubstitutionProvider';
import { VariableTemplateList } from '../../lib/variable/VariableTemplateList';
import { VariableTemplateLiteral } from '../../lib/variable/VariableTemplateLiteral';

const DF = new DataFactory();

describe('VariableTemplateNamedNode', () => {
  let substitutionProvider: ISubstitutionProvider;
  let variable: VariableTemplateList;

  describe('without variable transformers', () => {
    beforeEach(() => {
      substitutionProvider = <any> {};
      variable = new VariableTemplateList(
        'varNames',
        ', ',
        new VariableTemplateLiteral('varName'),
        substitutionProvider,
      );
    });

    describe('createTerm', () => {
      it('should produce for a string array', () => {
        expect(variable.createTerm([ 'a', 'b' ])).toEqualRdfTerm(DF.literal('a, b'));
      });

      it('should produce for a number array', () => {
        expect(variable.createTerm([ 1, 2 ])).toEqualRdfTerm(DF.literal('1, 2'));
      });

      it('should throw for a string', () => {
        expect(() => variable.createTerm('a'))
          .toThrow(`Received unsupported non-array value for the VariableTemplateList for varNames`);
      });

      it('should throw for a number', () => {
        expect(() => variable.createTerm(123))
          .toThrow(`Received unsupported non-array value for the VariableTemplateList for varNames`);
      });
    });

    describe('getName', () => {
      it('should return the name', () => {
        expect(variable.getName()).toBe('varNames');
      });
    });

    describe('getSubstitutionProvider', () => {
      it('should return the substitution provider', () => {
        expect(variable.getSubstitutionProvider()).toBe(substitutionProvider);
      });
    });
  });
});
