import * as Dockerode from 'dockerode';
import * as path from 'path';
import * as fs from 'fs';
import { IQueryNextInstantiatorValueArgs, IQueryExecutionResult } from './QueryNextInstantiationValue';
// Ensure you have a fetch polyfill if on Node < 18
// import fetch from 'node-fetch';

export class QLeverQueryInstantiator {
  // Arguments
  private dataLocations: string[];
  private timeout: number;
  // TODO: Make this an argument
  private imageName: string = 'adfreiburg/qlever:latest';
  
  // Docker State
  private docker: Dockerode;
  private container: Dockerode.Container | null = null;
  private volumeName: string;
  private containerName: string;
  private port: number;
  
  private ready: Promise<void>;
  private isShuttingDown: boolean = false;

  public constructor(args: IQueryNextInstantiatorValueArgs) {
    this.dataLocations = args.dataLocations;
    this.timeout = args.timeout;

    this.docker = new Dockerode();

    // Generate unique identifiers to isolate this instance
    const id = Date.now().toString().slice(-6);
    this.containerName = `qlever-server-${id}`;
    this.volumeName = `qlever-index-${id}`;
    this.port = 7000;

    // Start the background setup
    this.ready = this.initQLever().catch(err => {
      console.error(`[QLever] Fatal startup error:`, err);
      // Clean up if we failed halfway through
      this.destroy().catch(() => {}); 
      throw err;
    });
  }

    /**
     * The main initialization pipeline:
     * 1. Create a Docker Volume for the index.
     * 2. Run a temporary container to Build the Index.
     * 3. Run the long-lived Server container.
     */
  private async initQLever(): Promise<void> {
    console.log(`[QLever] Initializing ${this.containerName} on port ${this.port}...`);

    // --- Step 0: Pull Image ---
    const buildStream = await this.docker.pull(this.imageName);
    
    await new Promise((resolve, reject) => {
        this.docker.modem.followProgress(
        buildStream, 
        (err: Error | null, res: any[]) => err ? reject(err) : resolve(res)
        );
    });

    // --- Step 1: Create Volume ---
    await this.docker.createVolume({ Name: this.volumeName });

    // --- Step 2: Build Index ---
    const binds = this.dataLocations.map((loc, idx) => {
        const absPath = path.resolve(loc);
        return `${absPath}:/input/data_${idx}.ttl:ro`;
    });
    
    binds.push(`${this.volumeName}:/index`);

    const internalFilePaths = this.dataLocations.map((_, idx) => `/input/data_${idx}.ttl`);
    const inputFilesList = internalFilePaths.join(' ');

    console.log('[QLever] Building Index...');

    // Use the QLever CLI tool instead of calling binaries directly
    const indexerContainer = await this.docker.createContainer({
        Image: 'adfreiburg/qlever:latest',
        Cmd: [
        'qlever', 'index',
        '--input-files', inputFilesList,
        '--index-dir', '/index',
        '--name', 'my-index'
        ],
        HostConfig: {
        Binds: binds,
        AutoRemove: false,
        },
        WorkingDir: '/index', // QLever expects to run from the index directory
    });    
    
    const outputStream = await indexerContainer.attach({
        stream: true, 
        stdout: true, 
        stderr: true,
        logs: true
    });
    outputStream.pipe(process.stdout);

    await indexerContainer.start();
    
    // Add timeout
    const waitPromise = indexerContainer.wait();
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Indexing timeout after 10 minutes')), 10 * 60 * 1000)
    );
    
    const result = await Promise.race([waitPromise, timeoutPromise]) as any;
    
    if (result.StatusCode !== 0) {
        const logs = await indexerContainer.logs({stdout: true, stderr: true});
        console.error('[QLever] Indexer logs:', logs.toString());
        throw new Error(`QLever Indexing failed with exit code ${result.StatusCode}`);
    }

    await indexerContainer.remove();

    // --- Step 3: Start Server ---
    console.log('[QLever] Starting Server...');
    
    this.container = await this.docker.createContainer({
        Image: this.imageName,
        name: this.containerName,
        Cmd: [
        'qlever', 'start',
        '--index-dir', '/index',
        '--name', 'my-index',
        '--port', '7001'
        ],
        ExposedPorts: { '7001/tcp': {} },
        HostConfig: {
        Binds: [`${this.volumeName}:/index`],
        PortBindings: {
            '7001/tcp': [{ HostPort: this.port.toString() }]
        }
        },
        WorkingDir: '/index',
    });

    await this.container.start();

    await this.waitForServer();
    console.log(`[QLever] Ready at http://localhost:${this.port}`);
  }

/**
   * Helper to wait until the HTTP endpoint is responsive
   */
  private async waitForServer(maxRetries = 40): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 200);
        const res = await fetch(`http://localhost:${this.port}/`, { signal: controller.signal });
        clearTimeout(id);
        if (res.ok) return;
      } catch (e) {
        await new Promise(r => setTimeout(r, 250));
      }
    }
    throw new Error('QLever Server timed out waiting to start');
  }

  /**
   * Execute SPARQL Query via HTTP
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

      const json: any = await response.json();

      // QLever returns { result: { bindings: [...] } }
      // You must map this to your RDF.Bindings format
      const results = json.results.bindings; 
      console.log(results);
      return { message: 'END', results };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { message: 'TIMEOUT', results: [] };
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  /**
   * Cleanup resources. 
   * Stops container, removes it, and removes the temporary volume.
   */
  public async destroy(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log('[QLever] Shutting down...');

    try {
      // 1. Stop and Remove Server Container
      if (this.container) {
        try {
          await this.container.stop();
        } catch(e: any) {
          // If 304 (already stopped) or 404 (not found), ignore
          if (e.statusCode !== 304 && e.statusCode !== 404) console.warn('Error stopping container:', e.message);
        }
        
        try {
          await this.container.remove({ force: true });
        } catch(e: any) {
            if (e.statusCode !== 404) console.warn('Error removing container:', e.message);
        }
      }

      // 2. Remove the Volume (Cleanup index data)
      if (this.volumeName) {
        const volume = this.docker.getVolume(this.volumeName);
        try {
          await volume.remove();
        } catch (e: any) {
            if (e.statusCode !== 409 && e.statusCode !== 404) console.warn('Error removing volume:', e.message);
        }
      }
    } catch (err) {
      console.error('[QLever] Error during cleanup:', err);
    }
  }
}