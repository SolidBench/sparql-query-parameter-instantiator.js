import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import type { Literal } from '@rdfjs/types';
import * as yaml from 'js-yaml';

// Adjust import path
import { QLeverInstance } from '../../lib/sequence/QLeverInstance';

// Adjust import path

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
global.fetch = mockFetch;

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

    (os.tmpdir as jest.Mock).mockReturnValue('/tmp');
    (fs.promises.mkdtemp as jest.Mock).mockResolvedValue('/tmp/qlever-run-123');
    (fs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.promises.rm as jest.Mock).mockResolvedValue(undefined);
    (yaml.dump as jest.Mock).mockReturnValue('mock-yaml-content');

    mockSpawnEventOn = jest.fn((event, cb) => {
      if (event === 'close') {
        cb(0);
      }
    });
    (spawn as jest.Mock).mockReturnValue({ on: mockSpawnEventOn });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initialization and Lifecycle', () => {
    it('starts successfully and reaches a healthy state', async() => {
      mockFetch.mockResolvedValue({ status: 200 });

      const instance = new QLeverInstance(instanceArgs);
      await instance.getReadyStatus();

      expect(fs.promises.mkdtemp).toHaveBeenCalled();
      // Qleverfile and docker-compose.yml
      expect(fs.promises.writeFile).toHaveBeenCalledTimes(2);
      expect(spawn).toHaveBeenCalledWith('docker', [ 'volume', 'create', expect.any(String) ], expect.any(Object));
      expect(spawn).toHaveBeenCalledWith('docker', [ 'compose', 'up', '-d' ], expect.any(Object));
    });

    it('throws and stops if startup fails', async() => {
      (fs.promises.mkdtemp as jest.Mock).mockRejectedValue(new Error('FS Error'));

      const instance = new QLeverInstance(instanceArgs);

      await expect(instance.getReadyStatus()).rejects.toThrow('FS Error');
    });

    it('waits for healthy state with retries', async() => {
      // Fail first fetch, succeed second
      mockFetch
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValueOnce({ status: 200 });

      const instance = new QLeverInstance(instanceArgs);

      // Advance timers to trigger the retry in `waitForHealthy`
      const readyPromise = instance.getReadyStatus();
      await jest.advanceTimersByTimeAsync(500);

      await expect(readyPromise).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws error if server does not become healthy within timeout', async() => {
      mockFetch.mockRejectedValue(new Error('Network Error'));

      const instance = new QLeverInstance(instanceArgs);

      expect(instance.getReadyStatus())
        .rejects.toThrow('QLever failed to start within 60 seconds. Check docker logs');

      await jest.advanceTimersByTimeAsync(60000);
    });

    it('stops gracefully and removes temporary directories', async() => {
      mockFetch.mockResolvedValue({ status: 200 });
      const instance = new QLeverInstance(instanceArgs);
      await instance.getReadyStatus();

      await instance.stop();

      expect(spawn).toHaveBeenCalledWith('docker', [ 'compose', 'down' ], expect.any(Object));
      expect(fs.promises.rm).toHaveBeenCalledWith('/tmp/qlever-run-123', { recursive: true, force: true });
    });

    it('handles process signals correctly', async() => {
      mockFetch.mockResolvedValue({ status: 200 });
      const processOnSpy = jest.spyOn(process, 'on');
      const processOffSpy = jest.spyOn(process, 'off');

      const instance = new QLeverInstance(instanceArgs);
      await instance.getReadyStatus();

      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));

      await instance.stop();

      expect(processOffSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    });

    it('throws error when docker command fails', async() => {
      mockSpawnEventOn.mockImplementation((event, cb) => {
        if (event === 'close') {
          cb(1);
        } // Exit code 1 (error)
      });
      const instance = new QLeverInstance(instanceArgs);
      await expect(instance.getReadyStatus()).rejects.toThrow('Command docker failed with code 1');
    });
  });

  describe('executeQuery', () => {
    let instance: QLeverInstance;

    beforeEach(async() => {
      mockFetch.mockResolvedValue({ status: 200 });
      instance = new QLeverInstance(instanceArgs);
      await instance.getReadyStatus();
      mockFetch.mockClear();
    });

    it('executes query and parses different RDF terms correctly', async() => {
      const mockResult = {
        selected: [ '?s', '?p', '?o', '?lang', '?type' ],
        res: [
          [
            '<a>', // Named Node
            '_:b1', // Blank Node
            '"string"', // Literal
            '"bonjour"@fr', // Language Literal
            '"42"^^<http://www.w3.org/2001/XMLSchema#integer>', // Typed Literal
          ],
          [ null, null, null, null, null ], // Handle nulls gracefully
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

      // Verify parsed term structures via bindings factory results
      const firstRow = result.results[0];
      expect(firstRow.get('s')?.termType).toBe('NamedNode');
      expect(firstRow.get('p')?.termType).toBe('BlankNode');
      expect(firstRow.get('o')?.termType).toBe('Literal');
      expect((<Literal> firstRow.get('lang'))?.language).toBe('fr');
      expect((firstRow.get('type') as any)?.datatype?.value).toBe('http://www.w3.org/2001/XMLSchema#integer');

      // Verify JoinTree extraction bypassing the 'Filter' node
      expect(result.joinPlan?.operation).toBe('Join (s)');
      expect(result.joinPlan?.children[0].operation).toBe('Scan (s, p, o)');
      expect(result.joinPlan?.children[1].operation).toBe('Scan (s, o)'); // Filter bypassed
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
