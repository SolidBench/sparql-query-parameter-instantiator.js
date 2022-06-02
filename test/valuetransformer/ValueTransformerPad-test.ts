import { DataFactory } from 'rdf-data-factory';
import type { IValueTransformer } from '../../lib/valuetransformer/IValueTransformer';
import { ValueTransformerPad } from '../../lib/valuetransformer/ValueTransformerPad';

const DF = new DataFactory();

describe('ValueTransformerPad', () => {
  let transformer: IValueTransformer;

  describe('padding start', () => {
    beforeEach(() => {
      transformer = new ValueTransformerPad('0', 5, true);
    });

    describe('transform', () => {
      it('should modify terms', async() => {
        expect(transformer.transform(DF.literal('123')))
          .toEqual(DF.literal('00123'));
        expect(transformer.transform(DF.literal('123456')))
          .toEqual(DF.literal('123456'));
      });
    });
  });

  describe('padding end', () => {
    beforeEach(() => {
      transformer = new ValueTransformerPad('0', 5, false);
    });

    describe('transform', () => {
      it('should modify terms', async() => {
        expect(transformer.transform(DF.literal('123')))
          .toEqual(DF.literal('12300'));
        expect(transformer.transform(DF.literal('123456')))
          .toEqual(DF.literal('123456'));
      });
    });
  });
});
