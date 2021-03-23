import type { ReadStream, WriteStream } from 'tty';
import type { IComponentsManagerBuilderOptions } from 'componentsjs';
import { ComponentsManager } from 'componentsjs';
import type { QueryInstantiator } from './QueryInstantiator';

/**
 * Generic run function for starting the instantiator from a given config
 * @param args - Command line arguments.
 * @param stdin - Standard input stream.
 * @param stdout - Standard output stream.
 * @param stderr - Standard error stream.
 * @param properties - Components loader properties.
 */
export const runCustom = function(
  args: string[],
  stdin: ReadStream,
  stdout: WriteStream,
  stderr: WriteStream,
  properties: IComponentsManagerBuilderOptions<QueryInstantiator>,
): void {
  (async(): Promise<void> => {
    if (args.length !== 1) {
      stderr.write(`Missing config path argument.
Usage:
  sparql-query-parameter-instantiator path/to/config.json
`);
      return;
    }
    const configPath = args[0];

    // Setup from config file
    const manager = await ComponentsManager.build(properties);
    await manager.configRegistry.register(configPath);
    const instantiator: QueryInstantiator = await manager
      .instantiate('urn:sparql-query-parameter-instantiator:default');
    return await instantiator.instantiate();
  })().then((): void => {
    // Done
  }).catch(error => {
    process.stderr.write(`${error.stack}\n`);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  });
};

/**
 * Run function for starting the server from the command line
 * @param moduleRootPath - Path to the module's root.
 */
export const runCli = function(moduleRootPath: string): void {
  const argv = process.argv.slice(2);
  runCustom(argv, process.stdin, process.stdout, process.stderr, { mainModulePath: moduleRootPath });
};
