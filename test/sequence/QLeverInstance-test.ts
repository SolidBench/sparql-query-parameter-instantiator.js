import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Literal } from '@rdfjs/types';
import * as yaml from 'js-yaml';

// Adjust import path
import { QLeverInstance } from '../../lib/sequence/QLeverInstance';

// --- Mocks ---
jest.mock('node:child_process');
jest.mock('node:os');
jest.mock('js-yaml');
jest.mock('node:fs', () => ({
  promises: {
    mkdtemp: jest.fn(),
    writeFile: jest.fn(),
    rm: jest.fn(),
  },
}));

jest.mock('../../lib/logging/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

describe('QLeverInstance', () => {
  let instanceArgs: any;
  let mockSpawnEventOn: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    instanceArgs = {
      imageName: 'adfreiburg/qlever',
      dataLocations: [ '/data/test.ttl' ],
      port: 7001,
      timeout: 30,
    };

    (<jest.Mock> os.tmpdir).mockReturnValue('/tmp');
    (<jest.Mock> fs.promises.mkdtemp).mockResolvedValue('/tmp/qlever-run-123');
    (<jest.Mock> fs.promises.writeFile).mockResolvedValue(undefined);
    (<jest.Mock>fs.promises.rm).mockResolvedValue(undefined);
    (<jest.Mock> yaml.dump).mockReturnValue('mock-yaml-content');

    mockSpawnEventOn = jest.fn((event, cb) => {
      if (event === 'close') {
        cb(0);
      }
    });
    (<jest.Mock> spawn).mockReturnValue({ on: mockSpawnEventOn });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initialization and Lifecycle', () => {
    it('starts successfully and reaches a healthy state', async() => {
      mockFetch.mockResolvedValue({ status: 200, ok: true });

      const instance = new QLeverInstance(instanceArgs);
      await instance.getReadyStatus();

      expect(fs.promises.mkdtemp).toHaveBeenCalledWith(path.join(os.tmpdir(), 'qlever-run-'));
      expect(fs.promises.writeFile).toHaveBeenCalledTimes(2);
      expect(spawn).toHaveBeenCalledWith('docker', [ 'volume', 'create', expect.any(String) ], expect.any(Object));
      expect(spawn).toHaveBeenCalledWith('docker', [ 'compose', 'up', '-d' ], expect.any(Object));
    });

    it('throws and stops if startup fails', async() => {
      (<jest.Mock> fs.promises.mkdtemp).mockRejectedValue(new Error('FS Error'));

      const instance = new QLeverInstance(instanceArgs);

      await expect(instance.getReadyStatus()).rejects.toThrow('FS Error');
    });

    it('swallows errors thrown by stop() during a fatal startup error', async() => {
      const startupError = new Error('FS Error');
      (<jest.Mock> fs.promises.mkdtemp).mockRejectedValueOnce(startupError);

      const stopSpy = jest.spyOn(QLeverInstance.prototype, 'stop').mockRejectedValueOnce(new Error('Stop Error'));

      const instance = new QLeverInstance(instanceArgs);

      // Await the ready status. It should reject with the ORIGINAL startup error,
      await expect(instance.getReadyStatus()).rejects.toThrow('FS Error');

      expect(stopSpy).toHaveBeenCalledTimes(1);

      stopSpy.mockRestore();
    });

    it('waits for healthy state with retries', async() => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValueOnce({ status: 200, ok: true });

      const instance = new QLeverInstance(instanceArgs);

      const readyPromise = instance.getReadyStatus();

      await jest.advanceTimersByTimeAsync(500);

      await expect(readyPromise).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws error if server does not become healthy within timeout', async() => {
      mockFetch.mockRejectedValue(new Error('Network Error'));

      const instance = new QLeverInstance(instanceArgs);

      const readyPromise = instance.getReadyStatus();

      readyPromise.catch(() => {});

      await jest.advanceTimersByTimeAsync(60000);

      // The promise already knows it rejected, so Jest just inspects the result.
      await expect(readyPromise)
        .rejects.toThrow('QLever failed to start within 60 seconds. Check docker logs');
    });

    it('stops gracefully and removes temporary directories', async() => {
      mockFetch.mockResolvedValue({ status: 200, ok: true });
      const instance = new QLeverInstance(instanceArgs);
      await instance.getReadyStatus();

      await instance.stop();

      expect(spawn).toHaveBeenCalledWith('docker', [ 'compose', 'down' ], expect.any(Object));
      expect(fs.promises.rm).toHaveBeenCalledWith('/tmp/qlever-run-123', { recursive: true, force: true });
    });

    it('handles process signals correctly', async() => {
      mockFetch.mockResolvedValue({ status: 200, ok: true });
      const processOnSpy = jest.spyOn(process, 'on');
      const processOffSpy = jest.spyOn(process, 'off');

      const instance = new QLeverInstance(instanceArgs);
      await instance.getReadyStatus();

      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      await instance.stop();
      expect(processOffSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    });

    it('throws error when critical docker commands fail', async() => {
      (<jest.Mock> spawn).mockImplementation((cmd, args) => ({
        on: (event: string, cb: Function) => {
          if (event === 'close') {
            // Fail `docker compose up` to trigger startup rejection
            if (args.includes('compose') && args.includes('up')) {
              cb(1);
            } else {
              cb(0);
            }
          }
        },
      }));
      const instance = new QLeverInstance(instanceArgs);
      await expect(instance.getReadyStatus()).rejects.toThrow('Command docker failed with code 1');
    });

    it('ignores non-critical docker errors during setup', async() => {
      mockFetch.mockResolvedValue({ status: 200, ok: true });
      (<jest.Mock> spawn).mockImplementation((cmd, args) => ({
        on: (event: string, cb: Function) => {
          if (event === 'close') {
            // Fail 'rm' and 'volume create', which are wrapped in silent catches
            if (args.includes('rm') || args.includes('volume')) {
              cb(1);
            } else {
              cb(0);
            }
          }
        },
      }));

      const instance = new QLeverInstance(instanceArgs);
      // Fails silently, reaches healthy state
      await expect(instance.getReadyStatus()).resolves.toBeUndefined();
    });

    it('logs errors silently during shutdown', async() => {
      mockFetch.mockResolvedValue({ status: 200, ok: true });
      const instance = new QLeverInstance(instanceArgs);
      await instance.getReadyStatus();

      // Force failure on shutdown
      (<jest.Mock> spawn).mockImplementation(() => ({
        on: (event: string, cb: Function) => {
          if (event === 'close') {
            cb(1);
          }
        },
      }));

      // Test passes if it resolves without throwing
      await expect(instance.stop()).resolves.toBeUndefined();
    });

    it('stops when handleSignal is called and throws', async() => {
      const instance = new QLeverInstance(instanceArgs);
      const stopSpy = jest.spyOn(instance, 'stop').mockResolvedValue();

      await expect((<any> instance).handleSignal())
        .rejects.toThrow('QLeverInstance stopped due to signal.');

      expect(stopSpy).toHaveBeenCalledWith();
    });
  });

  describe('executeQuery', () => {
    let instance: QLeverInstance;

    beforeEach(async() => {
      mockFetch.mockResolvedValue({ status: 200, ok: true });
      instance = new QLeverInstance(instanceArgs);
      await instance.getReadyStatus();
      mockFetch.mockClear();
    });

    it('executes query and parses different RDF terms correctly', async() => {
      const mockResult = {
        selected: [ '?s', '?p', '?o', '?lang', '?type' ],
        res: [
          [
            '<a>',
            '_:b1',
            '"string"',
            '"bonjour"@fr',
            '"42"^^<http://www.w3.org/2001/XMLSchema#integer>',
          ],
          [ null, null, null, null, null ],
        ],
        runtimeInformation: {
          query_execution_tree: {
            description: 'Join (s)',
            operation_time: 10,
            result_rows: 1,
            estimated_operation_cost: 5,
            estimated_size: 1,
            children: [
              { description: 'Scan (s, p, o)' },
              {
                description: 'Filter (o > 0)',
                children: [{ description: 'Scan (s, o)' }],
              },
            ],
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResult),
      });

      const result = await instance.executeQuery('SELECT * WHERE { ?s ?p ?o }');

      expect(result.message).toBe('END');
      expect(result.results).toHaveLength(2);

      const firstRow = result.results[0];
      expect(firstRow.get('s')?.termType).toBe('NamedNode');
      expect(firstRow.get('p')?.termType).toBe('BlankNode');
      expect(firstRow.get('o')?.termType).toBe('Literal');
      expect((<Literal> firstRow.get('lang'))?.language).toBe('fr');
      expect((<any>firstRow.get('type'))?.datatype?.value).toBe('http://www.w3.org/2001/XMLSchema#integer');
    });

    it('handles query execution tree edge cases and simple text parameters', async() => {
      const mockResult = {
        selected: [ '?a', '?b' ],
        res: [
          [ '"plain"', 'bareword' ],
        ],
        runtimeInformation: {
          query_execution_tree: {
            description: 'Filter (empty)',
            children: [],
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResult),
      });

      const result = await instance.executeQuery('SELECT * WHERE { ?a ?b }');

      const firstRow = result.results[0];
      expect(firstRow.get('a')?.termType).toBe('Literal');
      expect(firstRow.get('a')?.value).toBe('plain');
      expect(firstRow.get('b')?.termType).toBe('Literal');
      expect(firstRow.get('b')?.value).toBe('bareword');
    });

    it('handles missing selected and variables without ? prefix', async() => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          // Selected is missing → fallback to []
          res: [[]],
          runtimeInformation: { query_execution_tree: null },
        }),
      });

      const result = await instance.executeQuery('SELECT *');

      expect(result.results).toHaveLength(1);
    });

    it('handles variables without leading ?', async() => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          selected: [ 'a', 'b' ], // No '?'
          res: [[ '"x"', '"y"' ]],
          runtimeInformation: { query_execution_tree: null },
        }),
      });

      const result = await instance.executeQuery('SELECT *');

      const row = result.results[0];
      expect(row.get('a')?.value).toBe('x');
      expect(row.get('b')?.value).toBe('y');
    });

    it('handles empty res json', async() => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          runtimeInformation: { query_execution_tree: null },
        }),
      });

      const result = await instance.executeQuery('SELECT *');
      expect(result).toEqual(
        {
          message: 'END',
          results: [],
        },
      );
    });

    it('aborts the controller and returns TIMEOUT when the timer expires', async() => {
      const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

      // Mock fetch to hang indefinitely, but respond to the abort signal
      mockFetch.mockImplementationOnce((url, options) => {
        return new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const error = new Error('AbortError');
            error.name = 'AbortError';
            reject(error);
          });
        });
      });
      const executePromise = instance.executeQuery('SELECT *');
      await jest.advanceTimersByTimeAsync(instanceArgs.timeout * 1000);
      await executePromise;
      expect(abortSpy).toHaveBeenCalledTimes(1);
      abortSpy.mockRestore();
    });

    it('returns TIMEOUT if response is not ok', async() => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: jest.fn().mockResolvedValue({ error: 'bad request' }),
      });

      const result = await instance.executeQuery('INVALID QUERY');
      expect(result.message).toBe('TIMEOUT');
      expect(result.results).toEqual([]);
    });

    it('returns TIMEOUT on AbortError', async() => {
      const abortError = new Error('AbortError');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await instance.executeQuery('SELECT *');
      expect(result.message).toBe('TIMEOUT');
    });

    it('throws generic errors during execution', async() => {
      mockFetch.mockRejectedValueOnce(new Error('Fatal Network Error'));
      await expect(instance.executeQuery('SELECT *')).rejects.toThrow('Fatal Network Error');
    });
  });
});
