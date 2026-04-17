import { DataFactory } from 'rdf-data-factory';
import {
  calculateExpectedMeanLogNormal,
  gaussianRandom,
  logNormal,
  logNormalRoundedUp,
  randomIntFromInterval,
  sampleHit,
  sampleProbability,
  sampleRandom,
  sampleTerm,
  sampleVariableTerm,
} from '../../lib/utils/RandomUtils';

describe('RandomUtils', () => {
  const DF = new DataFactory();
  const makeRng = (value: number): any => Object.assign(() => value, {
    double: () => value,
    int32: () => Math.floor(value * (2 ** 31)),
    quick: () => value,
  });

  describe('calculateExpectedMeanLogNormal', () => {
    it('returns exp(mean + 0.5*stdev^2)', () => {
      expect(calculateExpectedMeanLogNormal(0, 1)).toBe(Math.exp(0.5));
    });
  });

  describe('gaussianRandom', () => {
    it('returns deterministic value from rng', () => {
      const rng = jest.fn()
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.25);
      const value = gaussianRandom(rng as any, 10, 2);
      const expected = Math.sqrt(-2 * Math.log(0.5)) * Math.cos(2 * Math.PI * 0.25) * 2 + 10;
      expect(value).toBeCloseTo(expected, 10);
    });
  });

  describe('logNormal and logNormalRoundedUp', () => {
    it('computes exp(gaussian) and rounds up when requested', () => {
      const rng = jest.fn()
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.25)
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.25);
      const base = logNormal(rng as any, 0, 1);
      const rounded = logNormalRoundedUp(rng as any, 0, 1);
      expect(base).toBeGreaterThanOrEqual(0);
      expect(rounded).toBe(Math.ceil(base));
    });
  });

  describe('sampleRandom', () => {
    it('samples an item using rng index', () => {
      expect(sampleRandom(makeRng(0.75), [ 'a', 'b', 'c', 'd' ])).toBe('d');
    });
  });

  describe('sampleProbability', () => {
    it('samples based on cumulative probabilities', () => {
      const result = sampleProbability(makeRng(0.51), [
        { probability: 0.5, entity: 'a' },
        { probability: 0.3, entity: 'b' },
        { probability: 0.2, entity: 'c' },
      ]);
      expect(result).toBe('b');
    });

    it('throws when probabilities do not sum to 1', () => {
      expect(() => sampleProbability(makeRng(0.99), [
        { probability: 0.2, entity: 'a' },
        { probability: 0.2, entity: 'b' },
      ])).toThrow('Failed sampling, likely due to probabilities not summing to 1.');
    });
  });

  describe('sampleHit', () => {
    it('returns true if rng value is below threshold', () => {
      expect(sampleHit(makeRng(0.1), 0.5)).toBe(true);
      expect(sampleHit(makeRng(0.9), 0.5)).toBe(false);
    });
  });

  describe('randomIntFromInterval', () => {
    it('returns value in inclusive interval', () => {
      expect(randomIntFromInterval(makeRng(0), 3, 7)).toBe(3);
      expect(randomIntFromInterval(makeRng(0.9999), 3, 7)).toBe(7);
    });
  });

  describe('sampleTerm', () => {
    it('samples term by cumulative similarity', () => {
      const logits = [
        { entity: 'e1', similarity: 0.4 },
        { entity: 'e2', similarity: 0.6 },
      ];
      expect(sampleTerm(logits as any, makeRng(0.8))).toBe('e2');
    });

    it('throws if no term could be sampled', () => {
      const logits = [
        { entity: 'e1', similarity: 0.1 },
        { entity: 'e2', similarity: 0.1 },
      ];
      expect(() => sampleTerm(logits as any, makeRng(0.9)))
        .toThrow('Failed sampling, likely due to probabilities not summing to 1.');
    });
  });

  describe('sampleVariableTerm', () => {
    it('returns unique sampled named nodes', () => {
      const rng = jest.fn()
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.2)
        .mockReturnValueOnce(0.7);
      const sampled = sampleVariableTerm(
        'person',
        'alice',
        2,
        {
          person: {
            alice: [
              { entity: 'http://ex.org/a', similarity: 0.5 },
              { entity: 'http://ex.org/b', similarity: 0.5 },
            ],
            bob: [],
            charlie: [],
          },
        },
        DF,
        rng as any,
      );
      expect(sampled.map(t => t.value).sort()).toEqual([ 'http://ex.org/a', 'http://ex.org/b' ]);
    });

    it('throws if sampling more values than possible', () => {
      expect(() => sampleVariableTerm(
        'person',
        'alice',
        1,
        {
          person: {
            alice: [ { entity: 'http://ex.org/a', similarity: 1 } ],
          },
        },
        DF,
        makeRng(0.5),
      )).toThrow('Trying to sample more values than there are elements');
    });

    it('throws if no logits for user are present', () => {
      expect(() => sampleVariableTerm(
        'person',
        'unknown',
        1,
        {
          person: {
            alice: [ { entity: 'http://ex.org/a', similarity: 1 } ],
            bob: [],
          },
        },
        DF,
        makeRng(0.5),
      )).toThrow("No logits found for user 'unknown' for variable 'person'");
    });
  });
});
