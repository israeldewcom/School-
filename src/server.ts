// src/server.ts
import mongoose from 'mongoose';
import app from './app';
import * as envConfig from './config/env';
import logger from './config/logger';
import { bootstrapAdmin } from './scripts/bootstrap-admin';

// Normalize the env module — supports both `export default {}` and
// named exports. Same pattern used in auth.service.ts.
const config: any = (envConfig as any).default || envConfig;

const PORT = Number(process.env.PORT) || 5000;
const MONGODB_URI =
  process.env.MONGODB_URI ||
  config.MONGODB_URI ||
  'mongodb://127.0.0.1:27017/schoolflow';

async function start() {
  try {
    // 1. Connect to MongoDB FIRST — bootstrap needs the DB.
    await mongoose.connect(MONGODB_URI);
    logger.info('✅ MongoDB connected');

    // 2. Bootstrap the platform admin. Idempotent; safe every boot.
    await bootstrapAdmin();

    // 3. Start the HTTP server.
    app.listen(PORT, () => {
      logger.info(`🚀 SchoolFlow API listening on port ${PORT}`);
      logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`   Health:      http://localhost:${PORT}/health`);
    });
  } catch (err: any) {
    logger.error(`❌ Failed to start server: ${err?.message}`, { stack: err?.stack });
    process.exit(1);
  }
}

start();

// ------------------------------------------------------------------
// Graceful shutdown
// ------------------------------------------------------------------
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — closing gracefully');
  try { await mongoose.connection.close(false); } catch (_) {}
  process.exit(0);
});
process.on('SIGINT', async () => {
  logger.info('SIGINT received — closing gracefully');
  try { await mongoose.connection.close(false); } catch (_) {}
  process.exit(0);
});
process.on('unhandledRejection', (reason: any) => {
  logger.error('💥 UNHANDLED REJECTION', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});
process.on('uncaughtException', (err: Error) => {
  logger.error('💥 UNCAUGHT EXCEPTION', { message: err.message, stack: err.stack });
});
