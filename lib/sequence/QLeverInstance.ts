import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import type * as RDF from '@rdfjs/types';
import * as yaml from 'js-yaml';
import { DataFactory } from 'rdf-data-factory';
import { SparqlJsonParser } from 'sparqljson-parse';
import type { Logger } from 'winston';
import { logger } from '../logging/logger';
import type { IQueryExecutionResult } from './QueryNextInstantiationValue';

/**
 * TODO: This class should be modular, where we use a IQueryEngine interface to define
 * the required behavior of a query engine and then let QLeverInstance be an implementation
 * of this interface.
 */
const DF = new DataFactory();
const BF = new BindingsFactory(DF, {});

export class QLeverInstance {
  protected imageName: string;
  protected dataLocations: string[];
  protected port: number;
  protected volumeName: string;
  protected timeout: number;

  protected sparqlJsonParser: SparqlJsonParser;

  private runDir: string | null = null;
  private isShuttingDown = false;

  private readonly ready: Promise<void>;

  private readonly log: Logger;

  public constructor(args: IQLeverInstanceArgs) {
    this.log = logger.child({ module: 'QLeverInstance' });
    this.imageName = args.imageName;
    this.dataLocations = args.dataLocations;
    this.port = args.port;
    this.timeout = args.timeout;

    // Parser for application/sparql-results+json output format
    this.sparqlJsonParser = new SparqlJsonParser({ dataFactory: DF });

    // Generate unique identifiers to isolate this instance
    const id = Date.now().toString().slice(-6);
    this.volumeName = `qlever-index-${id}`;

    this.stop = this.stop.bind(this);

    // Start the background setup
    this.ready = this.start().catch((err) => {
      this.log.error('Fatal startup error', { error: err });
      this.stop().catch(() => {});
      throw err;
    });
  }

  public async executeQuery(query: string): Promise<IQueryExecutionResult> {
    await this.ready;

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeout * 1000);

    try {
      const response = await fetch(`http://localhost:${this.port}`, {
        method: 'POST',
        headers: {
          // eslint-disable-next-line ts/naming-convention
          'Content-Type': 'application/sparql-query',
          // eslint-disable-next-line ts/naming-convention
          Accept: 'application/sparql-results+json',
        },
        body: query,
        signal: controller.signal,
      });

      if (!response.ok) {
        this.log.error('Error response from QLever.', { response: await response.json() });
        return {
          message: 'TIMEOUT',
          results: [],
        };
      }
      const jsonResult = await response.json();

      // Map the bindings array to RDF Terms
      const bindings: Record<string, RDF.Term>[] =
        this.sparqlJsonParser.parseJsonResults(jsonResult);
      const result = bindings.map(bindingRecord =>
      // Example: { messageId: Literal, message: NamedNode, ... }
      // Simply pass it to whatever format you need downstream
        BF.fromRecord(bindingRecord));

      return {
        message: 'END',
        results: result,
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { message: 'TIMEOUT', results: []};
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  public async start(): Promise<void> {
    // Create temporary directory for the indexes and data
    this.runDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'qlever-run-'));

    // If the user hits Ctrl+C, we shut down the container before exiting node
    process.on('SIGINT', this.handleSignal);
    process.on('SIGTERM', this.handleSignal);

    try {
      // Generate Qleverfile and write to temporary file path
      const internalFilePaths = this.dataLocations.map((loc, idx) => `../input/file_${idx}.ttl`);
      const qleverfileContent = `
[data]
NAME = my-index
DESCRIPTION = QLever Index
[index]
INPUT_FILES = ${internalFilePaths.join(' ')}
CAT_INPUT_FILES = cat ${internalFilePaths.join(' ')}
SETTINGS_JSON = { "ascii-prefixes-only": false, "num-triples-per-batch": 1000000 }
USE_PATTERNS = yes
TEXT_INDEX = from_literals
[server]
PORT = 7001
MEMORY_FOR_QUERIES = 5G
TIMEOUT = 30s
ACCESS_TOKEN = test
`.trim();

      await fs.promises.writeFile(path.join(this.runDir, 'Qleverfile'), qleverfileContent);

      const volumes = this.dataLocations.map((loc, idx) =>
        `${path.resolve(loc)}:/input/file_${idx}.ttl:ro`);
      volumes.push(`./Qleverfile:/data/Qleverfile:ro`);
      volumes.push(`${this.volumeName}:/data`);

      // Generate docker-compose.yml used to run the indexing
      const composeConfig = {
        services: {
          qlever: {
            image: `${this.imageName}`,
            // eslint-disable-next-line ts/naming-convention
            container_name: `qlever-${this.port}`,
            user: `root`,
            ports: [ `${this.port}:7001` ],
            volumes,
            // eslint-disable-next-line ts/naming-convention
            working_dir: '/data',
            entrypoint: [ '/bin/sh', '-c' ],
            command: [
              `
              # Debug check (optional)
              ls -la /data/Qleverfile
              
              if [ ! -f /data/my-index.index.bin ]; then
                echo "[QLever-Auto] Index missing. Indexing now..."
                qlever index --system native
              else
                echo "[QLever-Auto] Index found. Skipping build."
              fi
              echo "[QLever-Auto] Starting Server..."
              qlever start --system native --access-token test --run-in-foreground
              `,
            ],
          },
        },
        volumes: {
          [this.volumeName]: { external: true },
        },
      };

      await fs.promises.writeFile(
        path.join(this.runDir, 'docker-compose.yml'),
        yaml.dump(composeConfig),
      );

      await this.ensureVolumeExists(this.volumeName);

      try {
        await this.runCommand('docker', [ 'rm', '-f', `qlever-${this.port}` ], this.runDir);
      } catch {}

      this.log.info('Starting Docker Compose...');
      await this.runCommand('docker', [ 'compose', 'up', '-d' ], this.runDir);

      this.log.info('Waiting for server to accept connections...');
      await this.waitForHealthy();
      this.log.info(`Ready at http://localhost:${this.port}`);
    } catch (error) {
      this.log.error('Startup failed. Cleaning up...');
      await this.stop();
      throw error;
    }
  }

  /**
   * Stops the container and removes the temporary directory.
   */
  public async stop(): Promise<void> {
    if (this.isShuttingDown || !this.runDir) {
      return;
    }
    this.isShuttingDown = true;

    this.log.info('Shutting down...');

    try {
      // First stop the running compose in the temporary directory
      await this.runCommand('docker', [ 'compose', 'down' ], this.runDir);

      // Then clean files
      await fs.promises.rm(this.runDir, { recursive: true, force: true });
      this.log.info('Shutdown complete.');
    } catch (e) {
      this.log.error('Error during shutdown:', { error: e });
    } finally {
      this.runDir = null;
      // Remove stop listeners
      process.off('SIGINT', this.handleSignal);
      process.off('SIGTERM', this.handleSignal);
    }
  }

  /**
   * Polls the server untill it responds
   * @param timeoutMs How long to keep trying to ping the server
   * @returns void
   */
  private async waitForHealthy(timeoutMs = 60000): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`http://localhost:${this.port}/`, { method: 'GET' });

        if (res.status >= 200 && res.status < 500) {
          return;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 500));
    }

    throw new Error(`QLever failed to start within ${timeoutMs / 1000} seconds. Check docker logs.`);
  }

  private readonly handleSignal: () => void = async() => {
    await this.stop();
    throw new Error('QLeverInstance stopped due to signal.');
  };

  private async ensureVolumeExists(volName: string): Promise<void> {
    try {
      await this.runCommand('docker', [ 'volume', 'create', volName ], '.');
    } catch {}
  }

  private runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: false });
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command ${cmd} failed with code ${code}`));
        }
      });
    });
  }

  public getReadyStatus(): Promise<void> {
    return this.ready;
  }
}

export interface IQLeverInstanceArgs {
  /**
   * Name of the image used to run QLever
   */
  imageName: string;
  /**
   * Filelocations of the data to be queried
   */
  dataLocations: string[];
  /**
   * Port QLever will listen on
   */
  port: number;
  /**
   * Query timeout in seconds
   */
  timeout: number;
}
