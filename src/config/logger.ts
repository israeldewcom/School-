import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.body.password',
      'req.body.token',
      'req.body.refreshToken',
      'req.headers.cookie',
      'password',
      'refreshTokens',
      'jwt',
    ],
    censor: '[REDACTED]',
  },
});

export default logger;
