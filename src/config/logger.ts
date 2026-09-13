// src/config/logger.ts
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

const baseLogger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
  base: { env: process.env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
});

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

function makeLoggerFn(level: LogLevel) {
  const fn = (baseLogger as any)[level].bind(baseLogger);
  return (arg1?: any, arg2?: any, ...rest: any[]): void => {
    // Object first, message second — pino's native style.
    if (arg1 !== null && typeof arg1 === 'object' && typeof arg2 === 'string') {
      fn(arg1, arg2, ...rest);
      return;
    }
    // String first, object second — used across this codebase.
    if (typeof arg1 === 'string' && arg2 !== null && typeof arg2 === 'object') {
      fn(arg2, arg1, ...rest);
      return;
    }
    if (arg2 === undefined) {
      fn(arg1);
    } else {
      fn(arg1, arg2, ...rest);
    }
  };
}

const logger = new Proxy(baseLogger, {
  get(target: any, prop: string | symbol) {
    if (
      prop === 'info' ||
      prop === 'warn' ||
      prop === 'error' ||
      prop === 'debug' ||
      prop === 'trace' ||
      prop === 'fatal'
    ) {
      return makeLoggerFn(prop as LogLevel);
    }
    const value = target[prop];
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

export default logger;
