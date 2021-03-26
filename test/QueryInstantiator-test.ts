import { Readable } from 'stream';
import { QueryInstantiator } from '../lib/QueryInstantiator';
import { QueryTemplateProvider } from '../lib/QueryTemplateProvider';
import { SubstitutionProviderStatic } from '../lib/substitution/SubstitutionProviderStatic';
import { VariableTemplateNamedNode } from '../lib/variable/VariableTemplateNamedNode';

const streamifyString = require('streamify-string');

const files: Record<string, string> = {};
let filesOut: Record<string, string> = {};
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
      ret.emit('error', new Error(`Unknown file in QueryInstantiator: ${filePath}`));
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
      throw new Error(`Unknown file in QueryInstantiator: ${filePath}`);
    },
    async writeFile(filePath: string, contents: string) {
      filesOut[filePath] = contents;
    },
  },
}));

describe('QueryInstantiator', () => {
  let instantiator: QueryInstantiator;
  let providers: QueryTemplateProvider[];

  beforeEach(async() => {
    filesOut = {};
    providers = [
      new QueryTemplateProvider(
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
      ),
      new QueryTemplateProvider(
        'template2',
        'destination2',
        [
          new VariableTemplateNamedNode(
            'var3',
            new SubstitutionProviderStatic([ 'ex:a3', 'ex:b3', 'ex:c3' ]),
          ),
        ],
      ),
    ];
    instantiator = new QueryInstantiator(providers, 3);
  });

  describe('instantiate', () => {
    it('should invoke all query providers', async() => {
      files.template1 = `SELECT * WHERE {
  ?var1 a <ex:o1>.
  ?var3 <ex:p> ?var2.
}`;
      files.template2 = `SELECT * WHERE {
  ?var1 a <ex:o2>.
  ?var3 <ex:p> ?var2.
}`;

      await instantiator.instantiate();

      expect(filesOut.destination1).toEqual(`SELECT * WHERE {
  <ex:a1> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <ex:o1>.
  ?var3 <ex:p> <ex:a2>.
}

SELECT * WHERE {
  <ex:b1> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <ex:o1>.
  ?var3 <ex:p> <ex:b2>.
}

SELECT * WHERE {
  <ex:c1> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <ex:o1>.
  ?var3 <ex:p> <ex:c2>.
}`);
      expect(filesOut.destination2).toEqual(`SELECT * WHERE {
  ?var1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <ex:o2>.
  <ex:a3> <ex:p> ?var2.
}

SELECT * WHERE {
  ?var1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <ex:o2>.
  <ex:b3> <ex:p> ?var2.
}

SELECT * WHERE {
  ?var1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <ex:o2>.
  <ex:c3> <ex:p> ?var2.
}`);
    });
  });
});
