import { Router } from "express";
import mongoose from "mongoose";

export const healthRouter = Router();
const startedAt = new Date();

healthRouter.get("/", (_req, res) => {
  const dbState = ["disconnected", "connected", "connecting", "disconnecting"][mongoose.connection.readyState] ?? "unknown";
  res.json({
    status: "ok",
    service: "proofchain-api",
    version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "dev",
    uptimeSeconds: Math.round(process.uptime()),
    startedAt,
    db: dbState,
  });
});
