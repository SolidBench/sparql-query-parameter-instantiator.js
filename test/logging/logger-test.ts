import { logger } from '../../lib/logging/logger';

describe('Logger', () => {
  let logSpy: jest.SpyInstance;

  // Winston stores the final formatted output string under this symbol
  const MESSAGE = Symbol.for('message');

  beforeEach(() => {
    logSpy = jest.spyOn(logger.transports[0], 'log');
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('should format logs correctly without a module tag', () => {
    logger.info('Test message without module');

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        [MESSAGE]: expect.stringContaining('Test message without module'),
      }),
      expect.anything(),
    );
  });

  it('should format logs correctly with a module tag', () => {
    const childLogger = logger.child({ module: 'QuerySequenceInstantiator' });
    childLogger.info('Test message with module');

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        [MESSAGE]: expect.stringContaining('[QuerySequenceInstantiator] Test message with module'),
      }),
      expect.anything(),
    );
  });

  it('should format logs correctly with extra metadata', () => {
    const escapeRegExp = (str: string): string => str.replaceAll(/[$()*+.?[\\\]^{|}]/gu, '\\$&');
    const mockMetadata = { templateCounts: { templateA: 5, templateB: 10 }};
    logger.info('Test message with metadata', mockMetadata);

    const expectedMetaString = JSON.stringify(mockMetadata, null, 2);

    const escapedMeta = escapeRegExp(expectedMetaString);
    const regex = new RegExp(`Test message with metadata\n${escapedMeta}`, 'u');

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        // Verifies that both the message and the stringified metadata are present
        [MESSAGE]: expect.stringMatching(regex),
      }),
      expect.anything(),
    );
  });
});
