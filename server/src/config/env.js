import "dotenv/config";
import { z } from "zod";

const bool = (def) =>
  z
    .enum(["true", "false"])
    .default(def)
    .transform((v) => v === "true");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

    MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    JWT_EXPIRES_IN: z.string().default("7d"),

    // Comma-separated. Entries may contain * wildcards, e.g. https://proofchain-*.vercel.app
    CORS_ORIGINS: z.string().default("http://localhost:5173"),

    AI_MOCK: bool("false"),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
    GEMINI_EMBED_MODEL: z.string().default("gemini-embedding-001"),
    EMBED_DIM: z.coerce.number().int().default(768),
    AI_CONCURRENCY: z.coerce.number().int().min(1).default(2),

    VECTOR_SEARCH_MODE: z.enum(["atlas", "memory"]).default("atlas"),
    VECTOR_INDEX_NAME: z.string().default("passage_vector_index"),

    S2_API_KEY: z.string().optional(),
    CONTACT_EMAIL: z.string().email().default("proofchain@example.com"),

    MAX_UPLOAD_MB: z.coerce.number().default(15),
    AUTO_RECOMMEND: bool("true"), // first recommendation batch after a project's first source is ready
  })
  .superRefine((v, ctx) => {
    if (!v.AI_MOCK && !v.GEMINI_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["GEMINI_API_KEY"], message: "required unless AI_MOCK=true" });
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

export const env = Object.freeze({
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
});
