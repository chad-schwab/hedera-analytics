/* eslint-disable no-restricted-imports */
import { pinoLambdaDestination, PinoLogFormatter } from "pino-lambda";
import pino, { stdTimeFunctions } from "pino";

import { PatchedTypePino } from "./patched-pino-type";

const loggerCache = new Map<string, pino.Logger>();

export const LOG_LEVEL = "LOG_LEVEL";

function getDefaultLogLevel(): string {
  return process.env.LOG_LEVEL ?? "info";
}

export function updateLogLevels(logLevel: string) {
  Object.values(loggerCache).forEach((logger) => {
    logger.level = logLevel;
  });
}

export type Logger = ReturnType<typeof createLogger>;

export function createLogger(name: string): PatchedTypePino {
  const existingLogger = loggerCache.get(name);
  if (existingLogger) {
    return existingLogger;
  }

  const runningInLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  const destinationStream = runningInLambda
    ? pinoLambdaDestination({
        formatter: new PinoLogFormatter(),
      })
    : process.stdout;

  const logger = pino(
    {
      name,
      timestamp: stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
      },
      level: getDefaultLogLevel(),
      serializers: {
        ...pino.stdSerializers,
        error: pino.stdSerializers.err,
      },
    },
    destinationStream
  );
  loggerCache.set(name, logger);
  return logger;
}
