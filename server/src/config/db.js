import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

mongoose.set("strictQuery", true);

export async function connectDb(uri = env.MONGODB_URI) {
  mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
  mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 10,
    autoIndex: !env.isProd, // in prod, indexes are created by scripts/createIndexes.js
  });
  logger.info("MongoDB connected");
}

export async function disconnectDb() {
  await mongoose.connection.close();
}
