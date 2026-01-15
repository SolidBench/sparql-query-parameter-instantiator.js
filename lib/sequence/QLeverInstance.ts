import type * as RDF from '@rdfjs/types';
import * as path from 'path';
import * as fs from 'fs';
import { IQueryExecutionResult } from './QueryNextInstantiationValue';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { spawn } from 'child_process';
import { DataFactory } from 'rdf-data-factory';
import { BindingsFactory } from '@comunica/utils-bindings-factory';


const DF = new DataFactory();
const BF = new BindingsFactory(DF, {});

export class QLeverInstance {
  protected imageName: string;
  protected dataLocations: string[];
  protected port: number;
  protected volumeName: string;
  protected timeout: number;

  private runDir: string | null = null;
  private isShuttingDown = false;

  private ready: Promise<void>;

  public constructor(args: IQLeverInstanceArgs){
    this.imageName = args.imageName;
    this.dataLocations = args.dataLocations;
    this.port = args.port;
    this.timeout = args.timeout;

    // Generate unique identifiers to isolate this instance
    const id = Date.now().toString().slice(-6);
    this.volumeName = `qlever-index-${id}`;

    this.stop = this.stop.bind(this);

    // Start the background setup
    this.ready = this.start().catch(err => {
      console.error(`[QLever] Fatal startup error:`, err);
      // Clean up if we failed halfway through
      this.stop().catch(() => {}); 
      throw err;
    });
  }

  /**
   * Execute SPARQL Query
   */
  public async executeQuery(query: string): Promise<IQueryExecutionResult> {
    await this.ready;

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeout * 1000);

    try {
      const response = await fetch(`http://localhost:${this.port}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sparql-query',
          'Accept': 'application/json',
        },
        body: query,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`QLever HTTP Error: ${response.status} ${response.statusText}`);
      }

      const rawResults: Record<string, Record<string, any>>[] = (await response.json()).results.bindings; 
      const result = rawResults.map(result => {
        const resultRecord: Record<string, RDF.Term> = {}
        for (const [variable, value] of Object.entries(result)){
          if (value.type === 'uri'){
            resultRecord[variable] = DF.namedNode(value.value);
          } 
          else if (value.type === 'literal'){
            resultRecord[variable] = DF.literal(value.value, value.datatype);
          }
          else {
            throw new Error(`Unknown type when constructing bindings: ${value.type}`);
          }
        }
        return BF.fromRecord(resultRecord);
      });
      return { message: 'END', results: result };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { message: 'TIMEOUT', results: [] };
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  public async start(): Promise<void> {
    // Create temporary directory for the indexes and data
    this.runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qlever-run-'));

    // If the user hits Ctrl+C, we shut down the container before exiting node
    process.on('SIGINT', this.handleSignal);
    process.on('SIGTERM', this.handleSignal);

    try {
      // Generate Qleverfile and write to temporary file path
      const internalFilePaths = this.dataLocations.map((_, idx) => `../input/file_${idx}.ttl`);
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

      fs.writeFileSync(path.join(this.runDir, 'Qleverfile'), qleverfileContent);

      const volumes = this.dataLocations.map((loc, idx) => `${path.resolve(loc)}:/input/file_${idx}.ttl:ro`);
      volumes.push(`./Qleverfile:/data/Qleverfile:ro`);
      volumes.push(`${this.volumeName}:/data`);

      // Generate docker-compose.yml used to run the indexing
      const composeConfig = {
        services: {
          qlever: {
            image: `${this.imageName}`,
            container_name: `qlever-${this.port}`,
            user: `root`,
            ports: [`${this.port}:7001`],
            volumes: volumes,
            
            working_dir: '/data', 
            
            entrypoint: ['/bin/sh', '-c'],
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
              `
            ]
          }
        },
        volumes: {
          [this.volumeName]: { external: true }
        }
      };

      fs.writeFileSync(path.join(this.runDir, 'docker-compose.yml'), yaml.dump(composeConfig));

      await this.ensureVolumeExists(this.volumeName);

      try {
        await this.runCommand('docker', ['rm', '-f', `qlever-${this.port}`], this.runDir);
      } catch (e) {}
      console.log('[QLever] Starting Docker Compose...');

      // We do NOT use -d (detached) here if we want to pipe logs to the main process,
      // but usually -d is better for stability, so we keep -d and just wait.
      await this.runCommand('docker', ['compose', 'up', '-d'], this.runDir);
      
      console.log('[QLever] Waiting for server to accept connections...');
      await this.waitForHealthy();
      console.log(`[QLever] Ready at http://localhost:${this.port}`);

    } catch (error) {
      console.error('[QLever] Startup failed. Cleaning up...');
      await this.stop();
      throw error;
    }
  }

  /**
   * Stops the container and removes the temporary directory.
   */
  public async stop(): Promise<void> {
    if (this.isShuttingDown || !this.runDir) return;
    this.isShuttingDown = true;

    console.log('[QLever] Shutting down...');

    try {
      // 1. Stop Docker Compose
      // We look for the docker-compose.yml in the temp dir we created
      await this.runCommand('docker', ['compose', 'down'], this.runDir);
      
      // Cleanup Temp Files
      fs.rmSync(this.runDir, { recursive: true, force: true });
      console.log('[QLever] Shutdown complete.');
    } catch (e) {
      console.error('[QLever] Error during shutdown:', e);
    } finally {
      this.runDir = null;
      // Remove listeners so they don't fire again if the process continues
      process.off('SIGINT', this.handleSignal);
      process.off('SIGTERM', this.handleSignal);
    }
  }


  /**
   * Polls the server untill it responds
   * @param timeoutMs How long to keep trying to ping the server
   * @returns 
   */
  private async waitForHealthy(timeoutMs = 60000): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`http://localhost:${this.port}/`, { method: 'GET' });
        
        if (res.status >= 200 && res.status < 500) {
          return; 
        }
      } catch (err) {
      }
      await new Promise(r => setTimeout(r, 500));
    }

    throw new Error(`QLever failed to start within ${timeoutMs / 1000} seconds. Check docker logs.`);
  } 

  private handleSignal = async () => {
    await this.stop();
    process.exit(0);
  };

  private async ensureVolumeExists(volName: string) {
    try {
      await this.runCommand('docker', ['volume', 'create', volName], '.');
    } catch (e) { /* ignore */ }
  }

  private runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: false });
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Command ${cmd} failed with code ${code}`));
      });
    });
  }

  public getReadyStatus(): Promise<void>{
    return this.ready;
  }
}

export interface IQLeverInstanceArgs {
  /**
   * Name of the image used to run QLever
   */
  imageName: string,
  /**
   * Filelocations of the data to be queried
   */
  dataLocations: string[],
  /**
   * Port QLever will listen on
   */
  port: number,
  /**
   * Query timeout in seconds
   */
  timeout: number;
}