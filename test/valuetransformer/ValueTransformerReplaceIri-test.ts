import { DataFactory } from 'rdf-data-factory';
import type { IValueTransformer } from '../../lib/valuetransformer/IValueTransformer';
import { ValueTransformerReplaceIri } from '../../lib/valuetransformer/ValueTransformerReplaceIri';

const DF = new DataFactory();

describe('ValueTransformerReplaceIri', () => {
  let transformer: IValueTransformer;

  beforeEach(() => {
    transformer = new ValueTransformerReplaceIri('^http://www.ldbc.eu', 'http://localhost:3000/www.ldbc.eu');
  });

  describe('transform', () => {
    it('should modify applicable terms', async() => {
      expect(transformer.transform(DF.namedNode('http://www.ldbc.eu/a.ttl')))
        .toEqual(DF.namedNode('http://localhost:3000/www.ldbc.eu/a.ttl'));
    });

    it('should not modify non-applicable terms', async() => {
      expect(transformer.transform(DF.namedNode('http://something.ldbc.eu/a.ttl')))
        .toEqual(DF.namedNode('http://something.ldbc.eu/a.ttl'));
      expect(transformer.transform(DF.literal('http://www.ldbc.eu/a.ttl')))
        .toEqual(DF.literal('http://www.ldbc.eu/a.ttl'));
    });
  });
});
