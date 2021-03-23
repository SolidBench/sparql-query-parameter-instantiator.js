import { Readable } from 'stream';
import { DataFactory } from 'rdf-data-factory';
import 'jest-rdf';
import { QueryInstantiator } from '../lib/QueryInstantiator';

const streamifyString = require('streamify-string');
const DF = new DataFactory();

const files: Record<string, string> = {};
const writeStream = {
  on: jest.fn(),
  once: jest.fn(),
  emit: jest.fn(),
  end: jest.fn(),
};
jest.mock('fs', () => ({
  createReadStream(filePath: string) {
    if (filePath in files) {
      return streamifyString(files[filePath]);
    }
    const ret = new Readable();
    ret._read = () => {
      ret.emit('error', new Error('Unknown file in QueryInstantiator'));
    };
    return ret;
  },
  createWriteStream(filePath: string) {
    return writeStream;
  },
}));

describe('QueryInstantiator', () => {
  let instantiator: QueryInstantiator;

  beforeEach(async() => {
    instantiator = new QueryInstantiator();
  });

  describe('instantiate', () => {
    beforeEach(() => {
      // TODO
    });

    it('should run', async() => {
      await instantiator.instantiate();
    });
  });
});
