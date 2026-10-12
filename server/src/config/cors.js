import { env } from "./env.js";

const patterns = env.CORS_ORIGINS.split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((o) => new RegExp("^" + o.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^.]+") + "$"));

export function isAllowedOrigin(origin) {
  if (!origin) return true; // curl, server-to-server, health checks
  return patterns.some((re) => re.test(origin));
}

export const corsOptions = {
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Disposition"], // export downloads read the file name from it
  maxAge: 600,
};
