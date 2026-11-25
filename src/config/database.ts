import mongoose from 'mongoose';
import { getEnv, isProduction } from './env';

export async function connectDatabase(uri?: string): Promise<typeof mongoose> {
  const mongodbUri = uri ?? getEnv().MONGODB_URI;

  mongoose.set('strictQuery', true);

  if (!isProduction()) {
    mongoose.set('debug', false);
  }

  await mongoose.connect(mongodbUri, {
    // Compatible with replica-set deployments; single-node also works.
    autoIndex: !isProduction(),
  });

  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function getConnectionState(): number {
  return mongoose.connection.readyState;
}
