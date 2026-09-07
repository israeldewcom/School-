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
      // Force TLS and ignore certificate errors
      tls: true,
      tlsAllowInvalidCertificates: true,
    };

    // Only set replicaSet if it's explicitly provided and NOT using Atlas (mongodb+srv)
    if (env.MONGODB_REPLICA_SET && !env.MONGODB_URI.includes('mongodb+srv')) {
      options.replicaSet = env.MONGODB_REPLICA_SET;
    }

    const conn = await mongoose.connect(env.MONGODB_URI, options);
    isConnected = true;
    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
      isConnected = false;
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
