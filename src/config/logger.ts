// src/config/logger.ts
import pino from 'pino';
import path from 'path';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Base pino instance. Transport selection:
 *   - dev:  pino-pretty for readable colorized output
 *   - prod: raw JSON to stdout for log aggregators
 */
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

// ------------------------------------------------------------------
// Signature normalization
//
// pino's typed overloads reject `logger.info('msg', { obj })` — they
// expect `logger.info({ obj }, 'msg')`. Every file in the codebase
// uses the string-first style, so this wrapper reorders arguments to
// match pino's native expectation. Both call styles work:
//
//   logger.info('something happened');
//   logger.info('something happened', { userId: 42 });
//   logger.info({ userId: 42 }, 'something happened');
// ------------------------------------------------------------------
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

function makeLoggerFn(level: LogLevel) {
  const fn = (baseLogger as any)[level].bind(baseLogger);
  return (arg1?: any, arg2?: any, ...rest: any[]): void => {
    // Object first, message second — pino's native style. Pass through.
    if (arg1 !== null && typeof arg1 === 'object' && typeof arg2 === 'string') {
      fn(arg1, arg2, ...rest);
      return;
    }
    // String first, object second — the pattern used across this codebase.
    // Swap to object-first to satisfy pino's typed overloads.
    if (typeof arg1 === 'string' && arg2 !== null && typeof arg2 === 'object') {
      fn(arg2, arg1, ...rest);
      return;
    }
    // Plain string, or object-only, or string-with-placeholder-values.
    if (arg2 === undefined) {
      fn(arg1);
    } else {
      fn(arg1, arg2, ...rest);
    }
  };
}

// Proxy so that:
//   - log-level methods (info/warn/error/…) go through the wrapper
//   - everything else (child, level, bindings, …) passes through to pino
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
