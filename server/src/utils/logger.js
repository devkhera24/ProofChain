import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.isTest ? "silent" : env.LOG_LEVEL,
  redact: ["req.headers.authorization", "*.password", "*.passwordHash", "*.token"],
  transport: env.isProd || env.isTest ? undefined : { target: "pino-pretty", options: { colorize: true } },
});
