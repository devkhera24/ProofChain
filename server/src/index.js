import http from "node:http";
import { env } from "./config/env.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { createApp } from "./app.js";
import { logger } from "./utils/logger.js";

async function main() {
  await connectDb();
  const app = createApp();
  const server = http.createServer(app);
  // Step 29 attaches Socket.io here: initSockets(server)
  // Step 16 resumes interrupted jobs here: await resumeInterruptedJobs()

  server.listen(env.PORT, "0.0.0.0", () => logger.info(`API listening on :${env.PORT} (${env.NODE_ENV})`));

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDb().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref(); // force exit if hanging
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (err) => logger.error({ err }, "unhandledRejection"));
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start");
  process.exit(1);
});
