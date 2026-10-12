import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env.js";

const base = { standardHeaders: "draft-7", legacyHeaders: false, skip: () => env.isTest };

export const authLimiter = rateLimit({ ...base, windowMs: 15 * 60_000, limit: 20 });
// Expensive AI routes (used from Step 19 on): per user, not per IP
export const aiLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip), // ipKeyGenerator groups IPv6 by /56 subnet
});
