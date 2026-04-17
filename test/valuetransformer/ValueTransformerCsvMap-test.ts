jest.mock('node:fs', () => ({
  readFileSync: jest.fn(),
}));
import * as fs from 'node:fs';
import { DataFactory } from 'rdf-data-factory';
import { ValueTransformerCsvMap } from '../../lib/valuetransformer/ValueTransformerCsvMap';

describe('ValueTransformerCsvMap', () => {
  const DF = new DataFactory();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reads mappings and transforms named nodes', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(`a,http://ex.org/a
b,http://ex.org/b
`);
    const transformer = new ValueTransformerCsvMap('/tmp/mapping.csv');

    expect(transformer.transform(DF.namedNode('a'))).toEqual(DF.namedNode('http://ex.org/a'));
    expect(transformer.transform(DF.namedNode('unknown'))).toEqual(DF.namedNode('unknown'));
    expect(transformer.transform(DF.literal('a'))).toEqual(DF.literal('a'));
  });

  it('supports inverted mappings', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(`source,target
left,right
`);
    const transformer = new ValueTransformerCsvMap('/tmp/mapping.csv', true);

    expect(transformer.transform(DF.namedNode('target'))).toEqual(DF.namedNode('source'));
    expect(transformer.transform(DF.namedNode('right'))).toEqual(DF.namedNode('left'));
  });

  it('ignores malformed mapping rows', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(`a,http://ex.org/a
invalid
,missingKey
missingValue,
`);
    const transformer = new ValueTransformerCsvMap('/tmp/mapping.csv');

    expect(transformer.transform(DF.namedNode('a'))).toEqual(DF.namedNode('http://ex.org/a'));
    expect(transformer.transform(DF.namedNode('invalid'))).toEqual(DF.namedNode('invalid'));
  });
});
