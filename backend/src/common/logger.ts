import * as winston from 'winston';
import { utilities as nestWinstonModuleUtilities } from 'nest-winston';

// Winston configuration settings.
// Output logs to the CLI console (with color coding) as well as writing
// to physical log files under /logs directory for persistent log ingestion (Datadog/ElasticSearch).
export const winstonLoggerOptions = {
  transports: [
    // Console output formatter (mimics Nest's default format, including timestamps)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(),
        nestWinstonModuleUtilities.format.nestLike('REGILLY-PG', {
          colors: true,
          prettyPrint: true,
        }),
      ),
    }),
    // Keep critical errors isolated in a separate log file
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(), // JSON format makes searching/grepping logs easier
      ),
    }),
    // Catch-all log file tracking both info logs, warnings, and errors
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),
  ],
};
