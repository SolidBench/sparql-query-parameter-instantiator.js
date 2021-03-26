import { Readable } from 'stream';
import { SubstitutionProviderCsv } from '../../lib/substitution/SubstitutionProviderCsv';
const streamifyString = require('streamify-string');

const files: Record<string, string> = {};
jest.mock('fs', () => ({
  createReadStream(filePath: string) {
    if (filePath in files) {
      return streamifyString(files[filePath]);
    }
    const ret = new Readable();
    ret._read = () => {
      ret.emit('error', new Error('Unknown file in SubstitutionProviderCsv'));
    };
    return ret;
  },
}));

describe('SubstitutionProviderCsv', () => {
  let provider: SubstitutionProviderCsv;

  describe('for a plain CSV file', () => {
    beforeEach(() => {
      provider = new SubstitutionProviderCsv('file.csv', 'col2');
      files['file.csv'] = `col1,col2,col3
a1,b1,c1
a2,b2,c2
a3,b3,c3`;
    });

    describe('getValues', () => {
      it('returns the rows of the configured column', async() => {
        expect(await provider.getValues()).toEqual([ 'b1', 'b2', 'b3' ]);
      });
    });
  });

  describe('for an invalid column', () => {
    beforeEach(() => {
      provider = new SubstitutionProviderCsv('file.csv', 'colOther');
      files['file.csv'] = `col1,col2,col3
a1,b1,c1
a2,b2,c2
a3,b3,c3`;
    });

    describe('getValues', () => {
      it('should throw', async() => {
        await expect(provider.getValues()).rejects
          .toThrowError('The column colOther was not set in the CSV file file.csv');
      });
    });
  });

  describe('for an invalid file', () => {
    beforeEach(() => {
      provider = new SubstitutionProviderCsv('file-unknown.csv', 'col1');
    });

    describe('getValues', () => {
      it('should throw', async() => {
        await expect(provider.getValues()).rejects.toThrowError('Unknown file in SubstitutionProviderCsv');
      });
    });
  });
});
