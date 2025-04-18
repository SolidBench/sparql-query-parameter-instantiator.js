import 'jest-rdf';
import { DataFactory } from 'rdf-data-factory';
import type { ISubstitutionProvider } from '../../lib/substitution/ISubstitutionProvider';
import { ValueTransformerReplaceIri } from '../../lib/valuetransformer/ValueTransformerReplaceIri';
import { VariableTemplateTimestamp } from '../../lib/variable/VariableTemplateTimestamp';

const DF = new DataFactory();

describe('VariableTemplateTimestamp', () => {
  let substitutionProvider: ISubstitutionProvider;
  let variable: VariableTemplateTimestamp;

  describe('without variable transformers', () => {
    beforeEach(() => {
      substitutionProvider = <any> {};
      variable = new VariableTemplateTimestamp('varName', substitutionProvider);
    });

    describe('createTerm', () => {
      it('should produce a literal with xsd:dateTime datatype', () => {
        expect(variable.createTerm('1354060800000')).toEqualRdfTerm(DF
          .literal('2012-11-28T00:00:00.000Z', DF.namedNode('http://www.w3.org/2001/XMLSchema#dateTime')));
      });

      it('should produce a literal with custom datatype', () => {
        variable = new VariableTemplateTimestamp('varName', substitutionProvider, [], 'ex:custom');
        expect(variable.createTerm('1354060800000')).toEqualRdfTerm(DF
          .literal('2012-11-28T00:00:00.000Z', DF.namedNode('ex:custom')));
      });
    });

    describe('getName', () => {
      it('should return the name', () => {
        expect(variable.getName()).toBe('varName');
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
      variable = new VariableTemplateTimestamp('varName', substitutionProvider, [
        new ValueTransformerReplaceIri('a', 'b'),
        new ValueTransformerReplaceIri('b', 'c'),
      ]);
    });

    describe('createTerm', () => {
      it('should produce a literal from a string', () => {
        expect(variable.createTerm('1354060800000')).toEqualRdfTerm(DF
          .literal('2012-11-28T00:00:00.000Z', DF.namedNode('http://www.w3.org/2001/XMLSchema#dateTime')));
      });

      it('should produce a literal from a number', () => {
        expect(variable.createTerm(1_354_060_800_000)).toEqualRdfTerm(DF
          .literal('2012-11-28T00:00:00.000Z', DF.namedNode('http://www.w3.org/2001/XMLSchema#dateTime')));
      });

      it('should throw for an array', () => {
        expect(() => variable.createTerm([ 123 ]))
          .toThrow('Received unsupported array value for the VariableTemplateTimestamp for varName');
      });
    });
  });
});
