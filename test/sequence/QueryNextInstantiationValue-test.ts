import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type { SelectQuery } from 'sparqljs';
import { Parser } from 'sparqljs';
import type { QLeverInstance } from '../../lib/sequence/QLeverInstance';
import {
  QueryNextInstantiatorValue,
  TermTransformerBiDirectional,
} from '../../lib/sequence/QueryNextInstantiationValue';
import type {
  IQueryNextInstantiatorValueArgs,
} from '../../lib/sequence/QueryNextInstantiationValue';
import type { ValueTransformerCsvMap } from '../../lib/valuetransformer/ValueTransformerCsvMap';

const DF = new DataFactory();

describe('QueryNextInstantiatorValue', () => {
  let instance: QueryNextInstantiatorValue;
  let mockQLever: jest.Mocked<QLeverInstance>;
  let mockTransformerFragmentedToOriginal: jest.Mocked<ValueTransformerCsvMap>;
  let mockTransformerOriginalToFragmented: jest.Mocked<ValueTransformerCsvMap>;
  let args: IQueryNextInstantiatorValueArgs;

  beforeEach(() => {
    mockQLever = <any> {
      executeQuery: jest.fn().mockResolvedValue({
        message: 'END',
        results: [],
        joinPlan: undefined,
      }),
      getReadyStatus: jest.fn().mockResolvedValue(undefined),
    };

    mockTransformerFragmentedToOriginal = <any> {
      transform: jest.fn().mockImplementation((term: RDF.Term) => term),
    };

    mockTransformerOriginalToFragmented = <any> {
      transform: jest.fn().mockImplementation((term: RDF.Term) => term),
    };

    args = {
      termMappingTransformerFragmentedToOriginal: mockTransformerFragmentedToOriginal,
      termMappingTransformerOriginalToFragmented: mockTransformerOriginalToFragmented,
      transformers: [],
      qLever: mockQLever,
    };

    instance = new QueryNextInstantiatorValue(args);
  });

  describe('getNextQueryInstantiationValues', () => {
    let query: SelectQuery;

    beforeEach(() => {
      query = <SelectQuery> new Parser().parse('SELECT * WHERE { ?s ?p ?o. }');
    });

    it('should return empty instantiation values when query returns no results', async() => {
      mockQLever.executeQuery.mockResolvedValue({ message: 'END', results: []});
      const result = await instance.getNextQueryInstantiationValues(query, { s: [ 'nextVar' ]});
      expect(result.instantiationValues).toEqual({ nextVar: []});
      expect(result.joinPlan).toBeUndefined();
    });

    it('should map output variables to instantiation variables', async() => {
      const binding = new Map([[ 's', DF.namedNode('ex:s1') ]]);
      mockQLever.executeQuery.mockResolvedValue({
        message: 'END',
        results: [ <RDF.Bindings> { get: (v: string) => binding.get(v) } ],
      });

      const result = await instance.getNextQueryInstantiationValues(query, { s: [ 'nextVar' ]});
      expect(result.instantiationValues.nextVar).toHaveLength(1);
    });

    it('should map one output variable to multiple instantiation variables', async() => {
      const binding = new Map([[ 's', DF.namedNode('ex:s1') ]]);
      mockQLever.executeQuery.mockResolvedValue({
        message: 'END',
        results: [ <RDF.Bindings> { get: (v: string) => binding.get(v) } ],
      });

      const result = await instance.getNextQueryInstantiationValues(query, { s: [ 'var1', 'var2' ]});
      expect(result.instantiationValues.var1).toHaveLength(1);
      expect(result.instantiationValues.var2).toHaveLength(1);
    });

    it('should skip bindings where output variable is undefined', async() => {
      mockQLever.executeQuery.mockResolvedValue({
        message: 'END',
        results: [ <RDF.Bindings><unknown> { get: () => undefined } ],
      });

      const result = await instance.getNextQueryInstantiationValues(query, { s: [ 'nextVar' ]});
      expect(result.instantiationValues.nextVar).toHaveLength(0);
    });

    it('should log a warning and return results on timeout', async() => {
      mockQLever.executeQuery.mockResolvedValue({ message: 'TIMEOUT', results: []});
      const result = await instance.getNextQueryInstantiationValues(query, { s: [ 'nextVar' ]});
      expect(result.instantiationValues).toEqual({ nextVar: []});
    });

    it('should apply transformers to results', async() => {
      const transformer = new TermTransformerBiDirectional({
        originalRegex: 'original',
        originalString: 'fragmented',
        fragmentedRegex: 'fragmented',
        fragmentedString: 'original',
      });
      const transformSpy = jest.spyOn(transformer, 'transformOriginalToFragmented')
        .mockImplementation((term: RDF.Term) => DF.namedNode(`${term.value}-transformed`));

      instance = new QueryNextInstantiatorValue({ ...args, transformers: [ transformer ]});

      const binding = new Map([[ 's', DF.namedNode('ex:s1') ]]);
      mockQLever.executeQuery.mockResolvedValue({
        message: 'END',
        results: [ <RDF.Bindings>{ get: (v: string) => binding.get(v) } ],
      });

      const result = await instance.getNextQueryInstantiationValues(query, { s: [ 'nextVar' ]});
      expect(transformSpy).toHaveBeenCalled();
      expect(result.instantiationValues.nextVar[0].value).toBe('ex:s1-transformed');
    });

    it('should translate join plan to fragmented when present', async() => {
      mockQLever.executeQuery.mockResolvedValue({
        message: 'END',
        results: [],
        joinPlan: <any> { operation: '<ex:original>', children: []},
      });

      mockTransformerOriginalToFragmented.transform.mockImplementation(
        (term: RDF.Term) => DF.namedNode(term.value.replace('original', 'fragmented')),
      );

      const result = await instance.getNextQueryInstantiationValues(query, {});
      expect(result.joinPlan).toBeDefined();
      expect(result.joinPlan!.operation).toContain('fragmented');
    });

    it('should recursively translate nested join plan children', async() => {
      mockQLever.executeQuery.mockResolvedValue({
        message: 'END',
        results: [],
        joinPlan: <any> {
          operation: '<ex:parent>',
          children: [
            <any>{ operation: '<ex:child>', children: []},
          ],
        },
      });
      const transformer = new TermTransformerBiDirectional({
        originalRegex: 'child',
        originalString: 'child',
        fragmentedRegex: 'grandchild',
        fragmentedString: 'grandchild',
      });

      instance = new QueryNextInstantiatorValue({ ...args, transformers: [ transformer ]});

      const result = await instance.getNextQueryInstantiationValues(query, {});
      expect(result.joinPlan!.children).toHaveLength(1);
      expect(result.joinPlan!.children).toEqual([
        { operation: '<ex:grandchild>', children: []},
      ]);
    });

    it('should recursively translate nested join plan children', async() => {
      mockQLever.executeQuery.mockResolvedValue({
        message: 'END',
        results: [],
        joinPlan: <any> {
          operation: '<ex:parent>',
          children: [
            <any>{ operation: '<ex:child>', children: []},
          ],
        },
      });

      const result = await instance.getNextQueryInstantiationValues(query, {});
      expect(result.joinPlan!.children).toHaveLength(1);
    });
  });

  describe('getQLeverReadyStatus', () => {
    it('should delegate to qLever.getReadyStatus', async() => {
      await instance.getQLeverReadyStatus();
      expect(mockQLever.getReadyStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('transformQuery', () => {
    it('should throw when query is not a SELECT query', () => {
      const constructQuery = new Parser().parse('CONSTRUCT WHERE { ?s ?p ?o. }');
      expect(() => (<any>instance).transformQuery(constructQuery, []))
        .toThrow('Only instantiations of SELECT queries are supported');
    });

    it('should add required select variables not already in query', () => {
      const selectQuery = <SelectQuery> new Parser().parse('SELECT ?s WHERE { ?s ?p ?o. }');
      const result = (<any>instance).transformQuery(selectQuery, [ 'p', 'o' ]);
      const varNames = result.variables.map((v: any) => v.value);
      expect(varNames).toContain('p');
      expect(varNames).toContain('o');
    });

    it('should not duplicate variables already in SELECT', () => {
      const selectQuery = <SelectQuery> new Parser().parse('SELECT ?s WHERE { ?s ?p ?o. }');
      const result = (<any>instance).transformQuery(selectQuery, [ 's' ]);
      const varNames = result.variables.map((v: any) => v.value);
      expect(varNames.filter((v: string) => v === 's')).toHaveLength(1);
    });

    it('should not modify variables when query uses wildcard', () => {
      const selectQuery = <SelectQuery> new Parser().parse('SELECT * WHERE { ?s ?p ?o. }');
      const result = (<any>instance).transformQuery(selectQuery, [ 'newVar' ]);
      expect(result.variables).toHaveLength(1);
    });

    it('should transform NamedNode terms via transformers', () => {
      mockTransformerFragmentedToOriginal.transform.mockImplementation(
        (term: RDF.Term) => DF.namedNode(`${term.value}-orig`),
      );

      const transformer = new TermTransformerBiDirectional({
        originalRegex: 'orig',
        originalString: 'orig',
        fragmentedRegex: 'frag',
        fragmentedString: 'frag',
      });

      const spy = jest.spyOn(transformer, 'transformFragmentedToOriginal');

      instance = new QueryNextInstantiatorValue({
        ...args,
        transformers: [ transformer ],
      });

      const query = new Parser().parse(`
        SELECT * WHERE { ?s <http://frag.org/p> ?o. }
      `) as SelectQuery;

      const result = (<any>instance).transformQuery(query, []);

      expect(mockTransformerFragmentedToOriginal.transform).toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();
      expect(result.where[0].triples[0].predicate.value).toBe('http://orig.org/p-orig');
    });

    it('should transform property paths via transformTerm', () => {
      const spy = jest.spyOn(<any>instance, 'transformPropertyPath');

      const query = new Parser().parse(`
        SELECT * WHERE { ?s <http://ex.org/p>/<http://ex.org/q> ?o. }
      `) as SelectQuery;

      (<any>instance).transformQuery(query, []);

      expect(spy).toHaveBeenCalled();
    });

    it('should return term unchanged for non-NamedNode, non-PropertyPath', () => {
      const query = new Parser().parse(`
        SELECT * WHERE { 
          ?s ?p ?o .
          FILTER(?o = "test")
        }
      `) as SelectQuery;

      const result = (<any>instance).transformQuery(query, []);

      expect(result).toBeDefined();
    });
    it('should call transformFragmentedToOriginalRaw for prefixes', () => {
      const transformer = new TermTransformerBiDirectional({
        originalRegex: 'original',
        originalString: 'original',
        fragmentedRegex: 'fragmented',
        fragmentedString: 'fragmented',
      });

      const spy = jest.spyOn(transformer, 'transformFragmentedToOriginalRaw');

      instance = new QueryNextInstantiatorValue({
        ...args,
        transformers: [ transformer ],
      });

      const query = new Parser().parse(`
        PREFIX ex: <http://fragmented.org/>
        SELECT * WHERE { ?s ?p ?o. }
      `) as SelectQuery;

      const expectedQuery = new Parser().parse(`
        PREFIX ex: <http://original.org/>
        SELECT * WHERE { ?s ?p ?o. }
      `) as SelectQuery;

      const result = (<any>instance).transformQuery(query, []);

      expect(spy).toHaveBeenCalled();
      expect(result).toEqual(expectedQuery);
    });

    it('should transform GROUP BY expressions', () => {
      const query = new Parser().parse(`
        SELECT ?s WHERE { ?s ?p ?o. } GROUP BY ?s
      `) as SelectQuery;

      const result = (<any>instance).transformQuery(query, []);
      expect(result.group).toBeDefined();
    });
    it('should transform query with term in variables', () => {
      const transformer = new TermTransformerBiDirectional({
        originalRegex: 'original',
        originalString: 'original',
        fragmentedRegex: 'fragmented',
        fragmentedString: 'fragmented',
      });

      const spy = jest.spyOn(transformer, 'transformFragmentedToOriginalRaw');

      const query = <SelectQuery> new Parser().parse(`
      SELECT ?s ( IRI( CONCAT(str( <https://fragmented/> ), str(?o) )) as ?me )
        WHERE {
        ?s ?p ?o 
        } limit 5
      `);
      const expectedQuery = <SelectQuery> new Parser().parse(`
      SELECT ?s ( IRI( CONCAT(str( <https://original/> ), str(?o) )) as ?me )
        WHERE {
        ?s ?p ?o 
        } limit 5
      `);

      instance = new QueryNextInstantiatorValue({
        ...args,
        transformers: [ transformer ],
      });
      const result = (<any>instance).transformQuery(query, []);
      expect(result).toEqual(expectedQuery);
    });
  });
});

describe('TermTransformerBiDirectional', () => {
  let transformer: TermTransformerBiDirectional;
  const DF = new DataFactory();

  beforeEach(() => {
    transformer = new TermTransformerBiDirectional({
      originalRegex: 'http://original\\.org',
      originalString: 'http://original.org',
      fragmentedRegex: 'http://fragmented\\.org',
      fragmentedString: 'http://fragmented.org',
    });
  });

  describe('transformOriginalToFragmented', () => {
    it('should transform a NamedNode from original to fragmented', () => {
      const term = DF.namedNode('http://original.org/resource');
      const result = transformer.transformOriginalToFragmented(term);
      expect(result.value).toBe('http://fragmented.org/resource');
    });

    it('should not transform non-NamedNode terms', () => {
      const term = DF.literal('hello');
      const result = transformer.transformOriginalToFragmented(term);
      expect(result).toBe(term);
    });
  });

  describe('transformFragmentedToOriginal', () => {
    it('should transform a NamedNode from fragmented to original', () => {
      const term = DF.namedNode('http://fragmented.org/resource');
      const result = transformer.transformFragmentedToOriginal(term);
      expect(result.value).toBe('http://original.org/resource');
    });

    it('should not transform non-NamedNode terms', () => {
      const term = DF.literal('hello');
      const result = transformer.transformFragmentedToOriginal(term);
      expect(result).toBe(term);
    });
  });

  describe('transformFragmentedToOriginalRaw', () => {
    it('should replace fragmented string with original in raw string', () => {
      const result = transformer.transformFragmentedToOriginalRaw('http://fragmented.org/resource');
      expect(result).toBe('http://original.org/resource');
    });
  });

  describe('transformOriginalToFragmentedRaw', () => {
    it('should replace original string with fragmented in raw string', () => {
      const result = transformer.transformOriginalToFragmentedRaw('http://original.org/resource');
      expect(result).toBe('http://fragmented.org/resource');
    });
  });
});
