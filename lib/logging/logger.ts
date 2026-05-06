import * as winston from 'winston';

interface ICustomLogInfo extends winston.Logform.TransformableInfo {
  timestamp?: string;
  module?: string;
  level: string;
  message: string;
}

const { combine, timestamp, printf, colorize } = winston.format;

const customFormat = printf((info) => {
  const { timestamp, level, message, module, ...meta } = <ICustomLogInfo> info;

  const moduleTag = module ? `[${module}] ` : '';

  const metaString = Object.keys(meta).length > 0 ?
    `\n${JSON.stringify(meta, null, 2)}` :
    '';

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
