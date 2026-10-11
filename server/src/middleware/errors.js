import { ZodError } from "zod";
import mongoose from "mongoose";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";

export function notFound(req, _res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = err.status ?? 500;
  let body = { error: err.message || "Internal error" };

  if (err instanceof ZodError) {
    status = 400;
    body = { error: "Validation failed", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    body = { error: `Invalid ${err.path}` };
  } else if (err?.code === 11000) {
    status = 409;
    body = { error: "Duplicate value", fields: Object.keys(err.keyValue ?? {}) };
  } else if (err instanceof AppError && err.details) {
    body.details = err.details;
  }

  if (status >= 500) {
    logger.error({ err, path: req.originalUrl }, "Unhandled error");
    if (env.isProd) body = { error: "Internal server error" };
  }
  res.status(status).json(body);
}
