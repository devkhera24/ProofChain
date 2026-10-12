import express from "express";
import helmet from "helmet";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { logger } from "./utils/logger.js";
import { corsOptions } from "./config/cors.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { projectsRouter } from "./routes/projects.js";
import { notFound, errorHandler } from "./middleware/errors.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1); // Render sits behind a proxy (needed for rate limiting & req.ip)
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/projects", projectsRouter);
  // more routers are mounted here in later steps

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
