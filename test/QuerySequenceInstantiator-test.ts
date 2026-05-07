import * as fs from 'node:fs';
import * as path from 'node:path';

import { QuerySequenceInstantiator } from '../lib/QuerySequenceInstantiator';

jest.mock('../lib/logging/logger', () => ({
  logger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

describe('QuerySequenceInstantiator', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const getBaseArgs = () => ({
    providers: [
      <any> { getTemplateName: () => 'templateA' },
      <any> { getTemplateName: () => 'templateB' },
    ],
    personProvider: <any> {
      getSubstitutionProvider: () => ({ getValues: async() => [ 'alice', 'bob' ]}),
    },
    count: 2,
    seed: 123,
    sequenceGenerator: <any> {
      generateSequence: jest.fn(async() => ({
        querySequence: [ 'SELECT * WHERE { ?s ?p ?o }' ],
        sequenceMetadata: { a: 1 },
      })),
    },
    destinationFilePath: '/tmp/sequences',
    metadataDestinationFilePath: '/tmp/metadata',
  });

  it('instantiateProviderSequence generates sequence and writes files', async() => {
    const writeSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
    const args = getBaseArgs();
    const instantiator = new QuerySequenceInstantiator(args);

    await instantiator.instantiateProviderSequence(1, 'alice');

    expect(args.sequenceGenerator.generateSequence).toHaveBeenCalledWith(
      expect.any(Function),
      args.providers,
      { templateA: 0, templateB: 0 },
      'alice',
      1,
    );
    expect(writeSpy).toHaveBeenNthCalledWith(
      1,
      path.join('/tmp/sequences', 'sequence_1.sparql'),
      'SELECT * WHERE { ?s ?p ?o }',
      'utf8',
    );
    expect(writeSpy).toHaveBeenNthCalledWith(
      2,
      path.join('/tmp/metadata', 'sequence_1.metadata.json'),
      JSON.stringify({ a: 1 }, null, 2),
      'utf8',
    );
  });

  it('instantiate loops over users and sequence indexes', async() => {
    const args = getBaseArgs();
    const instantiator = new QuerySequenceInstantiator(args);
    const seqSpy = jest.spyOn(instantiator, 'instantiateProviderSequence').mockResolvedValue(undefined);

    await instantiator.instantiate();

    expect(seqSpy).toHaveBeenCalledTimes(2);
    expect(seqSpy).toHaveBeenNthCalledWith(1, 0, 'alice');
    expect(seqSpy).toHaveBeenNthCalledWith(2, 1, 'bob');
  });

  it('getPeople throws when substitution provider is missing', async() => {
    const args = getBaseArgs();
    args.personProvider = <any> { getSubstitutionProvider: () => undefined };
    const instantiator = new QuerySequenceInstantiator(args);

    await expect(instantiator.getPeople())
      .rejects.toThrow('No substitution provider defined for people provider in QuerySequenceInstantiator');
  });

  it('saveMetadataToFile falls back to destination path when metadata destination is not set', async() => {
    const writeSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
    const args = getBaseArgs();
    delete (<any> args).metadataDestinationFilePath;
    const instantiator = new QuerySequenceInstantiator(args);

    await instantiator.saveMetadataToFile('x.json', <any> { ok: true });

    expect(writeSpy).toHaveBeenCalledWith(
      path.join('/tmp/sequences', 'x.json'),
      JSON.stringify({ ok: true }, null, 2),
      'utf8',
    );
  });
});
