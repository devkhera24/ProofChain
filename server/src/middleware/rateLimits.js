import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env.js";

const base = { standardHeaders: "draft-7", legacyHeaders: false, skip: () => env.isTest };

export const authLimiter = rateLimit({ ...base, windowMs: 15 * 60_000, limit: 20 });
const perUser = (req) => req.user?.id ?? ipKeyGenerator(req.ip); // ipKeyGenerator groups IPv6 by /56 subnet

/** Everything under /api/projects: generous, just stops runaway clients and scripted abuse (e.g. comment spam). */
export const apiLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 300, keyGenerator: perUser });

// Expensive AI routes (Gemini or scholarly APIs): per user, not per IP
export const aiLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 20,
  keyGenerator: perUser,
});
