import { SubstitutionProviderUnionProbabilities } from '../../lib/substitution/SubstitutionProviderUnionProbabilities';

describe('SubstitutionProviderUnionProbabilities', () => {
  it('concatenates values from all providers', async() => {
    const p1 = {
      getValues: jest.fn(async() => [ 'a', 'b' ]),
      getValuesProbabilities: jest.fn(async() => ({})),
    };
    const p2 = {
      getValues: jest.fn(async() => [ 'c' ]),
      getValuesProbabilities: jest.fn(async() => ({})),
    };

    const provider = new SubstitutionProviderUnionProbabilities([ p1 as any, p2 as any ]);
    await expect(provider.getValues()).resolves.toEqual([ 'a', 'b', 'c' ]);
  });

  it('merges per-user probabilities and sorts similarities descending', async() => {
    const p1 = {
      getValues: jest.fn(async() => []),
      getValuesProbabilities: jest.fn(async() => ({
        alice: [
          { entity: 'a', similarity: 0.1 },
          { entity: 'b', similarity: 0.9 },
        ],
      })),
    };
    const p2 = {
      getValues: jest.fn(async() => []),
      getValuesProbabilities: jest.fn(async() => ({
        alice: [ { entity: 'c', similarity: 0.5 } ],
        bob: [ { entity: 'd', similarity: 1 } ],
      })),
    };

    const provider = new SubstitutionProviderUnionProbabilities([ p1 as any, p2 as any ]);
    await expect(provider.getValuesProbabilities()).resolves.toEqual({
      alice: [
        { entity: 'b', similarity: 0.9 },
        { entity: 'c', similarity: 0.5 },
        { entity: 'a', similarity: 0.1 },
      ],
      bob: [ { entity: 'd', similarity: 1 } ],
    });
  });
});
