import type { ReadStream, WriteStream } from 'node:tty';
import type { IComponentsManagerBuilderOptions, IConstructionSettings } from 'componentsjs';
import { ComponentsManager } from 'componentsjs';
import type { QueryInstantiator } from './QueryInstantiator';

/**
 * Run function for starting the instantiator for a given config.
 * @param configPath - Path to a config.
 * @param properties - Components loader properties.
 * @param constructionSettings - Settings for instantiation.
 */
export async function runConfig(
  configPath: string,
  properties: IComponentsManagerBuilderOptions<QueryInstantiator>,
  constructionSettings?: IConstructionSettings,
): Promise<void> {
  const manager = await ComponentsManager.build(properties);
  await manager.configRegistry.register(configPath);
  const instantiator: QueryInstantiator = await manager
    .instantiate('urn:sparql-query-parameter-instantiator:default', constructionSettings);
  return await instantiator.instantiate();
};

/**
 * Generic run function for starting the instantiator from a given config
 * @param args - Command line arguments.
 * @param stdin - Standard input stream.
 * @param stdout - Standard output stream.
 * @param stderr - Standard error stream.
 * @param properties - Components loader properties.
 * @param constructionSettings - Settings for instantiation.
 */
export function runCustom(
  args: string[],
  stdin: ReadStream,
  stdout: WriteStream,
  stderr: WriteStream,
  properties: IComponentsManagerBuilderOptions<QueryInstantiator>,
  constructionSettings?: IConstructionSettings,
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
    return await runConfig(configPath, properties, constructionSettings);
  })().then((): void => {
    // Done
  }).catch((error) => {
    process.stderr.write(`${error.stack}\n`);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  });
};

/**
 * Run function for starting the server from the command line
 * @param moduleRootPath - Path to the module's root.
 */
export function runCli(moduleRootPath: string): void {
  const argv = process.argv.slice(2);
  runCustom(argv, process.stdin, process.stdout, process.stderr, { mainModulePath: moduleRootPath });
};
