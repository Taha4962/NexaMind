/**
 * NexaMind Frontend — MongoDB Connection Singleton
 *
 * Provides a cached Mongoose connection to MongoDB Atlas.
 * Ensures only one connection is created across all API routes
 * and server components in the Next.js application.
 */

import mongoose from "mongoose";

/** MongoDB connection string from environment variables */
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    "MONGODB_URI environment variable is not defined. " +
      "Please add it to your .env.local file."
  );
}

/**
 * Global type declaration for caching the Mongoose connection
 * across hot reloads in development.
 */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

/* eslint-disable no-var */
declare global {
  var mongooseCache: MongooseCache | undefined;
}
/* eslint-enable no-var */

const cached: MongooseCache = global.mongooseCache ?? {
  conn: null,
  promise: null,
};

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

/**
 * Get a cached MongoDB connection via Mongoose.
 *
 * In development, the connection is cached on the global object
 * to survive hot reloads. In production, the module-level cache
 * ensures a single connection per serverless instance.
 *
 * @returns A connected Mongoose instance
 * @throws Error if the connection fails or MONGODB_URI is missing
 */
async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    cached.promise = mongoose
      .connect(MONGODB_URI as string, opts)
      .then((mongooseInstance) => {
        return mongooseInstance;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectDB;
