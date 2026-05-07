import * as fs from 'node:fs';
import { DataFactory } from 'rdf-data-factory';
import { ValueTransformerCsvMap } from '../../lib/valuetransformer/ValueTransformerCsvMap';

// Mock the file system module to avoid real file I/O during tests
jest.mock('node:fs');

const DF = new DataFactory();

describe('ValueTransformerCsvMap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor and readMapping', () => {
    it('parses a standard CSV file correctly', () => {
      (<jest.Mock> fs.readFileSync).mockReturnValue('old1,new1\nold2,new2');
      const transformer = new ValueTransformerCsvMap('dummy.csv');

      expect(transformer.readMapping()).toEqual({
        old1: 'new1',
        old2: 'new2',
      });
    });

    it('inverts the mapping when invertMapping is set to true', () => {
      (<jest.Mock> fs.readFileSync).mockReturnValue('old1,new1\nold2,new2');
      const transformer = new ValueTransformerCsvMap('dummy.csv', true);

      expect(transformer.readMapping()).toEqual({
        new1: 'old1',
        new2: 'old2',
      });
    });

    it('trims whitespace from both keys and values', () => {
      (<jest.Mock>fs.readFileSync).mockReturnValue(' old1 , new1 \n  old2,new2  ');
      const transformer = new ValueTransformerCsvMap('dummy.csv');

      expect(transformer.readMapping()).toEqual({
        old1: 'new1',
        old2: 'new2',
      });
    });
    it('throws when CSV does not have two columns', () => {
      (<jest.Mock>fs.readFileSync).mockReturnValue(' old1  \n  old2  ');

      // Wrap the constructor inside the expect() function!
      expect(() => {
        new ValueTransformerCsvMap('dummy.csv');
      }).toThrow(/csv entry invalid number of columns found/u);
    });
  });

  describe('transform', () => {
    let transformer: ValueTransformerCsvMap;

    beforeEach(() => {
      (<jest.Mock>fs.readFileSync).mockReturnValue('http://example.org/old,http://example.org/new');
      transformer = new ValueTransformerCsvMap('dummy.csv');
    });

    it('returns a new NamedNode with the mapped value when a match is found', () => {
      const input = DF.namedNode('http://example.org/old');
      const output = transformer.transform(input);

      expect(output.termType).toBe('NamedNode');
      expect(output.value).toBe('http://example.org/new');
      expect(output).not.toBe(input); // Asserts a new instance is returned
    });

    it('returns the original term when the NamedNode does not exist in the mapping', () => {
      const input = DF.namedNode('http://example.org/other');
      const output = transformer.transform(input);

      expect(output).toBe(input); // Asserts exact object reference is maintained
    });

    it('returns the original term when the input is a Literal, even if the value matches a key', () => {
      const literal = DF.literal('http://example.org/old');
      const output = transformer.transform(literal);

      expect(output).toBe(literal);
    });

    it('returns the original term when the input is a BlankNode, even if the value matches a key', () => {
      const blankNode = DF.blankNode('http://example.org/old');
      const output = transformer.transform(blankNode);

      expect(output).toBe(blankNode);
    });
  });
});
