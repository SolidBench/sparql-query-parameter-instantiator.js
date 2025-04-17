import type { ISubstitutionProvider } from '../../lib/substitution/ISubstitutionProvider';
import { SubstitutionProviderShuffle } from '../../lib/substitution/SubstitutionProviderShuffle';

describe('SubstitutionProviderShuffle', () => {
  let provider: SubstitutionProviderShuffle;
  let subprovider1: ISubstitutionProvider;

  describe('for a plain CSV file', () => {
    beforeEach(() => {
      subprovider1 = {
        getValues: jest.fn(async() => [ 'a1', 'a2', 'a3' ]),
      };
      provider = new SubstitutionProviderShuffle(subprovider1, 123);
    });

    describe('getValues', () => {
      it('returns the rows of the subprovider in a shuffled manner', async() => {
        await expect(provider.getValues()).resolves.toEqual([ 'a2', 'a1', 'a3' ]);

        expect(subprovider1.getValues).toHaveBeenCalledTimes(1);
      });
    });
  });
});
