import 'jest-rdf';
import { DataFactory } from 'rdf-data-factory';
import type { ISubstitutionProvider } from '../../lib/substitution/ISubstitutionProvider';
import { VariableTemplateLiteral } from '../../lib/variable/VariableTemplateLiteral';
const DF = new DataFactory();

describe('VariableTemplateLiteral', () => {
  let substitutionProvider: ISubstitutionProvider;
  let variable: VariableTemplateLiteral;
  beforeEach(() => {
    substitutionProvider = <any> {};
    variable = new VariableTemplateLiteral('varName', substitutionProvider);
  });

  describe('createTerm', () => {
    it('should produce a literal', () => {
      expect(variable.createTerm('ex:a')).toEqualRdfTerm(DF.literal('ex:a'));
    });

    it('should produce a literal with language', () => {
      variable = new VariableTemplateLiteral('varName', substitutionProvider, 'en-us');
      expect(variable.createTerm('ex:a')).toEqualRdfTerm(DF.literal('ex:a', 'en-us'));
    });

    it('should produce a literal with datatype', () => {
      variable = new VariableTemplateLiteral('varName', substitutionProvider, undefined, 'ex:b');
      expect(variable.createTerm('ex:a')).toEqualRdfTerm(DF.literal('ex:a', DF.namedNode('ex:b')));
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
