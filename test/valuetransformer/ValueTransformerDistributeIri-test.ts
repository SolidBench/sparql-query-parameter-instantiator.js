import { DataFactory } from 'rdf-data-factory';
import { ValueTransformerDistributeIri } from '../../lib/valuetransformer/ValueTransformerDistributeIri';

const DF = new DataFactory();

describe('ValueTransformerDistributeIri', () => {
  let transformer: ValueTransformerDistributeIri;

  beforeEach(() => {
    transformer = new ValueTransformerDistributeIri(
      '^http://www.ldbc.eu/data/pers([0-9]*)$',
      [ 'http://server1.ldbc.eu/pods/$1/profile/card#me', 'http://server2.ldbc.eu/pods/$1/profile/card#me' ],
    );
  });

  describe('transform', () => {
    it('should modify applicable values', async() => {
      expect(transformer.transform(
        DF.namedNode('http://www.ldbc.eu/data/pers0494'),
      )).toEqual(
        DF.namedNode('http://server1.ldbc.eu/pods/0494/profile/card#me'),
      );

      expect(transformer.transform(
        DF.namedNode('http://www.ldbc.eu/data/pers0495'),
      )).toEqual(
        DF.namedNode('http://server2.ldbc.eu/pods/0495/profile/card#me'),
      );
    });

    it('should not modify non-applicable terms', async() => {
      expect(transformer.transform(
        DF.literal('http://www.ldbc.eu/data/pers0495'),
      )).toEqual(
        DF.literal('http://www.ldbc.eu/data/pers0495'),
      );

      expect(transformer.transform(
        DF.namedNode('http://example.com/data/pers0495'),
      )).toEqual(
        DF.namedNode('http://example.com/data/pers0495'),
      );
    });

    it('should throw error for first regex group not capturing number', async() => {
      const badTransformer = new ValueTransformerDistributeIri(
        '^http://www.ldbc.eu/data/(pers[0-9]*)$',
        [ 'http://server1.ldbc.eu/pods/$1/profile/card#me', 'http://server2.ldbc.eu/pods/$1/profile/card#me' ],
      );

      expect(() => badTransformer.transform(
        DF.namedNode('http://www.ldbc.eu/data/pers0495'),
      )).toThrow('ValueTransformerDistributeIri error: The first capture group in "searchRegex"');
    });

    it('should throw error when no regex groups', async() => {
      const badTransformer = new ValueTransformerDistributeIri(
        '^http://www.ldbc.eu/data/pers[0-9]*$',
        [ 'http://server1.ldbc.eu/pods/$1/profile/card#me', 'http://server2.ldbc.eu/pods/$1/profile/card#me' ],
      );

      expect(() => badTransformer.transform(
        DF.namedNode('http://www.ldbc.eu/data/pers0495'),
      )).toThrow('ValueTransformerDistributeIri error: The "searchRegex" did not contain any groups.');
    });
  });
});
