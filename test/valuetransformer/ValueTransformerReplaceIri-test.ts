import { DataFactory } from 'rdf-data-factory';
import type { IValueTransformer } from '../../lib/valuetransformer/IValueTransformer';
import { ValueTransformerReplaceIri } from '../../lib/valuetransformer/ValueTransformerReplaceIri';

const DF = new DataFactory();

describe('ValueTransformerReplaceIri', () => {
  let transformer: IValueTransformer;

  describe('with anchored pattern (default behavior)', () => {
    beforeEach(() => {
      transformer = new ValueTransformerReplaceIri('^http://www.ldbc.eu', 'http://localhost:3000/www.ldbc.eu');
    });

    describe('transform', () => {
      it('should modify applicable terms', () => {
        expect(transformer.transform(DF.namedNode('http://www.ldbc.eu/a.ttl')))
          .toEqual(DF.namedNode('http://localhost:3000/www.ldbc.eu/a.ttl'));
      });

      it('should not modify non-applicable terms', () => {
        expect(transformer.transform(DF.namedNode('http://something.ldbc.eu/a.ttl')))
          .toEqual(DF.namedNode('http://something.ldbc.eu/a.ttl'));
        expect(transformer.transform(DF.literal('http://www.ldbc.eu/a.ttl')))
          .toEqual(DF.literal('http://www.ldbc.eu/a.ttl'));
      });
    });
  });

  describe('with unanchored pattern and replaceAll disabled (default)', () => {
    beforeEach(() => {
      // Unanchored pattern, third parameter (replaceAll) is omitted/false
      transformer = new ValueTransformerReplaceIri('http://www.ldbc.eu', 'http://localhost:3000');
    });

    describe('transform', () => {
      it('should replace only the first occurrence of the pattern', () => {
        // The pattern appears twice; only the first domain should change
        const originalIri = 'http://www.ldbc.eu/path?redirect=http://www.ldbc.eu/other';
        const expectedIri = 'http://localhost:3000/path?redirect=http://www.ldbc.eu/other';

        expect(transformer.transform(DF.namedNode(originalIri)))
          .toEqual(DF.namedNode(expectedIri));
      });
    });
  });

  describe('with replaceAll set to true', () => {
    beforeEach(() => {
      transformer = new ValueTransformerReplaceIri('http://www.ldbc.eu', 'http://localhost:3000', true);
    });

    describe('transform', () => {
      it('should replace all occurrences of the pattern within the term', () => {
        const originalIri = 'http://www.ldbc.eu/path?redirect=http://www.ldbc.eu/other';
        const expectedIri = 'http://localhost:3000/path?redirect=http://localhost:3000/other';

        expect(transformer.transform(DF.namedNode(originalIri)))
          .toEqual(DF.namedNode(expectedIri));
      });
    });
  });
});
