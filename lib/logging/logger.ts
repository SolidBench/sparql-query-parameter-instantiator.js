import * as winston from 'winston';

const { combine, timestamp, printf, colorize } = winston.format;

const customFormat = printf(({ timestamp, level, message, module, ...meta }) => {
  const moduleTag = module ? `[${module}] ` : '';
  
  // Format remaining metadata if it exists
  const metaString = Object.keys(meta).length 
    ? `\n${JSON.stringify(meta, null, 2)}` 
    : '';

  return `[${timestamp}] ${level}: ${moduleTag}${message}${metaString}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: combine(
    colorize(),
    timestamp({ format: 'HH:mm:ss Z' }),
    customFormat,
  ),
  transports: [ new winston.transports.Console() ],
});
