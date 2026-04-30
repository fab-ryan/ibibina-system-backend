import { utilities as nestWinstonModuleUtilities, WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';

const { combine, timestamp, ms, errors } = winston.format;

export const winstonLoggerConfig = (logLevel: string = 'info'): WinstonModuleOptions => ({
  level: logLevel,
  format: combine(errors({ stack: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), ms()),
  transports: [
    new winston.transports.Console({
      format: combine(
        nestWinstonModuleUtilities.format.nestLike('Ibibina', {
          colors: true,
          prettyPrint: true,
          processId: true,
          appName: true,
        }),
      ),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: combine(timestamp(), winston.format.json()),
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: combine(timestamp(), winston.format.json()),
    }),
  ],
});
