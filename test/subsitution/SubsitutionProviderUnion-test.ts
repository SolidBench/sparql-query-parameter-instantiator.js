import type { ISubstitutionProvider } from '../../lib/substitution/ISubstitutionProvider';
import { SubstitutionProviderUnion } from '../../lib/substitution/SubstitutionProviderUnion';

describe('SubstitutionProviderUnion', () => {
  let provider: SubstitutionProviderUnion;
  let subprovider1: ISubstitutionProvider;
  let subprovider2: ISubstitutionProvider;

  describe('for a plain CSV file', () => {
    beforeEach(() => {
      subprovider1 = {
        getValues: jest.fn(async() => [ 'a1', 'a2' ]),
      };
      subprovider2 = {
        getValues: jest.fn(async() => [ 'b1', 'b2' ]),
      };
      provider = new SubstitutionProviderUnion([
        subprovider1,
        subprovider2,
      ]);
    });

    describe('getValues', () => {
      it('returns the rows of all subproviders', async() => {
        await expect(provider.getValues()).resolves.toEqual([ 'a1', 'a2', 'b1', 'b2' ]);

        expect(subprovider1.getValues).toHaveBeenCalledTimes(1);
        expect(subprovider2.getValues).toHaveBeenCalledTimes(1);
      });
    });
  });
});
