import mongoose from 'mongoose';
import logger from './logger';
import { env } from './env';

let isConnected = false;

export const connectDB = async (): Promise<void> => {
  if (isConnected) {
    logger.info('Using existing database connection');
    return;
  }

  try {
    const options: mongoose.ConnectOptions = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      // Force TLS and ignore certificate errors – required for Atlas
      tls: true,
      tlsAllowInvalidCertificates: true,
    };

    // Only set replicaSet if explicitly provided and not using Atlas (mongodb+srv)
    if (env.MONGODB_REPLICA_SET && !env.MONGODB_URI.includes('mongodb+srv')) {
      options.replicaSet = env.MONGODB_REPLICA_SET;
    }

    const conn = await mongoose.connect(env.MONGODB_URI, options);
    isConnected = true;
    logger.info(`MongoDB Connected: ${conn.connection.host || 'cluster'}`);

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
      isConnected = false;
      // Attempt reconnection after 5 seconds
      setTimeout(() => connectDB(), 5000);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
      isConnected = false;
      setTimeout(() => connectDB(), 5000);
    });
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    throw error; // Let server.ts handle retry
  }
};

export const disconnectDB = async (): Promise<void> => {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB disconnected');
  }
};
