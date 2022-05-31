import { Readable } from 'stream';
import { DataFactory } from 'rdf-data-factory';
import { QueryTemplateProvider } from '../lib/QueryTemplateProvider';
import { SubstitutionProviderStatic } from '../lib/substitution/SubstitutionProviderStatic';
import { VariableTemplateNamedNode } from '../lib/variable/VariableTemplateNamedNode';
const streamifyString = require('streamify-string');
const DF = new DataFactory();

const files: Record<string, string> = {};
const filesOut: Record<string, string> = {};
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
      ret.emit('error', new Error(`Unknown file in QueryTemplateProvider: ${filePath}`));
    };
    return ret;
  },
  createWriteStream(filePath: string) {
    return writeStream;
  },
  promises: {
    async readFile(filePath: string) {
      if (filePath in files) {
        return files[filePath];
      }
      throw new Error(`Unknown file in QueryTemplateProvider: ${filePath}`);
    },
    async writeFile(filePath: string, contents: string) {
      filesOut[filePath] = contents;
    },
  },
}));

describe('QueryTemplateProvider', () => {
  let provider: QueryTemplateProvider;
  beforeEach(() => {
    provider = new QueryTemplateProvider(
      'template1',
      'destination1',
      [
        new VariableTemplateNamedNode(
          'var1',
          new SubstitutionProviderStatic([ 'ex:a1', 'ex:b1', 'ex:c1' ]),
        ),
        new VariableTemplateNamedNode(
          'var2',
          new SubstitutionProviderStatic([ 'ex:a2', 'ex:b2', 'ex:c2' ]),
        ),
      ],
    );
  });

  describe('createTemplate', () => {
    it('should create a new template', async() => {
      files.template1 = `SELECT * WHERE {
  ?var1 a <ex:o1>.
  ?var3 <ex:p> ?var2.
}`;
      const template = await provider.createTemplate();
      expect((<any> template).syntaxTree).toEqual((<any> provider).parser.parse(files.template1));
      expect((<any> template).variableMappings).toEqual({
        var1: [
          DF.namedNode('ex:a1'),
          DF.namedNode('ex:b1'),
          DF.namedNode('ex:c1'),
        ],
        var2: [
          DF.namedNode('ex:a2'),
          DF.namedNode('ex:b2'),
          DF.namedNode('ex:c2'),
        ],
      });
    });

    it('throws when a template has an undefined substitution provider', async() => {
      provider = new QueryTemplateProvider(
        'template1',
        'destination1',
        [
          new VariableTemplateNamedNode(
            'var1',
            undefined,
          ),
        ],
      );
      await expect(provider.createTemplate()).rejects
        .toThrowError(`The variable template 'template1' for 'var1' has no substitution provider configured`);
    });
  });

  describe('saveQueriesFile', () => {
    it('should write contents to a file', async() => {
      await provider.saveQueriesFile('contents');
      expect(filesOut.destination1).toEqual('contents');
    });
  });
});
