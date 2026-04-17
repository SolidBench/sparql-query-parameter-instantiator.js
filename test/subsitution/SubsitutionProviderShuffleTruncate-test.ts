import { SubstitutionProviderShuffleTruncate } from '../../lib/substitution/SubstitutionProviderShuffleTruncate';

describe('SubstitutionProviderShuffleTruncate', () => {
  it('returns deterministic random sample with seeded rng', async() => {
    const subProvider = { getValues: jest.fn(async() => [ 'a', 'b', 'c', 'd' ]) };
    const provider = new SubstitutionProviderShuffleTruncate(subProvider as any, 123, 2);

    await expect(provider.getValues()).resolves.toEqual([ 'd', 'b' ]);
    expect(subProvider.getValues).toHaveBeenCalledTimes(1);
  });

  it('returns all values if n exceeds array size', () => {
    const provider = new SubstitutionProviderShuffleTruncate({ getValues: async() => [] } as any, 1, 10);
    const values = provider.getRandomSample([ 'a', 'b' ], 3);
    expect(values).toEqual([ 'a', 'b' ]);
  });
});
