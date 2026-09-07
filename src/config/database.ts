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
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      // Force TLS and ignore certificate/hostname errors
      tls: true,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      // For older Node versions, also set these:
      sslValidate: false,
      rejectUnauthorized: false,
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
      // Attempt reconnection after 10 seconds
      setTimeout(() => connectDB(), 10000);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
      isConnected = false;
      setTimeout(() => connectDB(), 10000);
    });
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    throw error;
  }
};

export const disconnectDB = async (): Promise<void> => {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB disconnected');
  }
};
