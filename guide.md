# ProofChain — Build Guide for Claude Code

> **Source of truth:** `docs/ProofChain_Research_Agent_Design.pdf` (the design document).
> This guide turns that document into **30 small, sequential build steps**. Each step ends with a
> checkpoint where you stop and the human commits.

---

## 0. Rules for Claude Code (read these at the start of every session)

### 0.1 Work one step at a time

1. Work on **exactly one step** at a time, in order. Never start Step N+1 until the user explicitly says
   so (for example "committed", "continue", or "go to step N+1").
2. At the start of a session, ask the user which step to continue from if it isn't obvious from the repo state.
3. If a step is bigger than expected, finish it fully. Don't split it into extra commits and don't jump ahead.
4. If something in a step is blocked by a **user action** (creating a cloud account, pasting an API key,
   clicking in a dashboard), stop, give exact instructions, and wait.

### 0.2 Never commit

**You must never create commits or change git history.** The user commits by hand at every checkpoint.

- ❌ Forbidden: `git commit`, `git push`, `git add`, `git merge`, `git rebase`, `git tag`, `git reset`,
  `git stash`, `git checkout -- <file>`, `git restore`, `git init`, or anything that writes to `.git/`.
- ✅ Allowed (read-only): `git status`, `git diff`, `git log`, `git show`, `git branch --show-current`.
- If the user asks you to commit, reply with the exact commands for them to run instead of running them.

### 0.3 The checkpoint protocol

At the end of **every** step, stop and print a checkpoint in exactly this format, then wait:

```
🛑 CHECKPOINT — Step <N>: <title>

What changed:
- <2–6 bullets>

Files created/modified:
- <paths>

How to verify:
- <commands to run / what to click / expected result>

New environment variables:
- <NAME (server|client): purpose>   (or "none")

User actions needed:
- <dashboard steps>   (or "none")

Suggested commit (run these yourself):
  git add -A
  git commit -m "<conventional commit message>"

Reply "committed" when done and I'll start Step <N+1>: <next title>.
```

Before printing the checkpoint, always run `git status` (read-only) and the step's tests or build commands,
and report the results honestly. If a test fails, fix it before the checkpoint, or report it clearly.

### 0.4 Build for deployment from day one

This is a **deployed** project: frontend on **Vercel**, backend on **Render**, database on **MongoDB Atlas**.
Every line of code must work in production, not only on localhost.

- **All config comes from environment variables.** Never hard-code URLs, ports, secrets, or `localhost`.
  The server validates its env at startup with Zod and refuses to boot if something is missing.
- **Whenever you add an env var**, add it to `server/.env.example` or `client/.env.example`, to
  `render.yaml` (server), to the env table in this guide's Appendix A, and mention it in the checkpoint.
- **Never commit secrets.** `.env` files are git-ignored. Real keys only go in `.env` locally and in the
  Render/Vercel dashboards.
- **The server is stateless.** Render's free disk is ephemeral: never store uploads or data on disk.
  Everything persistent goes into MongoDB. Uploaded PDFs are parsed in memory and only extracted text is stored.
- **Render free tier sleeps** after ~15 minutes idle and takes ~30–60s to wake. The client must show a
  friendly "waking the server" state rather than erroring. In-process background jobs can be interrupted
  by restarts, so jobs must be resumable or marked failed with a retry button.
- **Cross-origin by design.** The client (vercel.app) and API (onrender.com) are on different domains.
  Use `Authorization: Bearer <JWT>` headers, not cookies. CORS origins come from `CORS_ORIGINS`.
- Listen on `process.env.PORT` and host `0.0.0.0`. Expose `GET /api/health`.
- Production must pass `npm ci && npm start` (server) and `npm ci && npm run build` (client).

### 0.5 Engineering rules

- Language: **JavaScript (ES modules)** on both sides. Node **22 LTS**.
- Keep files small and single-purpose. Follow the folder structure from Step 1.
- **Gemini never produces a paper, a passage, or an ID.** It only receives items with IDs and returns
  JSON that references those IDs. Every AI output is validated (Zod schema + ID check + quote check)
  before being stored as anything other than a suggestion. This is the core promise of the product.
- **Tests never call real external APIs.** Use `AI_MOCK=true` and fixture data for Gemini and the
  scholarly APIs. Tests run against `mongodb-memory-server` with `VECTOR_SEARCH_MODE=memory`.
- **Verify library APIs.** Code snippets in this guide target the library versions current when it was
  written. If an installed version's API differs, adapt the code, and add a one-line note to
  `docs/decisions.md`.
- **Deviations from the design document** must be recorded in `docs/decisions.md` (date, decision,
  reason). Several deliberate deviations are already listed in section 0.6.
- Never invent paper titles, DOIs, or quotes in seed data or tests. Use obviously fake fixtures
  (for example `"Fixture Paper A"`, DOI `10.0000/fixture.a`).

### 0.6 Technology decisions (pre-approved)

| Area | Choice | Note |
|---|---|---|
| Backend | Node 22, **Express 5**, Mongoose 8, Zod, jsonwebtoken, **bcryptjs** | bcryptjs instead of bcrypt: no native build on Render |
| Frontend | React 18/19, Vite, **Tailwind CSS v4**, React Router v7, Axios, **TanStack Query** | React Query added for caching and socket-driven refetching |
| Realtime | Socket.io 4 | Works on Render web services |
| Database | MongoDB Atlas (M0 free) + **Atlas Vector Search** (one index on passages) | Free tier limits search indexes, so we use only one |
| LLM | Gemini via `@google/genai` | Model names come from env |
| Embeddings | `gemini-embedding-001` with `outputDimensionality: 768` | Dimension comes from env `EMBED_DIM` |
| Graph | Cytoscape.js (used directly with a ref) | No React wrapper |
| HTML extraction | `jsdom` + `@mozilla/readability` | |
| PDF extraction | **`pdfjs-dist`** (legacy build) | Instead of pdf-parse: we need per-page text for page numbers |
| Papers | Semantic Scholar, OpenAlex, Crossref, Unpaywall (arXiv optional) | All free; S2 key recommended |
| Tests | Vitest + Supertest + mongodb-memory-server | |
| Deploy | Vercel (client), Render (server, via `render.yaml`), GitHub Actions CI | |

---

## Overview of the 30 steps

| # | Phase | Step |
|---|---|---|
| 1 | Foundation | Repo root folder structure |
| 2 | Server skeleton | Express app, env validation, logger, errors, health route |
| 3 | Server skeleton | MongoDB connection, graceful shutdown, test setup |
| 4 | Client skeleton | Vite + React + Tailwind + Router page shells |
| 5 | Client skeleton | API client, server-wake banner, Vercel config |
| 6 | Deploy | render.yaml, Atlas, Render, Vercel, smoke test |
| 7 | Auth | Auth backend |
| 8 | Auth | Auth frontend |
| 9 | Projects | Projects backend, roles, human-readable IDs |
| 10 | Projects | Projects page and workspace layout |
| 11 | Data | Core domain models and audit service |
| 12 | Data | Vector Search index and retrieval service |
| 13 | AI | Gemini client (JSON + validation + embeddings + mock mode) |
| 14 | Ingestion | Text normalization and passage chunker |
| 15 | Ingestion | URL fetching (SSRF-safe), HTML and PDF extraction |
| 16 | Ingestion | Job runner, ingestion pipeline, source routes |
| 17 | Ingestion | Client: add sources, source list, source viewer |
| 18 | Proof chain | Validation engine (quote match, metadata match, pipeline log) |
| 19 | Proof chain | Claim extraction and claim routes |
| 20 | Proof chain | Evidence linker and human review |
| 21 | Proof chain | Client: claims, claim detail, review queue |
| 22 | Recommender | Scholarly API clients and paper verification |
| 23 | Recommender | Interest profile and evidence gap detector |
| 24 | Recommender | Pipeline A: queries, candidates, scoring |
| 25 | Recommender | Pipeline B: slots, MMR, grounded rationales, batches |
| 26 | Recommender | Client: recommendation cards and profile panel |
| 27 | Agent | Chat orchestrator and chat panel |
| 28 | Graph | Evidence graph endpoint and Cytoscape view |
| 29 | Realtime | Socket.io collaboration, comments, disputes, presence |
| 30 | Ship | Export, hardening, CI, demo seed, final deployment check |

---

## STEP 1 — Repo root folder structure

**Goal:** create the complete folder skeleton plus root-level config files, so every later step has an
obvious place to put code.

### 1.1 Check the starting state

Run `git status`. If it says "not a git repository", **stop** and ask the user to run `git init` themselves
(and optionally create the GitHub repo). Do not run `git init` yourself.

### 1.2 Create the folders

From the repo root:

```bash
mkdir -p docs scripts .github/workflows

mkdir -p server/src/{config,routes,middleware,models,sockets,jobs,utils}
mkdir -p server/src/services/{auth,projects,ingestion,ai/prompts,validation,claims,evidence,scholarly,profile,recommender,agent,audit,export,realtime}
mkdir -p server/scripts server/tests/{unit,integration,fixtures}

mkdir -p client/public
mkdir -p client/src/{api,context,hooks,lib,pages,styles}
mkdir -p client/src/components/{layout,common,auth,projects,chat,recommendations,graph,sources,claims,review,profile}
```

Add an empty `.gitkeep` to every leaf folder that has no files yet, so git tracks them:

```bash
find server client docs scripts .github -type d -empty -exec touch {}/.gitkeep \;
```

(Remove each `.gitkeep` later, once its folder gets real files.)

### 1.3 The target structure

This is where the project is heading. Folders exist now; files arrive in later steps.

```
proofchain/
├── CLAUDE.md                     # short rules Claude Code reads automatically
├── guide.md                      # this file
├── README.md
├── render.yaml                   # Render blueprint (Step 6)
├── package.json                  # root scripts only (dev both apps, format)
├── .gitignore  .editorconfig  .nvmrc  .prettierrc  .prettierignore
├── .github/workflows/ci.yml      # Step 30
├── docs/
│   ├── ProofChain_Research_Agent_Design.pdf   # user copies the design doc here
│   ├── decisions.md              # decision log (deviations, version notes)
│   └── deployment.md             # Step 6
├── scripts/
│   └── smoke.mjs                 # production smoke test (Step 6)
├── server/
│   ├── package.json  .env.example  vitest.config.js
│   ├── scripts/                  # createIndexes.js, seedDemo.js
│   ├── tests/{unit,integration,fixtures}
│   └── src/
│       ├── index.js              # boot: db, http server, sockets, shutdown
│       ├── app.js                # express app factory
│       ├── config/               # env.js, db.js, cors.js
│       ├── routes/               # one router per resource
│       ├── middleware/           # auth, validate, projectRole, rateLimits, errors
│       ├── models/               # mongoose models
│       ├── services/
│       │   ├── ai/               # gemini.js, embeddings.js, prompts/*
│       │   ├── ingestion/        # normalize, chunk, fetchUrl, extractHtml, extractPdf, pipeline
│       │   ├── validation/       # textMatch, metadata, pipelineLog
│       │   ├── claims/  evidence/  scholarly/  profile/  recommender/
│       │   ├── agent/  audit/  export/  realtime/  auth/  projects/
│       ├── sockets/              # socket.io server + auth
│       ├── jobs/                 # in-process job runner
│       └── utils/                # logger, errors, vectors, ids, text helpers
└── client/
    ├── package.json  vite.config.js  index.html  vercel.json  .env.example
    └── src/
        ├── main.jsx  App.jsx
        ├── api/                  # axios instance + resource functions
        ├── context/              # AuthContext, SocketContext
        ├── hooks/                # useServerStatus, useProject, useProjectEvents…
        ├── pages/                # Login, Register, Projects, Workspace, NotFound
        ├── components/           # grouped by feature
        ├── lib/                  # formatters, constants (stance colors…)
        └── styles/index.css
```

### 1.4 Root config files

**`.gitignore`**

```gitignore
node_modules/
dist/
coverage/
.env
.env.*
!.env.example
*.log
.DS_Store
.vscode/*
!.vscode/extensions.json
.idea/
.vercel
```

**`.nvmrc`**

```
22
```

**`.editorconfig`**

```ini
root = true
[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

**`.prettierrc`**

```json
{ "singleQuote": false, "semi": true, "printWidth": 100, "trailingComma": "all" }
```

**`.prettierignore`**

```
node_modules
dist
coverage
package-lock.json
docs/*.pdf
```

**`package.json`** (root — convenience scripts only; each app has its own dependencies)

```json
{
  "name": "proofchain",
  "private": true,
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "concurrently -n api,web -c blue,green \"npm:dev:server\" \"npm:dev:client\"",
    "dev:server": "npm --prefix server run dev",
    "dev:client": "npm --prefix client run dev",
    "install:all": "npm --prefix server install && npm --prefix client install",
    "test": "npm --prefix server test",
    "build:client": "npm --prefix client run build",
    "smoke": "node scripts/smoke.mjs",
    "format": "prettier --write ."
  },
  "devDependencies": {}
}
```

Then install the root dev tools:

```bash
npm install -D concurrently prettier
```

### 1.5 CLAUDE.md

Claude Code reads `CLAUDE.md` automatically, so put the non-negotiable rules there:

```markdown
# CLAUDE.md — ProofChain

Follow `guide.md` step by step. Source of truth: `docs/ProofChain_Research_Agent_Design.pdf`.

Non-negotiable:
1. One step at a time. End every step with the CHECKPOINT block from guide.md §0.3 and wait.
2. NEVER run git commands that write (commit, add, push, merge, rebase, reset, stash, tag, init).
   Read-only git (status, diff, log) is fine. Give the user commit commands instead.
3. Deployed project: Vercel (client) + Render (server) + MongoDB Atlas. Env-driven config only,
   stateless server, Bearer-token auth, no secrets in git. Update .env.example + render.yaml when adding env vars.
4. Gemini never invents papers, passages, quotes or IDs. Validate every AI output before storing it.
5. Tests never hit real external APIs (AI_MOCK=true, VECTOR_SEARCH_MODE=memory).
6. Record deviations from the design doc in docs/decisions.md.
```

### 1.6 Docs and README placeholders

**`docs/decisions.md`**

```markdown
# Decision log

| Date | Decision | Reason |
|---|---|---|
| (step 1) | Express 5, bcryptjs, pdfjs-dist, TanStack Query, Tailwind v4 | See guide.md §0.6 |
| (step 1) | Bearer JWT instead of cookies | Client and API are on different domains |
| (step 1) | One Atlas vector index (passages); claims/papers compared in memory | Free tier search-index limit |
```

**`docs/deployment.md`** — just a heading for now: `# Deployment (filled in Step 6)`.

**`README.md`** — project name, the one-line pitch from the design doc, a "Status: in development" line,
and a "Local development" section that says `npm run install:all` then `npm run dev`
(you will complete it in Step 30).

Ask the user to copy the design PDF into `docs/` if it isn't there yet.

### 1.7 Verify

- `ls -R server/src client/src | head -50` shows the structure.
- `npx prettier --check .` runs without crashing (warnings are fine).

🛑 **CHECKPOINT** — suggested commit: `chore: scaffold repository structure and root tooling`

---

## STEP 2 — Server skeleton: Express app, env, logger, errors, health

**Goal:** a production-shaped Express 5 server that validates its environment and answers `/api/health`.

### 2.1 Initialise the package

```bash
cd server
npm init -y
npm install express@5 helmet cors pino pino-http zod dotenv
npm install -D pino-pretty
```

Edit `server/package.json`:

```json
{
  "name": "proofchain-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22 <23" },
  "main": "src/index.js",
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

(Keep the `dependencies` blocks npm wrote.)

### 2.2 Environment validation — `src/config/env.js`

All env vars for the whole project are declared here up front, so later steps only read them.

```js
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
    GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
    GEMINI_EMBED_MODEL: z.string().default("gemini-embedding-001"),
    EMBED_DIM: z.coerce.number().int().default(768),
    AI_CONCURRENCY: z.coerce.number().int().min(1).default(2),

    VECTOR_SEARCH_MODE: z.enum(["atlas", "memory"]).default("atlas"),
    VECTOR_INDEX_NAME: z.string().default("passage_vector_index"),

    S2_API_KEY: z.string().optional(),
    CONTACT_EMAIL: z.string().email().default("proofchain@example.com"),

    MAX_UPLOAD_MB: z.coerce.number().default(15),
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
```

### 2.3 `server/.env.example`

```bash
NODE_ENV=development
PORT=4000
LOG_LEVEL=debug
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/proofchain?retryWrites=true&w=majority
JWT_SECRET=replace-with-a-long-random-string-of-at-least-32-chars
JWT_EXPIRES_IN=7d
CORS_ORIGINS=http://localhost:5173
AI_MOCK=true
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_EMBED_MODEL=gemini-embedding-001
EMBED_DIM=768
AI_CONCURRENCY=2
VECTOR_SEARCH_MODE=atlas
VECTOR_INDEX_NAME=passage_vector_index
S2_API_KEY=
CONTACT_EMAIL=you@example.com
MAX_UPLOAD_MB=15
```

Tell the user to `cp server/.env.example server/.env` and generate a secret with
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

### 2.4 Logger — `src/utils/logger.js`

```js
import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.isTest ? "silent" : env.LOG_LEVEL,
  redact: ["req.headers.authorization", "*.password", "*.passwordHash", "*.token"],
  transport: env.isProd || env.isTest ? undefined : { target: "pino-pretty", options: { colorize: true } },
});
```

### 2.5 Errors — `src/utils/errors.js` and `src/middleware/errors.js`

```js
// src/utils/errors.js
export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const notFoundError = (what = "Resource") => new AppError(404, `${what} not found`);
export const forbidden = (msg = "Forbidden") => new AppError(403, msg);
```

```js
// src/middleware/errors.js
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
```

> `mongoose` isn't installed until Step 3. Install it now (`npm install mongoose`) so this import works.

### 2.6 CORS — `src/config/cors.js`

```js
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
  maxAge: 600,
};
```

### 2.7 Health route — `src/routes/health.js`

```js
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
```

### 2.8 App factory — `src/app.js`

```js
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { logger } from "./utils/logger.js";
import { corsOptions } from "./config/cors.js";
import { healthRouter } from "./routes/health.js";
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
  // more routers are mounted here in later steps

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
```

### 2.9 Entry point — `src/index.js` (temporary version; Step 3 adds the DB)

```js
import http from "node:http";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { logger } from "./utils/logger.js";

const server = http.createServer(createApp());
server.listen(env.PORT, "0.0.0.0", () => logger.info(`API listening on :${env.PORT}`));
```

### 2.10 Verify

```bash
cd server && npm run dev
curl http://localhost:4000/api/health      # → {"status":"ok",...,"db":"disconnected"}
curl http://localhost:4000/api/nope        # → 404 JSON
```

Also confirm that deleting `JWT_SECRET` from `.env` makes the server exit with a clear message.

🛑 **CHECKPOINT** — suggested commit: `feat(server): express skeleton with env validation, logging, errors and health route`

---

## STEP 3 — MongoDB connection, graceful shutdown, test setup

**Goal:** connect to MongoDB, shut down cleanly on Render's `SIGTERM`, and set up the test harness used by
every later step.

### 3.1 Install

```bash
cd server
npm install mongoose
npm install -D vitest supertest mongodb-memory-server
```

### 3.2 `src/config/db.js`

```js
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
```

### 3.3 Final `src/index.js`

```js
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
```

### 3.4 Test harness

**`server/vitest.config.js`**

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    globalSetup: ["./tests/globalSetup.js"],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
```

**`server/tests/globalSetup.js`** — one in-memory MongoDB for the whole run:

```js
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod;
export async function setup() {
  mongod = await MongoMemoryServer.create();
  process.env.TEST_MONGODB_URI = mongod.getUri();
}
export async function teardown() {
  await mongod?.stop();
}
```

**`server/tests/setup.js`** — env must be set **before** `env.js` is imported:

```js
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI ?? "mongodb://127.0.0.1:27017/proofchain-test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.AI_MOCK = "true";
process.env.VECTOR_SEARCH_MODE = "memory";
process.env.CORS_ORIGINS = "http://localhost:5173";
```

**`server/tests/helpers/db.js`**

```js
import mongoose from "mongoose";
import { beforeAll, afterAll, afterEach } from "vitest";

export function useTestDb() {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
  });
  afterEach(async () => {
    const { collections } = mongoose.connection;
    await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  });
  afterAll(async () => {
    await mongoose.disconnect();
  });
}
```

**`server/tests/integration/health.test.js`**

```js
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
  it("returns JSON 404 for unknown routes", async () => {
    const res = await request(createApp()).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Route not found/);
  });
});
```

### 3.5 Verify

- `npm test` passes.
- With a real `MONGODB_URI` in `.env` (local MongoDB or an Atlas cluster), `npm run dev` logs
  "MongoDB connected" and `/api/health` reports `"db":"connected"`.
  If the user has no database yet, that's fine: Atlas is set up in Step 6. Note it in the checkpoint.

🛑 **CHECKPOINT** — suggested commit: `feat(server): mongodb connection, graceful shutdown and test harness`

---

## STEP 4 — Client skeleton: Vite + React + Tailwind + routes

**Goal:** a React app with routing and page shells, written by hand (no interactive scaffolder) so it
fits the Step 1 folder structure.

### 4.1 Install

```bash
cd client
npm init -y
npm install react react-dom react-router @tanstack/react-query axios clsx
npm install -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite
```

**`client/package.json`** scripts and type:

```json
{
  "name": "proofchain-client",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

### 4.2 Vite config — `client/vite.config.js`

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
});
```

### 4.3 `client/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ProofChain</title>
  </head>
  <body class="bg-surface text-ink antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

Add a simple `client/public/favicon.svg` (for example two linked rounded rectangles in navy).

### 4.4 Styles and design tokens — `client/src/styles/index.css`

Colours mirror the design document (navy, teal, and stance colours).

```css
@import "tailwindcss";

@theme {
  --color-navy: #1f3a5f;
  --color-teal: #17806f;
  --color-ink: #222831;
  --color-muted: #5c6670;
  --color-line: #d5dbe1;
  --color-surface: #f7f9fb;
  --color-supports: #2e8b57;
  --color-contradicts: #c0392b;
  --color-inconclusive: #c98b0b;
  --color-disputed: #6c4ab6;
  --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}

@layer components {
  .card { @apply rounded-xl border border-line bg-white p-4 shadow-sm; }
  .btn { @apply inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50; }
  .btn-primary { @apply btn bg-navy text-white hover:bg-navy/90; }
  .btn-ghost { @apply btn text-ink hover:bg-black/5; }
  .input { @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20; }
}
```

### 4.5 Entry and routes

**`client/src/main.jsx`**

```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.jsx";
import "./styles/index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

**`client/src/App.jsx`**

```jsx
import { Routes, Route, Navigate } from "react-router";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import ProjectsPage from "./pages/ProjectsPage.jsx";
import WorkspacePage from "./pages/WorkspacePage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import AppShell from "./components/layout/AppShell.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId/*" element={<WorkspacePage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
```

**`client/src/components/layout/AppShell.jsx`**

```jsx
import { Outlet, Link } from "react-router";

export default function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-line bg-white px-4">
        <Link to="/projects" className="font-semibold text-navy">ProofChain</Link>
        <div id="header-right" />
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
```

Create simple shells for `LoginPage`, `RegisterPage`, `ProjectsPage`, `WorkspacePage` (shows the
`projectId` from `useParams()`), and `NotFoundPage`, each rendering a heading in a `.card`.

### 4.6 Verify

- `npm run dev` → http://localhost:5173 redirects to `/projects`; `/login` and `/register` render; an
  unknown path shows the 404 page.
- `npm run build` succeeds and creates `client/dist`.

🛑 **CHECKPOINT** — suggested commit: `feat(client): vite react app with tailwind theme and route shells`

---

## STEP 5 — Client API layer, server-wake banner, Vercel config

**Goal:** the client talks to the API through one configurable Axios instance, handles Render's cold
start gracefully, and is ready for Vercel.

### 5.1 `client/.env.example`

```bash
VITE_API_URL=http://localhost:4000
```

Tell the user to `cp client/.env.example client/.env`.

### 5.2 `client/src/api/client.js`

```js
import axios from "axios";

export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
if (!API_URL) console.warn("VITE_API_URL is not set");

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 60_000, // generous: Render free tier can take ~50s to wake
});

// Normalise errors to { status, message, issues }
export function toApiError(err) {
  if (err.response) {
    return {
      status: err.response.status,
      message: err.response.data?.error ?? "Request failed",
      issues: err.response.data?.issues,
    };
  }
  if (err.code === "ECONNABORTED") return { status: 0, message: "The server took too long to respond." };
  return { status: 0, message: "Cannot reach the server. Check your connection." };
}
```

(Step 8 adds the auth interceptors to this instance.)

### 5.3 `client/src/hooks/useServerStatus.js`

```js
import { useEffect, useState } from "react";
import { api } from "../api/client.js";

// 'checking' → 'ok' | 'waking' | 'down'
export function useServerStatus() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let cancelled = false;
    const slowTimer = setTimeout(() => !cancelled && setStatus((s) => (s === "checking" ? "waking" : s)), 2500);

    (async () => {
      for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
        try {
          await api.get("/health", { timeout: 70_000 });
          if (!cancelled) setStatus("ok");
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      if (!cancelled) setStatus("down");
    })();

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, []);

  return status;
}
```

### 5.4 `client/src/components/common/ServerStatusBanner.jsx`

```jsx
import { useServerStatus } from "../../hooks/useServerStatus.js";

export default function ServerStatusBanner() {
  const status = useServerStatus();
  if (status === "ok" || status === "checking") return null;
  const waking = status === "waking";
  return (
    <div className={`px-4 py-2 text-center text-sm ${waking ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800"}`}>
      {waking
        ? "Waking up the server (free hosting sleeps when idle). This can take up to a minute…"
        : "The server is unreachable right now. Please try again shortly."}
    </div>
  );
}
```

Render it at the top of `AppShell` and on the login/register pages.

### 5.5 Vercel SPA config — `client/vercel.json`

Without this, refreshing `/projects/123` on Vercel returns a 404.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### 5.6 Verify

- With the server running, the banner stays hidden.
- Stop the server and reload: after ~2.5s the amber "waking" banner appears, then the red one.
- `npm run build` still succeeds.

🛑 **CHECKPOINT** — suggested commit: `feat(client): api client, cold-start banner and vercel spa config`

---

## STEP 6 — Deploy the skeleton (Atlas, Render, Vercel)

**Goal:** deploy now, while the app is tiny, so every later step is deployed continuously.
Claude Code writes the config and docs; **the user clicks through the dashboards.**

### 6.1 `render.yaml` (repo root)

```yaml
services:
  - type: web
    name: proofchain-api
    runtime: node
    rootDir: server
    plan: free
    buildCommand: npm ci
    startCommand: npm start
    healthCheckPath: /api/health
    autoDeploy: true
    envVars:
      - key: NODE_ENV
        value: production
      - key: NODE_VERSION
        value: "22"
      - key: LOG_LEVEL
        value: info
      - key: MONGODB_URI
        sync: false
      - key: JWT_SECRET
        generateValue: true
      - key: JWT_EXPIRES_IN
        value: 7d
      - key: CORS_ORIGINS
        sync: false
      - key: AI_MOCK
        value: "false"
      - key: GEMINI_API_KEY
        sync: false
      - key: GEMINI_MODEL
        value: gemini-2.5-flash
      - key: GEMINI_EMBED_MODEL
        value: gemini-embedding-001
      - key: EMBED_DIM
        value: "768"
      - key: AI_CONCURRENCY
        value: "2"
      - key: VECTOR_SEARCH_MODE
        value: atlas
      - key: VECTOR_INDEX_NAME
        value: passage_vector_index
      - key: S2_API_KEY
        sync: false
      - key: CONTACT_EMAIL
        sync: false
      - key: MAX_UPLOAD_MB
        value: "15"
```

`sync: false` means "ask the user for the value in the dashboard". Render injects `PORT` itself.

### 6.2 Production smoke test — `scripts/smoke.mjs`

```js
// Usage: API_URL=https://proofchain-api.onrender.com WEB_URL=https://proofchain.vercel.app node scripts/smoke.mjs
const API_URL = process.env.API_URL?.replace(/\/$/, "");
const WEB_URL = process.env.WEB_URL?.replace(/\/$/, "");
if (!API_URL || !WEB_URL) {
  console.error("Set API_URL and WEB_URL");
  process.exit(1);
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

await check("API health (may take ~60s if asleep)", async () => {
  const res = await fetch(`${API_URL}/api/health`, { signal: AbortSignal.timeout(90_000) });
  const body = await res.json();
  if (body.status !== "ok") throw new Error(JSON.stringify(body));
  if (body.db !== "connected") throw new Error(`db is ${body.db}`);
});

await check("CORS allows the web origin", async () => {
  const res = await fetch(`${API_URL}/api/health`, { headers: { Origin: WEB_URL } });
  const allowed = res.headers.get("access-control-allow-origin");
  if (allowed !== WEB_URL) throw new Error(`access-control-allow-origin = ${allowed}`);
});

await check("Web app serves index.html on deep links", async () => {
  const res = await fetch(`${WEB_URL}/projects/some-id`);
  const html = await res.text();
  if (!res.ok || !html.includes('id="root"')) throw new Error(`status ${res.status}`);
});
```

### 6.3 `docs/deployment.md`

Write the full guide below into the file, then **show it to the user and stop** so they can do it.

```markdown
# Deployment

## 1. MongoDB Atlas
1. Create a free M0 cluster (choose a region close to your Render region, e.g. Singapore or Mumbai if available).
2. Database Access → add a database user with a strong password (role: readWrite on any database).
3. Network Access → add 0.0.0.0/0. (Render's free tier has no static outbound IPs.)
4. Connect → Drivers → copy the URI, insert the password, and add the database name `/proofchain`.

## 2. API keys
- Gemini: Google AI Studio → Get API key.
- Semantic Scholar (recommended): request a free API key on the Semantic Scholar API page.
  The app works without it but is rate-limited more strictly.

## 3. Render (API)
1. Push the repo to GitHub.
2. Render → New → Blueprint → select the repo. Render reads render.yaml.
3. Fill the `sync: false` variables: MONGODB_URI, GEMINI_API_KEY, S2_API_KEY (optional), CONTACT_EMAIL,
   and CORS_ORIGINS (temporarily `http://localhost:5173`).
4. Deploy, then open https://<service>.onrender.com/api/health → db should be "connected".

## 4. Vercel (client)
1. Vercel → Add New Project → import the repo.
2. Root Directory: `client`. Framework preset: Vite. Build: `npm run build`. Output: `dist`.
3. Environment variable: VITE_API_URL = https://<service>.onrender.com (no trailing slash).
4. Deploy.

## 5. Connect them
1. In Render, set CORS_ORIGINS to: `https://<your-app>.vercel.app,https://<your-app>-*.vercel.app,http://localhost:5173`
   (the wildcard entry allows Vercel preview deployments).
2. Redeploy the API.
3. Run: `API_URL=... WEB_URL=... npm run smoke` from the repo root.

## Notes
- Every push to main redeploys both services.
- Env vars changed in Vercel need a redeploy to take effect (they're baked into the build).
- After adding new env vars in later steps, update them in the Render dashboard too.
```

### 6.4 Verify (after the user finishes the dashboard steps)

- `npm run smoke` passes all three checks.
- The deployed Vercel site loads and the banner disappears once the API is awake.

Ask the user for the two production URLs and record them in `README.md` under "Live".

🛑 **CHECKPOINT** — suggested commit: `chore(deploy): render blueprint, deployment guide and smoke test`

---

## STEP 7 — Auth backend

**Goal:** register, login and "who am I" endpoints with JWT, validation middleware and rate limiting.

### 7.1 Install

```bash
cd server
npm install jsonwebtoken bcryptjs express-rate-limit
```

### 7.2 Validation middleware — `src/middleware/validate.js`

Express 5 makes `req.query` read-only, so validated data goes on `req.valid`.

```js
export const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  for (const key of ["body", "params", "query"]) {
    if (schemas[key]) req.valid[key] = schemas[key].parse(req[key] ?? {}); // ZodError → 400 via errorHandler
  }
  next();
};
```

### 7.3 User model — `src/models/User.js`

```js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  },
});

export const User = mongoose.model("User", userSchema);
```

### 7.4 Auth service — `src/services/auth/authService.js`

```js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../../models/User.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";

export const signToken = (user) =>
  jwt.sign({ sub: user.id ?? user._id.toString() }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

export async function register({ name, email, password }) {
  const exists = await User.exists({ email: email.toLowerCase() });
  if (exists) throw new AppError(409, "An account with this email already exists");
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, passwordHash });
  return { user, token: signToken(user) };
}

export async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new AppError(401, "Invalid email or password");
  return { user, token: signToken(user) };
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new AppError(401, "Invalid or expired token");
  }
}
```

### 7.5 Auth middleware — `src/middleware/auth.js`

```js
import { verifyToken } from "../services/auth/authService.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/errors.js";

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) throw new AppError(401, "Authentication required");
  const payload = verifyToken(token);
  const user = await User.findById(payload.sub);
  if (!user) throw new AppError(401, "User no longer exists");
  req.user = user;
  next();
}
```

(Express 5 forwards errors thrown in async middleware to the error handler automatically.)

### 7.6 Rate limits — `src/middleware/rateLimits.js`

```js
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";

const base = { standardHeaders: "draft-7", legacyHeaders: false, skip: () => env.isTest };

export const authLimiter = rateLimit({ ...base, windowMs: 15 * 60_000, limit: 20 });
// Expensive AI routes (used from Step 19 on): per user, not per IP
export const aiLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (req) => req.user?.id ?? req.ip,
});
```

### 7.7 Routes — `src/routes/auth.js`

```js
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimits.js";
import * as auth from "../services/auth/authService.js";

export const authRouter = Router();

const registerBody = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});
const loginBody = z.object({ email: z.string().trim().email(), password: z.string().min(1) });

authRouter.post("/register", authLimiter, validate({ body: registerBody }), async (req, res) => {
  const { user, token } = await auth.register(req.valid.body);
  res.status(201).json({ user, token });
});

authRouter.post("/login", authLimiter, validate({ body: loginBody }), async (req, res) => {
  const { user, token } = await auth.login(req.valid.body);
  res.json({ user, token });
});

authRouter.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));
```

Mount in `app.js`: `app.use("/api/auth", authRouter);` (before `notFound`).

### 7.8 Tests — `tests/integration/auth.test.js`

Cover: register returns 201 + token and no `passwordHash`; duplicate email → 409; bad password → 401;
`/me` without token → 401; `/me` with token → the user; short password → 400 with issues.

Also add a helper used by every later integration test, `tests/helpers/auth.js`:

```js
import request from "supertest";

export async function registerAndLogin(app, overrides = {}) {
  const body = { name: "Test User", email: `u${Date.now()}${Math.random()}@test.dev`, password: "password123", ...overrides };
  const res = await request(app).post("/api/auth/register").send(body);
  return { token: res.body.token, user: res.body.user, auth: { Authorization: `Bearer ${res.body.token}` } };
}
```

### 7.9 Verify

`npm test` passes. Manual check with curl: register, login, then `GET /api/auth/me` with the token.

🛑 **CHECKPOINT** — suggested commit: `feat(auth): jwt register/login/me with validation and rate limiting`

---

## STEP 8 — Auth frontend

**Goal:** login/register pages, token persistence, automatic `Authorization` header, protected routes.

### 8.1 Auth API — `client/src/api/auth.js`

```js
import { api } from "./client.js";

export const authApi = {
  register: (data) => api.post("/auth/register", data).then((r) => r.data),
  login: (data) => api.post("/auth/login", data).then((r) => r.data),
  me: () => api.get("/auth/me").then((r) => r.data.user),
};
```

### 8.2 Token storage + interceptors — add to `client/src/api/client.js`

```js
const TOKEN_KEY = "proofchain.token";
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.startsWith("/auth/")) onUnauthorized();
    return Promise.reject(err);
  },
);
```

> Note for `docs/decisions.md`: the token lives in `localStorage` for simplicity across domains. The
> trade-off is XSS exposure, which we limit by never rendering user HTML (`dangerouslySetInnerHTML` is banned).

### 8.3 `client/src/context/AuthContext.jsx`

```jsx
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authApi } from "../api/auth.js";
import { tokenStore, setUnauthorizedHandler } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    qc.clear();
  }, [qc]);

  useEffect(() => setUnauthorizedHandler(logout), [logout]);

  useEffect(() => {
    if (!tokenStore.get()) return;
    authApi.me().then(setUser).catch(logout).finally(() => setLoading(false));
  }, [logout]);

  const handleAuth = ({ user, token }) => {
    tokenStore.set(token);
    setUser(user);
  };

  const value = {
    user,
    loading,
    login: async (data) => handleAuth(await authApi.login(data)),
    register: async (data) => handleAuth(await authApi.register(data)),
    logout,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
```

Wrap `<App />` with `<AuthProvider>` in `main.jsx` (inside `QueryClientProvider`).

### 8.4 Protected routes — `client/src/components/auth/ProtectedRoute.jsx`

```jsx
import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../../context/AuthContext.jsx";
import Spinner from "../common/Spinner.jsx";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Loading your account…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
```

In `App.jsx`, wrap the `AppShell` route group in `<Route element={<ProtectedRoute />}>`.
Create a small `Spinner` component in `components/common/`.

### 8.5 Login and register pages

Build both with a shared `AuthForm` component (`components/auth/AuthForm.jsx`): controlled inputs,
a submit button with a pending state, and errors shown from `toApiError(err).message` plus Zod
`issues` under the matching fields. After success, navigate to `location.state?.from?.pathname ?? "/projects"`.
Add a logout button and the user's name to the `AppShell` header.

### 8.6 Verify

- Register → land on `/projects`; reload → still logged in; logout → redirected to `/login`.
- Visiting `/projects` while logged out redirects to `/login` and returns afterwards.
- Works against the **deployed** API too (temporarily set `VITE_API_URL` to the Render URL).

🛑 **CHECKPOINT** — suggested commit: `feat(client): auth context, login/register pages and protected routes`

---

## STEP 9 — Projects backend, roles, human-readable IDs

**Goal:** projects with members and roles, a membership guard used by every project route, and a counter
that produces IDs like `P-14` and `C2` from the design document.

### 9.1 Models

**`src/models/Project.js`**

```js
import mongoose from "mongoose";

export const ROLES = ["viewer", "editor", "owner"]; // ordered by power

const memberSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ROLES, required: true },
  },
  { _id: false },
);

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    topics: [{ type: String, trim: true, maxlength: 80 }],
    level: { type: String, enum: ["beginner", "intermediate", "advanced"], default: "intermediate" },
    goal: { type: String, trim: true, maxlength: 300, default: "" },
    members: { type: [memberSchema], validate: (v) => v.length > 0 },
  },
  { timestamps: true },
);
projectSchema.index({ "members.userId": 1 });

export const Project = mongoose.model("Project", projectSchema);
```

**`src/models/Counter.js`** and **`src/utils/ids.js`**

```js
// src/models/Counter.js
import mongoose from "mongoose";
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
export const Counter = mongoose.model("Counter", counterSchema);
```

```js
// src/utils/ids.js
import { Counter } from "../models/Counter.js";

const PREFIX = { passage: "P-", claim: "C", link: "L-", batch: "B" };

/** Reserve `count` sequential human IDs for a project, e.g. ["P-13","P-14"]. Atomic. */
export async function reserveHumanIds(projectId, kind, count = 1) {
  const doc = await Counter.findOneAndUpdate(
    { _id: `${projectId}:${kind}` },
    { $inc: { seq: count } },
    { upsert: true, new: true },
  );
  const first = doc.seq - count + 1;
  return Array.from({ length: count }, (_, i) => `${PREFIX[kind]}${first + i}`);
}
export const nextHumanId = async (projectId, kind) => (await reserveHumanIds(projectId, kind, 1))[0];
```

### 9.2 Role guard — `src/middleware/projectRole.js`

```js
import mongoose from "mongoose";
import { Project, ROLES } from "../models/Project.js";
import { AppError, notFoundError } from "../utils/errors.js";

export const requireProjectRole = (minRole = "viewer") => async (req, _res, next) => {
  const { projectId } = req.params;
  if (!mongoose.isValidObjectId(projectId)) throw notFoundError("Project");
  const project = await Project.findById(projectId);
  if (!project) throw notFoundError("Project");
  const member = project.members.find((m) => m.userId.equals(req.user._id));
  if (!member) throw notFoundError("Project"); // don't reveal existence
  if (ROLES.indexOf(member.role) < ROLES.indexOf(minRole)) throw new AppError(403, `Requires ${minRole} role`);
  req.project = project;
  req.role = member.role;
  next();
};
```

### 9.3 Routes — `src/routes/projects.js`

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/projects` | auth | Projects where the user is a member |
| POST | `/api/projects` | auth | Create; creator becomes owner |
| GET | `/api/projects/:projectId` | viewer | Project + members (names/emails populated) + caller's role |
| PATCH | `/api/projects/:projectId` | editor | name, description, topics, level, goal |
| POST | `/api/projects/:projectId/members` | owner | Add an existing user by email with a role |
| DELETE | `/api/projects/:projectId/members/:userId` | owner | Remove a member (not the last owner) |

Use `Router({ mergeParams: true })` and `requireAuth` on the whole router. Keep the logic in
`src/services/projects/projectService.js` and keep routes thin.

**Create body:** `{ name, description?, topics?: string[] (max 10), level?, goal? }`.
In Step 23 project creation will also create the interest profile, so leave a comment there.

### 9.4 Tests

`tests/integration/projects.test.js`: creator is owner; non-members get 404; viewers can't PATCH (403);
owners can add members; `reserveHumanIds` gives unique consecutive IDs under concurrent calls
(`Promise.all` of 20 calls → 20 distinct IDs).

🛑 **CHECKPOINT** — suggested commit: `feat(projects): projects with member roles, role guard and human-readable ids`

---

## STEP 10 — Projects page and workspace layout

**Goal:** list and create projects, and build the three-panel workspace that every later feature plugs into.

### 10.1 API — `client/src/api/projects.js`

```js
import { api } from "./client.js";
export const projectsApi = {
  list: () => api.get("/projects").then((r) => r.data.projects),
  get: (id) => api.get(`/projects/${id}`).then((r) => r.data),
  create: (data) => api.post("/projects", data).then((r) => r.data.project),
  update: (id, data) => api.patch(`/projects/${id}`, data).then((r) => r.data.project),
  addMember: (id, data) => api.post(`/projects/${id}/members`, data).then((r) => r.data),
};
```

### 10.2 Projects page

`pages/ProjectsPage.jsx` uses `useQuery({ queryKey: ["projects"], queryFn: projectsApi.list })` and shows
cards (name, topics as chips, role, last updated). A "New project" button opens
`components/projects/NewProjectDialog.jsx` with the onboarding fields from the walkthrough:
**name**, **topics** (comma-separated → chips), **level**, and **goal** ("literature review for a seminar").
On success, invalidate `["projects"]` and navigate to the new workspace.

Include empty, loading and error states (use one shared `components/common/StateMessage.jsx`).

### 10.3 Workspace layout

`pages/WorkspacePage.jsx` loads the project with `hooks/useProject.js`
(`useQuery(["project", projectId])`) and renders `components/layout/WorkspaceLayout.jsx`:

```
┌──────────────────────────────────────────────────────────────────────┐
│ header: project name · role · presence (Step 29) · export (Step 30) │
├───────────────┬──────────────────────────────────┬───────────────────┤
│ Chat (left)   │ Tabs: Graph | Claims | Sources | │ Recommendations   │
│ ~28%          │       Review | Log               │ (right) ~28%      │
│               │ (center)                         │ + Profile tab     │
└───────────────┴──────────────────────────────────┴───────────────────┘
```

```jsx
// components/layout/WorkspaceLayout.jsx (core idea)
import { NavLink, Routes, Route, Navigate } from "react-router";

const TABS = ["graph", "claims", "sources", "review", "log"];

export default function WorkspaceLayout({ project, left, right, views }) {
  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-1 lg:grid-cols-[minmax(280px,28%)_1fr_minmax(300px,28%)]">
      <aside className="hidden min-h-0 border-r border-line bg-white lg:flex lg:flex-col">{left}</aside>
      <section className="flex min-h-0 flex-col">
        <nav className="flex gap-1 border-b border-line bg-white px-3">
          {TABS.map((t) => (
            <NavLink key={t} to={t} className={({ isActive }) =>
              `px-3 py-2 text-sm capitalize ${isActive ? "border-b-2 border-navy font-medium text-navy" : "text-muted"}`}>
              {t}
            </NavLink>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <Routes>
            <Route index element={<Navigate to="claims" replace />} />
            {TABS.map((t) => <Route key={t} path={`${t}/*`} element={views[t]} />)}
          </Routes>
        </div>
      </section>
      <aside className="hidden min-h-0 border-l border-line bg-white lg:flex lg:flex-col">{right}</aside>
    </div>
  );
}
```

For now pass placeholder components (`<Placeholder title="Evidence graph — Step 28" />` etc.).
On screens narrower than `lg`, show the side panels as tabs/drawers (a simple toggle bar is enough)
so the app is usable on a phone.

### 10.4 Verify

Create a project in the deployed app, open it, switch tabs, and reload a deep link like
`/projects/<id>/sources` on Vercel (it must not 404).

🛑 **CHECKPOINT** — suggested commit: `feat(client): projects page, onboarding dialog and three-panel workspace`

---

## STEP 11 — Core domain models and audit service

**Goal:** create every remaining Mongoose model from the design document (Section 9) in one place,
plus the append-only audit service.

### 11.1 Shared helper — `src/models/plugins.js`

```js
export function toJSONPlugin(schema) {
  schema.set("toJSON", {
    virtuals: true,
    transform: (_d, ret) => {
      ret.id = ret._id?.toString();
      delete ret._id;
      delete ret.__v;
      delete ret.embedding; // never send vectors to the client
      return ret;
    },
  });
}
```

Apply it with `schema.plugin(toJSONPlugin)` on every model below (and refactor `User` to use it).

### 11.2 Models (create one file per model in `src/models/`)

```js
// Source.js
const sourceSchema = new Schema({
  projectId: { type: ObjectId, ref: "Project", required: true, index: true },
  addedBy: { type: ObjectId, ref: "User", required: true },
  kind: { type: String, enum: ["url", "pdf", "paper"], required: true },
  url: String,
  fileName: String,
  ids: { doi: String, s2Id: String, openAlexId: String, arxivId: String },
  title: { type: String, default: "Untitled source" },
  authors: [String],
  venue: String,
  year: Number,
  sourceType: { type: String, enum: ["peer_reviewed", "preprint", "vendor", "news", "blog", "unknown"], default: "unknown" },
  depth: { type: String, enum: ["full_text", "abstract_only"], default: "full_text" },
  status: { type: String, enum: ["queued", "processing", "ready", "failed"], default: "queued", index: true },
  error: String,
  rawPages: { type: [String], select: false },   // extracted text before chunking (lets jobs resume)
  text: { type: String, select: false },          // canonical normalised text (offsets refer to this)
  pageStarts: { type: [Number], select: false },  // char offset where each page starts in `text`
  textHash: String,
  retrievedAt: Date,
  passageCount: { type: Number, default: 0 },
}, { timestamps: true });
sourceSchema.index({ projectId: 1, textHash: 1 }, { unique: true, partialFilterExpression: { textHash: { $type: "string" } } });
```

```js
// Passage.js
const passageSchema = new Schema({
  projectId: { type: ObjectId, required: true },
  sourceId: { type: ObjectId, ref: "Source", required: true, index: true },
  humanId: { type: String, required: true },          // "P-14"
  text: { type: String, required: true },
  page: Number,
  paragraph: Number,
  charStart: { type: Number, required: true },
  charEnd: { type: Number, required: true },
  embedding: { type: [Number], select: false },
}, { timestamps: true });
passageSchema.index({ projectId: 1, humanId: 1 }, { unique: true });
```

```js
// Claim.js
const gapSchema = new Schema({
  type: { type: String, enum: ["single_source", "interested_party_only", "unchallenged", "stale", "abstract_only", "contested"] },
  weight: Number,
  queryHint: String,
  detectedAt: Date,
}, { _id: false });

const claimSchema = new Schema({
  projectId: { type: ObjectId, required: true, index: true },
  humanId: { type: String, required: true },          // "C2"
  text: { type: String, required: true, maxlength: 500 },
  scopeNote: String,
  origin: { type: String, enum: ["user", "ai_from_source", "ai_from_question"], required: true },
  createdBy: { type: ObjectId, ref: "User" },
  status: { type: String, enum: ["open", "supported", "contested", "unsupported"], default: "open" },             // from CONFIRMED links
  provisionalStatus: { type: String, enum: ["open", "supported", "contested", "unsupported"], default: "open" },  // from ALL links
  gaps: [gapSchema],
  embedding: { type: [Number], select: false },
}, { timestamps: true });
claimSchema.index({ projectId: 1, humanId: 1 }, { unique: true });
```

```js
// EvidenceLink.js
export const STANCES = ["supports", "contradicts", "inconclusive"];
export const LINK_STATUSES = ["ai_suggested", "under_review", "confirmed", "rejected", "disputed"];
const linkSchema = new Schema({
  projectId: { type: ObjectId, required: true, index: true },
  humanId: String,                                    // "L-88"
  claimId: { type: ObjectId, ref: "Claim", required: true, index: true },
  passageId: { type: ObjectId, ref: "Passage", required: true },
  sourceId: { type: ObjectId, ref: "Source", required: true },
  stance: { type: String, enum: STANCES, required: true },
  scope: String,
  status: { type: String, enum: LINK_STATUSES, default: "ai_suggested" },
  origin: { type: String, enum: ["ai", "user"], default: "ai" },
  quote: String,
  matchType: { type: String, enum: ["exact", "near_match"] },
  matchScore: Number,
  aiRationale: String,
  reviewedBy: { type: ObjectId, ref: "User" },
  reviewedAt: Date,
}, { timestamps: true });
linkSchema.index({ claimId: 1, passageId: 1 }, { unique: true });
```

```js
// InterestProfile.js
const profileSchema = new Schema({
  projectId: { type: ObjectId, required: true },
  userId: { type: ObjectId, required: true },
  topics: [String],
  level: String,
  vector: { type: [Number], select: false },
  questionHistory: [{ text: String, embedding: { type: [Number], select: false }, at: Date }],
  exclusions: [{ concept: String, strength: { type: String, enum: ["soft", "hard"] }, reason: String,
                 embedding: { type: [Number], select: false }, createdAt: Date }],
}, { timestamps: true });
profileSchema.index({ projectId: 1, userId: 1 }, { unique: true });
```

```js
// RecommendationBatch.js
export const SLOTS = ["CORE", "CORE_2", "FOUNDATION", "FRONTIER", "CHALLENGER"];
const itemSchema = new Schema({
  slot: { type: String, enum: SLOTS },
  slotNote: String,                       // e.g. "No strong recent work found; showing another core paper"
  paper: {
    ids: { doi: String, s2Id: String, openAlexId: String, arxivId: String },
    title: String, authors: [String], venue: String, year: Number,
    abstract: String, citationCount: Number, oaPdfUrl: String, url: String,
  },
  score: Number,
  scoreBreakdown: Schema.Types.Mixed,
  gapTargets: [{ claimId: ObjectId, humanId: String, gapType: String }],
  rationale: String,
  rationaleQuote: String,
  groundingPassed: Boolean,
  verifiedIds: [String],                   // e.g. ["doi","s2","openalex"]
  feedback: { action: String, reason: String, at: Date, by: ObjectId },
}, { _id: false });

const batchSchema = new Schema({
  projectId: { type: ObjectId, required: true, index: true },
  userId: { type: ObjectId, required: true },
  humanId: String,                         // "B2"
  trigger: { type: String, enum: ["onboarding", "question", "gap", "manual"], required: true },
  triggerText: String,
  status: { type: String, enum: ["running", "ready", "failed"], default: "running" },
  error: String,
  items: [itemSchema],
  pipelineLog: [String],
}, { timestamps: true });
```

```js
// Feedback.js — one row per paper decision, so rejected papers never resurface
const feedbackSchema = new Schema({
  projectId: { type: ObjectId, required: true },
  userId: { type: ObjectId, required: true },
  paperKey: { type: String, required: true },   // doi:… | s2:… | oa:… (see Step 22)
  action: { type: String, enum: ["added", "not_relevant", "read", "later"], required: true },
  reason: String,
}, { timestamps: true });
feedbackSchema.index({ projectId: 1, paperKey: 1 });
```

```js
// PaperCache.js — caches scholarly API responses (TTL)
const cacheSchema = new Schema({
  _id: String,                 // provider:sha1(url)
  payload: Schema.Types.Mixed,
  expiresAt: { type: Date, index: { expires: 0 } },
});
```

```js
// AuditEvent.js — append-only
const auditSchema = new Schema({
  projectId: { type: ObjectId, required: true, index: true },
  at: { type: Date, default: Date.now },
  actor: { type: String, required: true },     // userId string or "system" or "ai"
  actorName: String,
  action: { type: String, required: true },    // e.g. "link.review", "link.discarded", "claim.created"
  target: { kind: String, id: ObjectId, humanId: String },
  change: Schema.Types.Mixed,                  // { field: [from, to] }
  reason: String,
});
auditSchema.index({ projectId: 1, "target.id": 1, at: -1 });
```

```js
// Comment.js — threads on links or claims
const commentSchema = new Schema({
  projectId: { type: ObjectId, required: true },
  target: { kind: { type: String, enum: ["link", "claim"] }, id: ObjectId },
  authorId: { type: ObjectId, ref: "User", required: true },
  text: { type: String, required: true, maxlength: 2000 },
  resolved: { type: Boolean, default: false },
}, { timestamps: true });
commentSchema.index({ "target.id": 1, createdAt: 1 });
```

```js
// ChatMessage.js
const chatSchema = new Schema({
  projectId: { type: ObjectId, required: true, index: true },
  userId: { type: ObjectId, ref: "User" },
  role: { type: String, enum: ["user", "agent", "system"], required: true },
  content: { type: String, required: true },
  citations: [{ passageId: ObjectId, humanId: String, sourceId: ObjectId, quote: String, matchType: String }],
  meta: Schema.Types.Mixed,   // { intent, claimId, batchId, validation: {...} }
}, { timestamps: true });
```

(Write each file with the proper `import mongoose from "mongoose"; const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;` header and `export const X = mongoose.model(...)`.)

### 11.3 Audit service — `src/services/audit/auditService.js`

```js
import { AuditEvent } from "../../models/AuditEvent.js";
import { logger } from "../../utils/logger.js";

/** Never throws: an audit failure must not break the user action, but it is logged loudly. */
export async function recordAudit({ projectId, actor, actorName, action, target, change, reason }) {
  try {
    return await AuditEvent.create({ projectId, actor: String(actor), actorName, action, target, change, reason });
  } catch (err) {
    logger.error({ err, action }, "Failed to write audit event");
  }
}

export const auditHistory = (projectId, targetId, limit = 100) =>
  AuditEvent.find({ projectId, ...(targetId && { "target.id": targetId }) }).sort({ at: -1 }).limit(limit).lean();
```

Expose `GET /api/projects/:projectId/audit?targetId=` (viewer) in `src/routes/audit.js`.
**No update or delete routes exist for audit events.**

### 11.4 Tests

`tests/unit/models.test.js`: required fields are enforced; `toJSON` strips `embedding`, `_id`, `__v`;
the unique `(claimId, passageId)` index rejects duplicates (call `await EvidenceLink.init()` first).

🛑 **CHECKPOINT** — suggested commit: `feat(models): domain models, audit event log and audit history route`

---

## STEP 12 — Atlas Vector Search index and retrieval service

**Goal:** a script that creates all indexes in Atlas (including the vector index), and one retrieval
function that works with Atlas in production and in memory in tests.

### 12.1 Vector utilities — `src/utils/vectors.js`

```js
export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
export const norm = (a) => Math.sqrt(dot(a, a));
export function cosine(a, b) {
  const n = norm(a) * norm(b);
  return n === 0 ? 0 : dot(a, b) / n;
}
export function normalize(a) {
  const n = norm(a) || 1;
  return a.map((x) => x / n);
}
/** Weighted average of vectors (weights need not sum to 1). Skips empty vectors. */
export function weightedMean(pairs) {
  const valid = pairs.filter(([v, w]) => v?.length && w > 0);
  if (!valid.length) return null;
  const dim = valid[0][0].length;
  const out = new Array(dim).fill(0);
  let total = 0;
  for (const [v, w] of valid) {
    for (let i = 0; i < dim; i++) out[i] += v[i] * w;
    total += w;
  }
  return normalize(out.map((x) => x / total));
}
```

Unit-test these.

### 12.2 Index script — `server/scripts/createIndexes.js`

```js
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import "../src/models/index.js"; // a barrel file that imports every model (create it)

await mongoose.connect(env.MONGODB_URI);

for (const model of Object.values(mongoose.models)) {
  await model.syncIndexes();
  console.log(`✔ indexes synced: ${model.modelName}`);
}

const passages = mongoose.connection.db.collection("passages");
const existing = await passages.listSearchIndexes().toArray();
if (existing.some((i) => i.name === env.VECTOR_INDEX_NAME)) {
  console.log(`✔ vector index "${env.VECTOR_INDEX_NAME}" already exists (status: ${existing.find((i) => i.name === env.VECTOR_INDEX_NAME).status})`);
} else {
  await passages.createSearchIndex({
    name: env.VECTOR_INDEX_NAME,
    type: "vectorSearch",
    definition: {
      fields: [
        { type: "vector", path: "embedding", numDimensions: env.EMBED_DIM, similarity: "cosine" },
        { type: "filter", path: "projectId" },
        { type: "filter", path: "sourceId" },
      ],
    },
  });
  console.log(`✔ vector index "${env.VECTOR_INDEX_NAME}" requested — Atlas builds it in ~1 minute`);
}
await mongoose.disconnect();
```

Add to `server/package.json`: `"db:indexes": "node scripts/createIndexes.js"`.

> If the Atlas cluster rejects `createSearchIndex` (older driver or tier), the user can create the same
> index in the Atlas UI: Atlas Search → Create Search Index → JSON Editor → Vector Search, using the
> definition above. Document this fallback in `docs/deployment.md`.

> **Important:** if `EMBED_DIM` ever changes, the index must be dropped and recreated and all passages
> re-embedded.

### 12.3 Retrieval service — `src/services/evidence/vectorSearch.js`

```js
import mongoose from "mongoose";
import { Passage } from "../../models/Passage.js";
import { env } from "../../config/env.js";
import { cosine } from "../../utils/vectors.js";

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/**
 * Top-k passages in a project most similar to queryVector.
 * Returns [{ _id, humanId, sourceId, text, page, paragraph, charStart, charEnd, score }]
 */
export async function searchPassages({ projectId, queryVector, limit = 25, sourceIds }) {
  if (env.VECTOR_SEARCH_MODE === "memory") return memorySearch({ projectId, queryVector, limit, sourceIds });

  const filter = { projectId: oid(projectId) };
  if (sourceIds?.length) filter.sourceId = { $in: sourceIds.map(oid) };

  return Passage.aggregate([
    {
      $vectorSearch: {
        index: env.VECTOR_INDEX_NAME,
        path: "embedding",
        queryVector,
        numCandidates: Math.max(limit * 10, 100),
        limit,
        filter,
      },
    },
    { $project: { embedding: 0, score: { $meta: "vectorSearchScore" } } },
  ]);
}

async function memorySearch({ projectId, queryVector, limit, sourceIds }) {
  const q = { projectId: oid(projectId) };
  if (sourceIds?.length) q.sourceId = { $in: sourceIds.map(oid) };
  const all = await Passage.find(q).select("+embedding").lean();
  return all
    .filter((p) => p.embedding?.length)
    .map(({ embedding, ...p }) => ({ ...p, score: cosine(queryVector, embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
```

### 12.4 Verify

- Unit test `memorySearch` with three fake passages and hand-made vectors.
- **User action:** run `npm --prefix server run db:indexes` with `MONGODB_URI` pointing to Atlas.
  Confirm in the Atlas UI that `passage_vector_index` becomes **READY**.

🛑 **CHECKPOINT** — suggested commit: `feat(db): index sync script, atlas vector index and passage retrieval service`

---

## STEP 13 — Gemini client: validated JSON, embeddings, mock mode

**Goal:** one AI module that every feature uses. It enforces schema validation and retries (validation
layer **L5**), limits concurrency, backs off on rate limits, and has a deterministic mock mode for tests
and quota-free development.

### 13.1 Install

```bash
cd server
npm install @google/genai p-limit
```

### 13.2 `src/services/ai/gemini.js`

```js
import { GoogleGenAI } from "@google/genai";
import pLimit from "p-limit";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

let client;
const getClient = () => (client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }));
export const aiLimit = pLimit(env.AI_CONCURRENCY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withBackoff(fn, { retries = 4, base = 1000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.status ?? err?.code;
      const retryable = [429, 500, 502, 503, 504].includes(Number(status));
      if (!retryable || attempt >= retries) throw err;
      const wait = base * 2 ** attempt + Math.random() * 250;
      logger.warn({ status, attempt, wait }, "Gemini call failed, backing off");
      await sleep(wait);
    }
  }
}

const stripFences = (s) => s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
const formatIssues = (zodError) =>
  zodError.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");

/**
 * Ask Gemini for JSON and validate it with a Zod schema (validation layer L5).
 * @param {object} o
 * @param {string} o.task      short name for logs, e.g. "stance.classify"
 * @param {string} o.system    system instruction
 * @param {string} o.prompt    user prompt (must describe the JSON shape)
 * @param {import('zod').ZodTypeAny} o.schema
 * @param {() => any} o.mock   returns a valid object when AI_MOCK=true
 * @param {(data:any) => string|null} [o.check] extra semantic check; return an error message to trigger a retry
 */
export async function generateJson({ task, system, prompt, schema, mock, check, temperature = 0.2, maxRetries = 1 }) {
  if (env.AI_MOCK) {
    if (!mock) throw new Error(`No mock provided for AI task "${task}"`);
    return schema.parse(mock());
  }

  let currentPrompt = prompt;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await aiLimit(() =>
      withBackoff(() =>
        getClient().models.generateContent({
          model: env.GEMINI_MODEL,
          contents: currentPrompt,
          config: { systemInstruction: system, temperature, responseMimeType: "application/json" },
        }),
      ),
    );

    let problem;
    try {
      const parsed = schema.safeParse(JSON.parse(stripFences(res.text ?? "")));
      if (parsed.success) {
        problem = check?.(parsed.data) ?? null;
        if (!problem) return parsed.data;
      } else {
        problem = formatIssues(parsed.error);
      }
    } catch (e) {
      problem = `invalid JSON (${e.message})`;
    }

    lastError = problem;
    logger.warn({ task, attempt, problem }, "AI output rejected");
    currentPrompt = `${prompt}\n\nYour previous reply was rejected: ${problem}\nReply again with corrected JSON only.`;
  }
  throw new AppError(502, `AI output failed validation for ${task}`, { reason: lastError });
}

/** Plain text generation (used rarely; prefer generateJson). */
export async function generateText({ system, prompt, temperature = 0.3, mock }) {
  if (env.AI_MOCK) return mock?.() ?? "Mock response.";
  const res = await aiLimit(() =>
    withBackoff(() =>
      getClient().models.generateContent({
        model: env.GEMINI_MODEL,
        contents: prompt,
        config: { systemInstruction: system, temperature },
      }),
    ),
  );
  return res.text ?? "";
}

export { getClient };
```

### 13.3 `src/services/ai/embeddings.js`

```js
import crypto from "node:crypto";
import { env } from "../../config/env.js";
import { aiLimit, withBackoff, getClient } from "./gemini.js";
import { normalize } from "../../utils/vectors.js";

const BATCH = 50;

/** Deterministic pseudo-embedding for tests: same text → same vector; shared words → similar vectors. */
function mockEmbed(text) {
  const v = new Array(env.EMBED_DIM).fill(0);
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    const h = crypto.createHash("md5").update(word).digest();
    for (let k = 0; k < 4; k++) v[h.readUInt16BE(k * 2) % env.EMBED_DIM] += 1;
  }
  return normalize(v);
}

/**
 * @param {string[]} texts
 * @param {"RETRIEVAL_DOCUMENT"|"RETRIEVAL_QUERY"|"SEMANTIC_SIMILARITY"} taskType
 * @returns {Promise<number[][]>} unit-length vectors
 */
export async function embedTexts(texts, taskType = "RETRIEVAL_DOCUMENT") {
  if (!texts.length) return [];
  if (env.AI_MOCK) return texts.map(mockEmbed);

  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH).map((t) => t.slice(0, 8000));
    const res = await aiLimit(() =>
      withBackoff(() =>
        getClient().models.embedContent({
          model: env.GEMINI_EMBED_MODEL,
          contents: chunk,
          config: { taskType, outputDimensionality: env.EMBED_DIM },
        }),
      ),
    );
    // Reduced-dimension Gemini embeddings are not unit-length: normalise them.
    out.push(...res.embeddings.map((e) => normalize(e.values)));
  }
  return out;
}

export const embedOne = async (text, taskType) => (await embedTexts([text], taskType))[0];
```

### 13.4 Prompt conventions — `src/services/ai/prompts/README.md`

Write this short file for future steps:

```markdown
Every prompt module exports:
- `system`: string
- `build(input)`: returns the user prompt string. Items are always given with IDs, e.g. `[P-14] text…`
- `schema`: Zod schema of the expected JSON
- `mock(input)`: returns a valid object (used when AI_MOCK=true)
- optional `check(input)`: returns (data) => error string | null for semantic checks such as "every passageId must be one I was given"

Rules baked into every system prompt:
- Use only the items provided. Never invent titles, authors, IDs, quotes or numbers.
- Quotes must be copied exactly from the given text.
- If unsure, say so with the "inconclusive"/empty option instead of guessing.
- Reply with JSON only.
```

Add a tiny helper `src/services/ai/prompts/util.js`:

```js
export const formatItems = (items, max = 1200) =>
  items.map((it) => `[${it.id}] ${it.text.slice(0, max)}`).join("\n\n");

export const idsCheck = (allowed, pick) => (data) => {
  const bad = pick(data).filter((id) => !allowed.has(id));
  return bad.length ? `unknown IDs referenced: ${bad.join(", ")}. Use only the IDs given.` : null;
};
```

### 13.5 Tests

`tests/unit/ai.test.js` (runs with `AI_MOCK=true`): `generateJson` returns the schema-parsed mock; throws if
there's no mock; `embedTexts` returns unit vectors of length `EMBED_DIM`; texts sharing words have higher
cosine than unrelated texts. Test `idsCheck` directly.

### 13.6 Verify (live, optional but recommended)

Write `server/scripts/aiPing.js`, which calls `generateJson` with a trivial schema and `embedOne("graph databases")`,
and prints the vector length. The user runs it with `AI_MOCK=false` and a real key. This confirms the model
names in `.env` are valid. If not, update `GEMINI_MODEL`/`GEMINI_EMBED_MODEL` defaults and note it in
`docs/decisions.md`.

🛑 **CHECKPOINT** — suggested commit: `feat(ai): gemini json client with validation/retry, embeddings and mock mode`

---

## STEP 14 — Text normalization and passage chunker

**Goal:** turn extracted pages into one canonical text and a list of passages with exact locations.
These are pure functions, so they are heavily unit-tested.

> Decision (add to `docs/decisions.md`): the **canonical text** of a source is its normalised text.
> All passage offsets and highlights refer to it. We don't map back to the raw HTML/PDF layout.

### 14.1 `src/services/ingestion/normalize.js`

```js
const QUOTES = /[\u2018\u2019\u201A\u201B\u2032]/g;
const DQUOTES = /[\u201C\u201D\u201E\u201F\u2033]/g;
const DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g;

/** Normalise one page/section of extracted text. Keeps paragraph breaks as "\n\n". */
export function normalizeText(raw) {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u00AD/g, "")                     // soft hyphens
    .replace(/([A-Za-z])-\n([a-z])/g, "$1$2")  // re-join words hyphenated across line breaks
    .replace(QUOTES, "'")
    .replace(DQUOTES, '"')
    .replace(DASHES, "-")
    .replace(/[\t\f\v\u00A0]+/g, " ")
    .replace(/\n{2,}/g, "\u0000")              // protect paragraph breaks
    .replace(/\s*\n\s*/g, " ")                 // single newlines inside paragraphs → spaces
    .replace(/ {2,}/g, " ")
    .replace(/\s*\u0000\s*/g, "\n\n")
    .trim();
}

/** Join normalised pages; returns canonical text and where each page starts. */
export function joinPages(pages) {
  let text = "";
  const pageStarts = [];
  for (const page of pages) {
    const norm = normalizeText(page);
    if (text) text += "\n\n";
    pageStarts.push(text.length);
    text += norm;
  }
  return { text, pageStarts };
}

export function pageForOffset(pageStarts, offset) {
  let lo = 0, hi = pageStarts.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pageStarts[mid] <= offset) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans + 1; // 1-based page numbers
}
```

### 14.2 `src/services/ingestion/chunk.js`

Uses `Intl.Segmenter` (built into Node 22) for sentence splitting.

```js
import { pageForOffset } from "./normalize.js";

const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });

/**
 * Split canonical text into passages of up to `maxSentences` sentences / `maxChars` characters,
 * with a one-sentence overlap. Never crosses paragraph boundaries.
 * Returns [{ text, charStart, charEnd, page, paragraph }]
 */
export function chunkText(text, pageStarts = [0], { maxSentences = 4, maxChars = 900, minChars = 40 } = {}) {
  const passages = [];
  const paraRe = /[^\n]+(?:\n(?!\n)[^\n]+)*/g; // runs of text separated by blank lines
  let paragraphIndex = 0;
  let m;

  while ((m = paraRe.exec(text))) {
    paragraphIndex++;
    const paraStart = m.index;
    const sentences = [...segmenter.segment(m[0])]
      .map((s) => ({ start: paraStart + s.index, end: paraStart + s.index + s.segment.trimEnd().length }))
      .filter((s) => s.end > s.start);

    let i = 0;
    while (i < sentences.length) {
      let j = i;
      while (j + 1 < sentences.length && j - i + 1 < maxSentences && sentences[j + 1].end - sentences[i].start <= maxChars) j++;
      const charStart = sentences[i].start;
      const charEnd = sentences[j].end;
      const chunk = text.slice(charStart, charEnd);
      if (chunk.length >= minChars || sentences.length === 1) {
        passages.push({ text: chunk, charStart, charEnd, page: pageForOffset(pageStarts, charStart), paragraph: paragraphIndex });
      }
      if (j + 1 >= sentences.length) break;
      i = j > i ? j : j + 1; // overlap one sentence when the window has >1 sentence
    }
  }
  return passages;
}
```

Handle one edge case: a single sentence longer than `maxChars` (for example a PDF table flattened
into one line). Split it hard at the nearest space before `maxChars`. Add this and test it.

### 14.3 Tests — `tests/unit/ingestion.normalize.test.js` and `chunk.test.js`

Cover:
- curly quotes/dashes are unified; `"graph-\ndatabase"` → `"graphdatabase"`; `"multi-\nhop"` stays sensible
  (the regex only joins when the next char is lowercase, so check `"Multi-\nHop"` is left alone);
- paragraph breaks survive and single newlines become spaces;
- `joinPages` produces correct `pageStarts`; `pageForOffset` returns 1-based pages;
- every passage satisfies `text.slice(charStart, charEnd) === passage.text` (**the key invariant**);
- no passage crosses a paragraph; overlap behaviour; the long-sentence split.

🛑 **CHECKPOINT** — suggested commit: `feat(ingestion): text normalisation and sentence-aware passage chunker`

---

## STEP 15 — URL fetching (SSRF-safe), HTML and PDF extraction

**Goal:** safely download user-provided URLs and extract readable text from HTML and PDF.

### 15.1 Install

```bash
cd server
npm install jsdom @mozilla/readability pdfjs-dist
```

### 15.2 SSRF guard + fetch — `src/services/ingestion/fetchUrl.js`

The server fetches URLs that users type in, so it must refuse internal addresses (cloud metadata,
localhost, private networks).

```js
import dns from "node:dns/promises";
import net from "node:net";
import { AppError } from "../../utils/errors.js";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") ||
    (v.startsWith("::ffff:") && isPrivateIp(v.slice(7)));
}

async function assertPublicUrl(url) {
  let u;
  try { u = new URL(url); } catch { throw new AppError(400, "Invalid URL"); }
  if (!["http:", "https:"].includes(u.protocol)) throw new AppError(400, "Only http(s) URLs are allowed");
  const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => { throw new AppError(400, "Could not resolve host"); });
  if (addrs.some((a) => isPrivateIp(a.address))) throw new AppError(400, "This address is not allowed");
  return u;
}

/** Returns { finalUrl, contentType, buffer } */
export async function fetchUrl(url) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "ProofChainBot/1.0 (research verification; contact via site)", Accept: "text/html,application/pdf;q=0.9,*/*;q=0.5" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location"), current).toString();
      continue;
    }
    if (!res.ok) throw new AppError(422, `The page returned HTTP ${res.status}`);

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { reader.cancel(); throw new AppError(413, "The document is too large (max 8 MB)"); }
      chunks.push(value);
    }
    return { finalUrl: current, contentType, buffer: Buffer.concat(chunks) };
  }
  throw new AppError(422, "Too many redirects");
}

export const __test = { isPrivateIp };
```

> Note for `docs/decisions.md`: DNS rebinding between lookup and fetch is not fully prevented. That's
> acceptable for this project's threat model.

### 15.3 HTML extraction — `src/services/ingestion/extractHtml.js`

Readability returns cleaned HTML. We rebuild the text block by block so paragraph breaks survive.

```js
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { AppError } from "../../utils/errors.js";

const BLOCKS = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, figcaption";

export function extractHtml(html, url) {
  const vc = new VirtualConsole(); // silence CSS parse noise
  const dom = new JSDOM(html, { url, virtualConsole: vc });
  const article = new Readability(dom.window.document).parse();
  if (!article?.content) throw new AppError(422, "Could not find readable content on this page");

  const content = new JSDOM(article.content).window.document;
  const blocks = [...content.querySelectorAll(BLOCKS)]
    .filter((el) => !el.querySelector(BLOCKS)) // leaf blocks only, avoids duplicates
    .map((el) => el.textContent.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 1);

  const text = blocks.join("\n\n");
  if (text.length < 200) throw new AppError(422, "The page has too little readable text");
  const doc = dom.window.document;
  const meta = (name) => doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.content;
  return {
    title: article.title || meta("og:title") || "Untitled page",
    byline: article.byline ?? meta("author") ?? null,
    siteName: article.siteName ?? meta("og:site_name") ?? null,
    publishedTime: article.publishedTime ?? meta("article:published_time") ?? null,
    pages: [text], // HTML is treated as a single page
  };
}
```

### 15.4 PDF extraction — `src/services/ingestion/extractPdf.js`

```js
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { AppError } from "../../utils/errors.js";

const MAX_PAGES = 150;

/** Returns { title, pages: string[] } with one string per page. */
export async function extractPdf(buffer) {
  let doc;
  try {
    doc = await getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true, disableFontFace: true }).promise;
  } catch {
    throw new AppError(422, "Could not read this PDF");
  }
  const pages = [];
  const n = Math.min(doc.numPages, MAX_PAGES);
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let text = "";
    let lastY = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 14) text += "\n\n";    // big vertical jump ≈ new paragraph
      else if (lastY !== null && Math.abs(y - lastY) > 1) text += "\n";  // new line
      text += item.str;
      if (item.hasEOL) text += "\n";
      lastY = y;
    }
    pages.push(text);
    page.cleanup();
  }
  const meta = await doc.getMetadata().catch(() => null);
  await doc.destroy();
  const total = pages.join("").trim().length;
  if (total < 200) throw new AppError(422, "This PDF has no extractable text (it may be a scanned image)");
  return { title: meta?.info?.Title?.trim() || null, pages, truncated: doc.numPages > MAX_PAGES };
}
```

> The paragraph heuristic (`> 14` units) is approximate. That's fine: chunking still works with imperfect
> paragraphs. If pdfjs throws on import in Node, check the installed version's docs for the legacy build
> path and note any change in `docs/decisions.md`.

### 15.5 Source type classifier — `src/services/ingestion/classifySource.js`

```js
const RULES = [
  { type: "preprint", hosts: ["arxiv.org", "biorxiv.org", "medrxiv.org", "ssrn.com", "researchgate.net"] },
  { type: "peer_reviewed", hosts: ["doi.org", "dl.acm.org", "ieeexplore.ieee.org", "link.springer.com", "sciencedirect.com",
      "vldb.org", "usenix.org", "aclanthology.org", "nature.com", "wiley.com", "tandfonline.com", "mdpi.com", "plos.org"] },
  { type: "vendor", hosts: ["neo4j.com", "tigergraph.com", "memgraph.com", "arangodb.com", "aws.amazon.com", "cloud.google.com",
      "learn.microsoft.com", "oracle.com", "ibm.com", "mongodb.com", "datastax.com", "nebula-graph.io"] },
  { type: "blog", hosts: ["medium.com", "dev.to", "substack.com", "hashnode.dev", "wordpress.com", "blogspot.com"] },
  { type: "news", hosts: ["nytimes.com", "theguardian.com", "bbc.co.uk", "bbc.com", "reuters.com", "techcrunch.com",
      "theverge.com", "wired.com", "zdnet.com", "infoq.com", "thehindu.com", "livemint.com"] },
];

export function classifySource({ url, kind, hasDoi }) {
  if (kind === "paper") return hasDoi ? "peer_reviewed" : "preprint";
  if (!url) return "unknown";
  const host = new URL(url).hostname.replace(/^www\./, "");
  for (const rule of RULES) if (rule.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return rule.type;
  if (/\bblog\b/.test(host) || /\/blog\//.test(url)) return "blog";
  return "unknown";
}
```

The user can always correct the type in the UI (Step 17). This matters, because the gap detector relies on it.

### 15.6 Tests

- `isPrivateIp` for 127.0.0.1, 10.x, 169.254.169.254, 192.168.x, ::1, `::ffff:127.0.0.1`, and a public IP.
- `extractHtml` on a fixture HTML file in `tests/fixtures/article.html` (write a fake article
  with nav, ads and five paragraphs) → only article paragraphs, separated by blank lines.
- `extractPdf` on a tiny fixture PDF: generate one in the test with `pdf-lib` (`npm i -D pdf-lib`), draw
  two pages of text, then assert `pages.length === 2`.
- `classifySource` table tests.

🛑 **CHECKPOINT** — suggested commit: `feat(ingestion): ssrf-safe fetch, readability html and pdfjs pdf extraction`

---

## STEP 16 — Job runner, ingestion pipeline, source routes

**Goal:** add sources by URL or PDF upload, process them in the background, and survive Render restarts.

### 16.1 Install

```bash
cd server && npm install multer
```

### 16.2 Job runner — `src/jobs/runner.js`

A tiny in-process queue. Redis isn't needed at this scale, but jobs must be safe to re-run.

```js
import pLimit from "p-limit";
import { logger } from "../utils/logger.js";

const limit = pLimit(2);
const running = new Map(); // key → promise, prevents duplicate jobs for the same key

/** Fire-and-forget. `key` dedupes (e.g. `ingest:<sourceId>`). Errors are logged, never thrown. */
export function enqueue(key, fn) {
  if (running.has(key)) return running.get(key);
  const p = limit(async () => {
    const started = Date.now();
    try {
      await fn();
      logger.info({ key, ms: Date.now() - started }, "job done");
    } catch (err) {
      logger.error({ err, key }, "job failed");
    } finally {
      running.delete(key);
    }
  });
  running.set(key, p);
  return p;
}

export const isRunning = (key) => running.has(key);
/** For tests: wait until all jobs have finished. */
export const drain = () => Promise.all([...running.values()]);
```

### 16.3 Pipeline — `src/services/ingestion/pipeline.js`

```js
import crypto from "node:crypto";
import { Source } from "../../models/Source.js";
import { Passage } from "../../models/Passage.js";
import { fetchUrl } from "./fetchUrl.js";
import { extractHtml } from "./extractHtml.js";
import { extractPdf } from "./extractPdf.js";
import { joinPages } from "./normalize.js";
import { chunkText } from "./chunk.js";
import { classifySource } from "./classifySource.js";
import { embedTexts } from "../ai/embeddings.js";
import { reserveHumanIds } from "../../utils/ids.js";
import { enqueue } from "../../jobs/runner.js";
import { emitToProject } from "../realtime/events.js"; // create as a no-op stub now; Step 29 implements it
import { logger } from "../../utils/logger.js";

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

export function scheduleIngestion(sourceId) {
  return enqueue(`ingest:${sourceId}`, () => ingestSource(sourceId));
}

/** Idempotent: can be re-run after a crash. */
export async function ingestSource(sourceId) {
  const source = await Source.findById(sourceId).select("+rawPages");
  if (!source || source.status === "ready") return;
  await setStatus(source, "processing");

  try {
    // 1. Extract (URLs are fetched here; PDFs/papers already have rawPages from the request)
    if (!source.rawPages?.length) {
      if (source.kind !== "url") throw new Error("Original upload is no longer available — please re-upload the PDF");
      const { finalUrl, contentType, buffer } = await fetchUrl(source.url);
      const extracted = contentType === "application/pdf" ? await extractPdf(buffer) : extractHtml(buffer.toString("utf8"), finalUrl);
      source.rawPages = extracted.pages;
      source.title = extracted.title ?? source.title;
      if (extracted.byline) source.authors = [extracted.byline];
      if (extracted.publishedTime) source.year = new Date(extracted.publishedTime).getFullYear() || source.year;
      source.sourceType = source.sourceType === "unknown" ? classifySource({ url: finalUrl, kind: "url" }) : source.sourceType;
      source.retrievedAt = new Date();
      await source.save();
    }

    // 2. Normalise + snapshot hash (duplicate detection inside the project)
    const { text, pageStarts } = joinPages(source.rawPages);
    const textHash = sha256(text);
    const dup = await Source.findOne({ projectId: source.projectId, textHash, _id: { $ne: source._id } }).select("title");
    if (dup) throw new Error(`This document is already in the project ("${dup.title}")`);

    // 3. Chunk
    const chunks = chunkText(text, pageStarts);
    if (!chunks.length) throw new Error("No passages could be extracted");

    // 4. Embed (the expensive part)
    const vectors = await embedTexts(chunks.map((c) => c.text), "RETRIEVAL_DOCUMENT");

    // 5. Replace passages atomically-enough (re-runs delete partial results first)
    await Passage.deleteMany({ sourceId: source._id });
    const ids = await reserveHumanIds(source.projectId, "passage", chunks.length);
    await Passage.insertMany(chunks.map((c, i) => ({
      ...c, projectId: source.projectId, sourceId: source._id, humanId: ids[i], embedding: vectors[i],
    })));

    Object.assign(source, { text, pageStarts, textHash, passageCount: chunks.length, status: "ready", error: undefined });
    source.rawPages = undefined; // free space; `text` is the canonical snapshot now
    await source.save();
    emitToProject(source.projectId, "source.updated", { sourceId: source.id, status: "ready" });

    // 6. Follow-ups (implemented in later steps — leave these hooks as comments for now)
    // await scheduleClaimExtraction(source)      ← Step 19
    // await refreshProfileFromSources(project)   ← Step 23
  } catch (err) {
    logger.warn({ err: err.message, sourceId }, "ingestion failed");
    source.status = "failed";
    source.error = err.message?.slice(0, 300) ?? "Ingestion failed";
    await source.save();
    emitToProject(source.projectId, "source.updated", { sourceId: source.id, status: "failed" });
  }
}

async function setStatus(source, status) {
  source.status = status;
  await source.save();
  emitToProject(source.projectId, "source.updated", { sourceId: source.id, status });
}

/** Called at boot: jobs interrupted by a Render restart/sleep are resumed. */
export async function resumeInterruptedJobs() {
  const stuck = await Source.find({ status: { $in: ["queued", "processing"] } }).select("_id");
  stuck.forEach((s) => scheduleIngestion(s._id));
  if (stuck.length) logger.info(`Resuming ${stuck.length} interrupted ingestion jobs`);
}
```

Create `src/services/realtime/events.js` now as a stub: `export function emitToProject() {}`.
Call `await resumeInterruptedJobs()` in `index.js` after the DB connects.

### 16.4 Routes — `src/routes/sources.js` (mounted at `/api/projects/:projectId/sources`)

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/` | editor | body `{ url }` → creates `kind:"url"` source, status `queued`, returns **202** |
| POST | `/upload` | editor | multipart field `file` (PDF only, ≤ `MAX_UPLOAD_MB`). Extract **in the request**, store `rawPages`, return 202 |
| GET | `/` | viewer | list (no text), newest first |
| GET | `/:sourceId` | viewer | metadata + `text` + `pageStarts` (select them explicitly) |
| GET | `/:sourceId/passages` | viewer | `?page=&limit=` paginated passages (no embeddings) |
| PATCH | `/:sourceId` | editor | `{ sourceType?, title? }` (writes an audit event) |
| POST | `/:sourceId/retry` | editor | failed → queued, reschedule |
| DELETE | `/:sourceId` | editor | deletes the source, its passages and its links (audit event) |

Upload handler essentials:

```js
import multer from "multer";
import { env } from "../config/env.js";

const upload = multer({
  storage: multer.memoryStorage(), // never write to Render's disk
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    file.mimetype === "application/pdf" ? cb(null, true) : cb(new AppError(415, "Only PDF files are supported")),
});

sourcesRouter.post("/upload", requireProjectRole("editor"), upload.single("file"), async (req, res) => {
  if (!req.file) throw new AppError(400, "No file uploaded");
  const { title, pages, truncated } = await extractPdf(req.file.buffer);
  const source = await Source.create({
    projectId: req.project._id, addedBy: req.user._id, kind: "pdf",
    fileName: req.file.originalname, title: title ?? req.file.originalname.replace(/\.pdf$/i, ""),
    rawPages: pages, retrievedAt: new Date(), status: "queued",
  });
  scheduleIngestion(source._id);
  res.status(202).json({ source, truncated });
});
```

Handle multer's `LIMIT_FILE_SIZE` error in `errorHandler` → 413 with a friendly message.

### 16.5 Tests

Integration test (AI mock + memory vectors): create a project, upload the fixture PDF, `await drain()`,
then assert status `ready`, `passageCount > 0`, passages have `P-` IDs, and every
`source.text.slice(p.charStart, p.charEnd) === p.text`. For URL sources, mock `fetchUrl` with
`vi.mock(...)` to return fixture HTML. Also test that a duplicate upload ends as `failed` with the
"already in the project" message.

### 16.6 Verify in production

Deploy, add a real article URL in the live app (via curl for now), and watch it become `ready`.
With `AI_MOCK=false` in Render, check in Atlas that passages have 768-number embeddings.

🛑 **CHECKPOINT** — suggested commit: `feat(ingestion): resumable ingestion jobs, pdf upload and source routes`

---

## STEP 17 — Client: add sources, source list, source viewer

**Goal:** users can add URLs/PDFs, watch processing status, and read a source with passage highlights.

### 17.1 API — `client/src/api/sources.js`

```js
import { api } from "./client.js";
const base = (pid) => `/projects/${pid}/sources`;
export const sourcesApi = {
  list: (pid) => api.get(base(pid)).then((r) => r.data.sources),
  get: (pid, sid) => api.get(`${base(pid)}/${sid}`).then((r) => r.data.source),
  passages: (pid, sid, page = 1) => api.get(`${base(pid)}/${sid}/passages`, { params: { page, limit: 500 } }).then((r) => r.data),
  addUrl: (pid, url) => api.post(base(pid), { url }).then((r) => r.data.source),
  upload: (pid, file, onProgress) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post(`${base(pid)}/upload`, fd, { onUploadProgress: (e) => onProgress?.(Math.round((e.loaded / e.total) * 100)) }).then((r) => r.data);
  },
  update: (pid, sid, data) => api.patch(`${base(pid)}/${sid}`, data).then((r) => r.data.source),
  retry: (pid, sid) => api.post(`${base(pid)}/${sid}/retry`).then((r) => r.data.source),
  remove: (pid, sid) => api.delete(`${base(pid)}/${sid}`),
};
```

### 17.2 Components (`client/src/components/sources/`)

- **`AddSourceDialog.jsx`** — two tabs: "Web page" (URL input) and "PDF" (file input + upload progress).
  Validate the URL client-side and show server errors (413, 415, 422) clearly.
- **`SourcesList.jsx`** — `useQuery(["sources", pid])` with
  `refetchInterval: (q) => q.state.data?.some((s) => ["queued", "processing"].includes(s.status)) ? 3000 : false`
  (Step 29 replaces polling with socket events). Each row shows the title, a type badge (editable select for editors),
  a depth badge (full text / abstract only), the passage count, and a status pill with the error and a Retry button when failed.
- **`SourceViewer.jsx`** — route `sources/:sourceId`. Fetches the source text and passages, then renders the
  text with each passage wrapped in a `<mark>`-like span (`data-passage="P-14"`).
  Supports `?passage=P-14`: scroll to it and pulse-highlight it. Show the page number in the margin
  at each page start (from `pageStarts`).

Rendering trick: passages overlap by one sentence, so don't nest spans. Build non-overlapping segments
by walking `charStart/charEnd` boundaries, and for each segment record the passage IDs covering it:

```js
export function buildSegments(text, passages) {
  const cuts = new Set([0, text.length]);
  passages.forEach((p) => { cuts.add(p.charStart); cuts.add(p.charEnd); });
  const points = [...cuts].sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [s, e] = [points[i], points[i + 1]];
    const covering = passages.filter((p) => p.charStart <= s && p.charEnd >= e).map((p) => p.humanId);
    segs.push({ start: s, end: e, text: text.slice(s, e), passageIds: covering });
  }
  return segs;
}
```

Render paragraphs by splitting segments on `"\n\n"`. Hovering a segment shows the passage IDs.
Step 21 colours segments by the stance of linked claims. **Render text as text, never as HTML.**

### 17.3 Verify

In the deployed app: add a URL and a PDF, watch both go queued → processing → ready, open the viewer,
and deep-link to `?passage=P-3`.

🛑 **CHECKPOINT** — suggested commit: `feat(client): add sources, live status list and passage-highlighting source viewer`

---

## STEP 18 — Validation engine (quote matching, metadata matching, pipeline log)

**Goal:** the core of the proof chain, written as pure, tested functions:
- **L4 passage existence** — does a quoted span really exist in a passage?
- **L2 metadata consistency** — do two paper records describe the same paper?
- a **pipeline log** used to show the user what was dropped and why.

### 18.1 Install

```bash
cd server && npm install fastest-levenshtein
```

### 18.2 `src/services/validation/textMatch.js`

```js
import { distance } from "fastest-levenshtein";

export const NEAR_MATCH_THRESHOLD = 0.92;

/** Normalise for matching and keep a map from normalised index → original index. */
export function normalizeWithMap(s) {
  let out = "";
  const map = [];
  let lastSpace = true;
  for (let i = 0; i < s.length; i++) {
    let ch = s[i];
    if (/[\u2018\u2019\u201A\u201B]/.test(ch)) ch = "'";
    else if (/[\u201C\u201D\u201E\u201F]/.test(ch)) ch = '"';
    else if (/[\u2010-\u2015\u2212]/.test(ch)) ch = "-";
    if (/\s/.test(ch)) {
      if (lastSpace) continue;
      ch = " ";
      lastSpace = true;
    } else lastSpace = false;
    out += ch.toLowerCase();
    map.push(i);
  }
  if (out.endsWith(" ")) { out = out.slice(0, -1); map.pop(); }
  return { text: out, map };
}

const similarity = (a, b) => (a.length || b.length ? 1 - distance(a, b) / Math.max(a.length, b.length) : 1);

/**
 * Does `quote` occur in `passageText`?
 * @returns {{ matched: boolean, matchType?: "exact"|"near_match", score: number, start?: number, end?: number, original?: string }}
 * start/end/original refer to the ORIGINAL passage text, so the UI shows real text, never the AI's version.
 */
export function matchQuote(quote, passageText) {
  if (!quote || !passageText) return { matched: false, score: 0 };
  const q = normalizeWithMap(quote.trim().replace(/^["'.…\s]+|["'.…\s]+$/g, "")).text;
  const p = normalizeWithMap(passageText);
  if (q.length < 8) return { matched: false, score: 0 }; // too short to be meaningful

  const idx = p.text.indexOf(q);
  if (idx !== -1) return located("exact", 1, idx, idx + q.length, p, passageText);

  // Near match: slide a window over word boundaries, window length ≈ quote length (±15%)
  const starts = [0];
  for (let i = 0; i < p.text.length; i++) if (p.text[i] === " ") starts.push(i + 1);
  let best = { score: 0 };
  for (const s of starts) {
    for (const len of [q.length, Math.round(q.length * 0.9), Math.round(q.length * 1.1)]) {
      if (s + len > p.text.length + 5) continue;
      const window = p.text.slice(s, s + len);
      const score = similarity(q, window);
      if (score > best.score) best = { score, s, e: Math.min(s + len, p.text.length) };
    }
  }
  if (best.score >= NEAR_MATCH_THRESHOLD) return located("near_match", best.score, best.s, best.e, p, passageText);
  return { matched: false, score: best.score };
}

function located(matchType, score, ns, ne, p, original) {
  const start = p.map[ns];
  const end = p.map[Math.max(ns, ne - 1)] + 1;
  return { matched: true, matchType, score: Number(score.toFixed(3)), start, end, original: original.slice(start, end) };
}
```

### 18.3 `src/services/validation/metadata.js`

```js
import { distance } from "fastest-levenshtein";

export const normTitle = (t = "") =>
  t.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function titleSimilarity(a, b) {
  const x = normTitle(a), y = normTitle(b);
  if (!x || !y) return 0;
  return 1 - distance(x, y) / Math.max(x.length, y.length);
}

const lastName = (name = "") => normTitle(name).split(" ").filter(Boolean).pop() ?? "";

/** L2: do two records describe the same paper? */
export function metadataConsistent(a, b, { titleMin = 0.9 } = {}) {
  const reasons = [];
  const ts = titleSimilarity(a.title, b.title);
  if (ts < titleMin) reasons.push(`title_mismatch(${ts.toFixed(2)})`);
  if (a.year && b.year && Math.abs(a.year - b.year) > 1) reasons.push(`year_mismatch(${a.year}≠${b.year})`);
  if (a.authors?.length && b.authors?.length) {
    const la = new Set(a.authors.slice(0, 5).map(lastName));
    if (!b.authors.slice(0, 5).some((x) => la.has(lastName(x)))) reasons.push("author_mismatch");
  }
  return { ok: reasons.length === 0, titleScore: ts, reasons };
}
```

### 18.4 `src/services/validation/pipelineLog.js`

```js
/** Collects human-readable lines like the example log in the design doc (Section 7). */
export function createPipelineLog(label) {
  const lines = [];
  const ts = () => new Date().toISOString().slice(11, 19);
  const fmt = (data) => (data ? " " + Object.entries(data).map(([k, v]) => `${k}=${v}`).join(" ") : "");
  return {
    lines,
    info: (msg, data) => lines.push(`[${ts()}] ${label} ${msg}${fmt(data)}`),
    drop: (layer, what, reason) => lines.push(`[${ts()}] ${layer} drop  ${what}   reason=${reason}`),
    pass: (layer, what) => lines.push(`[${ts()}] ${layer} pass  ${what}`),
    retry: (layer, what, reason) => lines.push(`[${ts()}] ${layer} retry ${what}  reason=${reason}`),
  };
}
```

### 18.5 Tests (make these thorough — they protect the product's main promise)

`textMatch`: exact match; differences in case, curly quotes and whitespace still count as exact; a quote
with one changed word in 20 → `near_match`; a paraphrase → not matched; a fabricated quote → not matched;
an empty or very short quote → not matched; returned `original` equals `passageText.slice(start, end)`.

`metadata`: same title with different punctuation passes; a different paper fails; a year off by 3 fails;
no shared author fails; a missing year is ignored.

🛑 **CHECKPOINT** — suggested commit: `feat(validation): quote matching (L4), metadata consistency (L2) and pipeline log`

---

## STEP 19 — Claim extraction and claim routes

**Goal:** claims are created by users or proposed by Gemini from sources. Every AI claim must cite
passages it was shown, with a quote that passes L4. Near-duplicate claims are merged.

### 19.1 Prompt — `src/services/ai/prompts/extractClaims.js`

```js
import { z } from "zod";
import { formatItems, idsCheck } from "./util.js";

export const system = `You extract atomic, checkable research claims from passages.
A good claim is one specific statement that evidence can support or contradict
(e.g. "Graph databases outperform relational databases on multi-hop traversal queries").
Avoid vague claims ("graph databases are better"). Split compound statements.
Use ONLY the passages provided. Every claim must cite at least one passage ID and include
an exact quote copied from that passage. Reply with JSON only.`;

export const schema = z.object({
  claims: z.array(z.object({
    text: z.string().min(15).max(300),
    passageId: z.string(),
    quote: z.string().min(8).max(400),
  })).max(12),
});

export const build = ({ passages, existingClaims, topics }) => `Research topics: ${topics.join(", ") || "not specified"}

Existing claims (do not repeat these):
${existingClaims.map((c) => `- ${c.text}`).join("\n") || "- none"}

Passages:
${formatItems(passages)}

Return {"claims":[{"text": string, "passageId": one of the IDs above, "quote": exact words from that passage}]}.
Return at most 8 claims, the most central and checkable ones.`;

export const check = ({ passages }) => idsCheck(new Set(passages.map((p) => p.id)), (d) => d.claims.map((c) => c.passageId));

export const mock = ({ passages }) => ({
  claims: passages.slice(0, 2).map((p) => ({
    text: `Mock claim derived from ${p.id}: ${p.text.slice(0, 60)}`,
    passageId: p.id,
    quote: p.text.split(/(?<=\.)\s/)[0].slice(0, 120),
  })),
});
```

### 19.2 Service — `src/services/claims/claimService.js`

Main functions:

```js
const DUPLICATE_THRESHOLD = 0.9;

/** Create a claim, or return the existing near-duplicate. */
export async function createOrMergeClaim({ projectId, text, origin, userId, embedding }) {
  embedding ??= await embedOne(text, "SEMANTIC_SIMILARITY");
  const existing = await Claim.find({ projectId }).select("+embedding");
  const dup = existing.find((c) => c.embedding?.length && cosine(c.embedding, embedding) >= DUPLICATE_THRESHOLD);
  if (dup) return { claim: dup, merged: true };
  const humanId = await nextHumanId(projectId, "claim");
  const claim = await Claim.create({ projectId, humanId, text, origin, createdBy: userId, embedding });
  await recordAudit({ projectId, actor: userId ?? "ai", action: "claim.created", target: { kind: "claim", id: claim._id, humanId }, change: { text: [null, text] } });
  return { claim, merged: false };
}
```

And `extractClaimsFromSource(sourceId)`:
1. Load up to **30 passages** spread evenly across the source (cost control: take every k-th passage).
2. Call `generateJson` with the prompt above (IDs are the passages' `humanId`s).
3. For each returned claim: look up the passage by `humanId`, then run `matchQuote(quote, passage.text)`.
   - On failure: log `L4 drop` and write an audit event `ai.quote_not_found` (actor `"ai"`). Skip it.
   - On success: `createOrMergeClaim({ origin: "ai_from_source" })`, then create the first
     `EvidenceLink` (`stance: "supports"`, `status: "ai_suggested"`, quote = **matched original text**,
     `matchType`, `matchScore`, `aiRationale: "Claim extracted from this passage"`).
4. Afterwards, schedule evidence linking for each new claim (Step 20 provides `scheduleLinking`; leave a TODO).

Hook it into the ingestion pipeline (Step 16, follow-ups section):
`enqueue(\`claims:${source.id}\`, () => extractClaimsFromSource(source.id))`.

### 19.3 Routes — `src/routes/claims.js` (mounted at `/api/projects/:projectId/claims`)

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/` | viewer | claims with link counts by stance and status (one `$group` aggregation on links) |
| POST | `/` | editor | user claim `{ text, scopeNote? }` → `createOrMergeClaim` (returns `merged: true` if a duplicate existed) |
| GET | `/:claimId` | viewer | claim + links (populate passage text/humanId/page and source title/type) + gaps |
| PATCH | `/:claimId` | editor | `{ text?, scopeNote? }` (re-embed when text changes; audit event with reason) |
| DELETE | `/:claimId` | editor | delete the claim and its links (audit event) |
| GET | `/:claimId/history` | viewer | audit events for the claim and its links |

Apply `aiLimiter` (Step 7) to POST.

### 19.4 Tests

With AI mock: ingest the fixture → claims created with `C` IDs → each has one `ai_suggested` link whose
`quote` exists in the passage. Use `vi.spyOn` on the mock to return a **fabricated** quote and assert
that no claim is created and an `ai.quote_not_found` audit event exists. Test dedupe: posting the
same claim text twice returns `merged: true`.

🛑 **CHECKPOINT** — suggested commit: `feat(claims): grounded claim extraction with quote validation and claim routes`

---

## STEP 20 — Evidence linker and human review

**Goal:** for each claim, find relevant passages across all sources, classify their stance with Gemini,
validate the quotes (L4), store links as `ai_suggested`, and let humans review them (L6). Every review
is audited.

### 20.1 Prompt — `src/services/ai/prompts/classifyStance.js`

```js
import { z } from "zod";
import { formatItems, idsCheck } from "./util.js";

export const system = `You assess whether passages support a research claim. Use only the passages given.
For each passage decide: "supports", "contradicts", "inconclusive" (related but doesn't settle it), or "irrelevant".
Copy an exact quote (max 40 words) from the passage that justifies your label.
If the passage only supports the claim under specific conditions (a workload, dataset, version, scale),
put those conditions in "scope". If unsure, use "inconclusive". Never invent text. Reply with JSON only.`;

export const schema = z.object({
  results: z.array(z.object({
    passageId: z.string(),
    stance: z.enum(["supports", "contradicts", "inconclusive", "irrelevant"]),
    quote: z.string().max(400).optional().default(""),
    scope: z.string().max(200).nullable().optional(),
    reason: z.string().max(300),
  })),
});

export const build = ({ claim, passages }) => `CLAIM [${claim.humanId}]: ${claim.text}

PASSAGES:
${formatItems(passages)}

Return {"results":[{"passageId","stance","quote","scope","reason"}]} with one entry per passage.`;

export const check = ({ passages }) => idsCheck(new Set(passages.map((p) => p.id)), (d) => d.results.map((r) => r.passageId));

export const mock = ({ passages }) => ({
  results: passages.map((p, i) => ({
    passageId: p.id,
    stance: ["supports", "contradicts", "inconclusive", "irrelevant"][i % 4],
    quote: p.text.slice(0, 80),
    scope: null,
    reason: "mock",
  })),
});
```

### 20.2 Linker — `src/services/evidence/linker.js`

```js
export function scheduleLinking(claimId) {
  return enqueue(`link:${claimId}`, () => linkClaim(claimId));
}

export async function linkClaim(claimId, { limit = 24, batchSize = 8 } = {}) {
  const claim = await Claim.findById(claimId).select("+embedding");
  if (!claim) return;
  const log = createPipelineLog(`link ${claim.humanId}`);
  const queryVector = claim.embedding?.length ? claim.embedding : await embedOne(claim.text, "RETRIEVAL_QUERY");
  const candidates = await searchPassages({ projectId: claim.projectId, queryVector, limit });

  // Skip passages a human already reviewed for this claim
  const existing = await EvidenceLink.find({ claimId }).lean();
  const reviewed = new Set(existing.filter((l) => l.status !== "ai_suggested").map((l) => String(l.passageId)));
  const todo = candidates.filter((p) => !reviewed.has(String(p._id)));
  log.info("candidates", { retrieved: candidates.length, toClassify: todo.length });

  for (let i = 0; i < todo.length; i += batchSize) {
    const batch = todo.slice(i, i + batchSize);
    const input = { claim, passages: batch.map((p) => ({ id: p.humanId, text: p.text })) };
    const out = await generateJson({ task: "stance.classify", ...prompt, prompt: prompt.build(input), check: prompt.check(input), mock: () => prompt.mock(input) });

    for (const r of out.results) {
      if (r.stance === "irrelevant") continue;
      const passage = batch.find((p) => p.humanId === r.passageId);
      const m = matchQuote(r.quote, passage.text);
      if (!m.matched) {
        log.drop("L4", passage.humanId, `quote_not_found(${m.score.toFixed(2)})`);
        await recordAudit({ projectId: claim.projectId, actor: "ai", action: "link.discarded",
          target: { kind: "claim", id: claim._id, humanId: claim.humanId }, reason: `Gemini quote not found in ${passage.humanId}` });
        continue;
      }
      log.pass("L4", `${passage.humanId} ${m.matchType}`);
      await EvidenceLink.findOneAndUpdate(
        { claimId: claim._id, passageId: passage._id, status: "ai_suggested" }, // never overwrite reviewed links
        { $set: { projectId: claim.projectId, sourceId: passage.sourceId, stance: r.stance, scope: r.scope ?? undefined,
                  quote: m.original, matchType: m.matchType, matchScore: m.score, aiRationale: r.reason, origin: "ai" },
          $setOnInsert: { humanId: await nextHumanId(claim.projectId, "link") } },
        { upsert: true, new: true },
      ).catch((e) => { if (e.code !== 11000) throw e; }); // a reviewed link exists → keep the human's version
    }
  }
  await recomputeClaimStatus(claim._id);
  emitToProject(claim.projectId, "claim.updated", { claimId: claim.id });
  return log.lines;
}
```

(Write the imports; `prompt` is `import * as prompt from "../ai/prompts/classifyStance.js"`.)

Wire it up: after claim creation in Step 19 (`scheduleLinking`), and when a new source becomes ready,
re-link the project's existing claims against **only the new source**. Add a `sourceIds` option to
`linkClaim` and pass it through to `searchPassages`.

### 20.3 Claim status — `src/services/evidence/claimStatus.js`

```js
function statusFrom(links) {
  const sup = links.some((l) => l.stance === "supports");
  const con = links.some((l) => l.stance === "contradicts");
  if (sup && con) return "contested";
  if (sup) return "supported";
  if (con) return "unsupported";
  return "open";
}

export async function recomputeClaimStatus(claimId) {
  const links = await EvidenceLink.find({ claimId, status: { $ne: "rejected" } }).lean();
  const confirmed = links.filter((l) => l.status === "confirmed");
  await Claim.updateOne({ _id: claimId }, { status: statusFrom(confirmed), provisionalStatus: statusFrom(links) });
  // Step 23 adds: await refreshGaps(claimId)
}
```

### 20.4 Review — `src/services/evidence/reviewService.js` + routes

Allowed transitions (enforce them, and reject anything else with 409):

```js
const TRANSITIONS = {
  ai_suggested: ["under_review", "confirmed", "rejected", "disputed"],
  under_review: ["confirmed", "rejected", "disputed"],
  confirmed: ["disputed", "rejected", "under_review"],
  rejected: ["under_review", "confirmed"],
  disputed: ["confirmed", "rejected", "under_review"],
};
```

`reviewLink({ link, user, status?, stance?, scope?, reason })`:
- Changing `stance` or `scope` on its own is allowed for editors, and also marks the link reviewed.
- Sets `reviewedBy`/`reviewedAt`.
- Writes an audit event `link.review` with `change: { status: [from, to], stance: [from, to] }` and the `reason`,
  matching the design doc's example AuditEvent.
- `reason` is **required** when moving to `rejected` or `disputed`, or when changing the stance of an AI suggestion.
- Calls `recomputeClaimStatus` and emits `link.updated`.

Routes (`src/routes/links.js`, mounted at `/api/projects/:projectId/links`):

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/` | viewer | `?status=ai_suggested,disputed&claimId=` → used by the review queue |
| PATCH | `/:linkId` | editor | review action (body validated with Zod) |
| POST | `/` | editor | manual link `{ claimId, passageId, stance, quote, scope? }` → quote must pass L4 too; `origin: "user"`, status `confirmed` |
| POST | `/claims/:claimId/run` | editor | `scheduleLinking` → 202 (rate-limited with `aiLimiter`) |

### 20.5 Tests

- The linker with the mock creates links with the expected stances; `irrelevant` creates none.
- A fabricated quote creates no link plus a `link.discarded` audit event.
- Re-running the linker never changes a `confirmed` link.
- Status: confirmed supports + confirmed contradicts → `contested`; AI-only links leave `status: open`
  while `provisionalStatus` changes.
- Invalid transitions → 409; rejecting without a reason → 400; the audit event has the correct `change`.

🛑 **CHECKPOINT** — suggested commit: `feat(evidence): stance classification with quote validation, review workflow and claim status`

---

## STEP 21 — Client: claims, claim detail, review queue

**Goal:** the user can see claims and their evidence and review AI suggestions in a couple of clicks.

### 21.1 Shared UI constants — `client/src/lib/evidence.js`

```js
export const STANCE = {
  supports: { label: "Supports", color: "text-supports", bg: "bg-supports/10", border: "border-supports" },
  contradicts: { label: "Contradicts", color: "text-contradicts", bg: "bg-contradicts/10", border: "border-contradicts" },
  inconclusive: { label: "Inconclusive", color: "text-inconclusive", bg: "bg-inconclusive/10", border: "border-inconclusive" },
};
export const LINK_STATUS = {
  ai_suggested: { label: "AI-suggested", dashed: true },
  under_review: { label: "Under review" },
  confirmed: { label: "Confirmed" },
  rejected: { label: "Rejected" },
  disputed: { label: "Disputed", color: "text-disputed" },
};
export const CLAIM_STATUS = {
  open: "Open", supported: "Supported", contested: "Contested", unsupported: "Unsupported",
};
export const GAP_LABEL = {
  single_source: "Single source", interested_party_only: "Vendor-only support", unchallenged: "Unchallenged",
  stale: "Stale evidence", abstract_only: "Abstract-only", contested: "Contested",
};
```

### 21.2 Components (`client/src/components/claims/` and `review/`)

- **`ClaimsList.jsx`** (Claims tab): "Add claim" input at the top (shows "merged with C4" when the server
  merges). Rows show the ID, text, status badge (confirmed status prominent, provisional status in muted
  text if different), stance counts (●3 ●1 ●0 in stance colours), and gap badges. Filters: All / Contested /
  Has gaps / Needs review.
- **`ClaimDetail.jsx`** (route `claims/:claimId`): text (editable inline for editors, with a reason prompt),
  then three columns or sections (Supports / Contradicts / Inconclusive). Each link is a **`LinkCard`**: passage ID,
  source title + type badge, page, the **quote**, scope chip, status, match type ("exact" / "near match 0.94"),
  AI rationale, an "Open in source" link (`sources/:sourceId?passage=P-14`), and review buttons.
  Below that: a history timeline from `/claims/:claimId/history`.
- **`ReviewQueue.jsx`** (Review tab): `GET /links?status=ai_suggested,disputed`, grouped by claim. Each
  `LinkCard` has quick actions: ✓ Confirm, ✗ Reject (reason), ⇄ Change stance (reason), ⚑ Dispute (reason).
  Use a small `ReasonDialog` component. After each mutation, invalidate `["links"]`, `["claims"]` and `["claim", id]`.
  Show a counter badge on the Review tab.
- **Source viewer upgrade**: colour passage segments with the stance of their links (green/red/amber
  underline, dashed when AI-suggested), and show linked claim IDs on hover.

### 21.3 Verify

In the deployed app with `AI_MOCK=false`: add the two walkthrough-style sources (a vendor blog post and a
survey PDF the user has). Claims appear, links appear as AI-suggested, you can confirm and reject them,
claim status updates, and history shows each change with its reason.

🛑 **CHECKPOINT** — suggested commit: `feat(client): claims list, claim detail with evidence cards and review queue`

---

## STEP 22 — Scholarly API clients and paper verification

**Goal:** fetch real paper metadata from Semantic Scholar, OpenAlex, Crossref and Unpaywall, normalise it
into one shape, deduplicate it, and verify that papers exist (**L1**) and are consistent (**L2**).

### 22.1 HTTP helper with cache — `src/services/scholarly/http.js`

```js
import crypto from "node:crypto";
import { PaperCache } from "../../models/PaperCache.js";
import { logger } from "../../utils/logger.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class UpstreamError extends Error {
  constructor(provider, status, message) { super(message); this.provider = provider; this.status = status; }
}

/** GET JSON with retries on 429/5xx (respects Retry-After) and a Mongo-backed cache. 404 → null. */
export async function getJson(provider, url, { headers = {}, ttlHours = 24 * 7, retries = 3, parse = "json" } = {}) {
  const key = `${provider}:${crypto.createHash("sha1").update(url).digest("hex")}`;
  const cached = await PaperCache.findById(key).lean();
  if (cached) return cached.payload;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) }).catch((e) => ({ ok: false, status: 0, error: e }));
    if (res.ok) {
      const payload = parse === "text" ? await res.text() : await res.json();
      await PaperCache.updateOne({ _id: key }, { payload, expiresAt: new Date(Date.now() + ttlHours * 3600_000) }, { upsert: true });
      return payload;
    }
    if (res.status === 404) return null;
    const retryable = res.status === 0 || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) throw new UpstreamError(provider, res.status, `${provider} request failed (${res.status})`);
    const retryAfter = Number(res.headers?.get?.("retry-after")) * 1000;
    const wait = retryAfter || 1000 * 2 ** attempt + Math.random() * 300;
    logger.warn({ provider, status: res.status, wait }, "scholarly API retry");
    await sleep(wait);
  }
}
```

Use a `p-limit(1)` per provider inside each client (Semantic Scholar is strict about rate limits).

### 22.2 Common paper shape — `src/services/scholarly/paper.js`

```js
/**
 * @typedef {Object} Paper
 * @property {{doi?:string,s2Id?:string,openAlexId?:string,arxivId?:string}} ids
 * @property {string} title @property {string[]} authors @property {number|null} year
 * @property {string|null} venue @property {string|null} abstract @property {number} citationCount
 * @property {string|null} oaPdfUrl @property {string|null} url @property {string[]} providers
 */
export const normDoi = (d) => d?.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").trim() || undefined;

export function paperKey(p) {
  if (p.ids.doi) return `doi:${p.ids.doi}`;
  if (p.ids.arxivId) return `arxiv:${p.ids.arxivId}`;
  if (p.ids.s2Id) return `s2:${p.ids.s2Id}`;
  return `oa:${p.ids.openAlexId}`;
}
```

### 22.3 Clients

**`semanticScholar.js`**

```js
import pLimit from "p-limit";
import { getJson } from "./http.js";
import { env } from "../../config/env.js";
import { normDoi } from "./paper.js";

const BASE = "https://api.semanticscholar.org/graph/v1";
const FIELDS = "title,abstract,year,venue,authors,externalIds,citationCount,openAccessPdf,url";
const limit = pLimit(1);
const headers = env.S2_API_KEY ? { "x-api-key": env.S2_API_KEY } : {};
const call = (url) => limit(() => getJson("s2", url, { headers }));

export function fromS2(p) {
  if (!p?.paperId || !p.title) return null;
  return {
    ids: { s2Id: p.paperId, doi: normDoi(p.externalIds?.DOI), arxivId: p.externalIds?.ArXiv },
    title: p.title, authors: (p.authors ?? []).map((a) => a.name), year: p.year ?? null, venue: p.venue || null,
    abstract: p.abstract ?? null, citationCount: p.citationCount ?? 0, oaPdfUrl: p.openAccessPdf?.url ?? null,
    url: p.url ?? null, providers: ["s2"],
  };
}

export async function searchS2(query, n = 20) {
  const data = await call(`${BASE}/paper/search?query=${encodeURIComponent(query)}&limit=${n}&fields=${FIELDS}`);
  return (data?.data ?? []).map(fromS2).filter(Boolean);
}
/** id can be an S2 id, "DOI:10.x/…", or "ARXIV:2101.00001" */
export async function getS2Paper(id) {
  return fromS2(await call(`${BASE}/paper/${encodeURIComponent(id)}?fields=${FIELDS}`));
}
export async function getS2References(id, n = 20) {
  const d = await call(`${BASE}/paper/${encodeURIComponent(id)}/references?limit=${n}&fields=${FIELDS}`);
  return (d?.data ?? []).map((x) => fromS2(x.citedPaper)).filter(Boolean);
}
export async function getS2Citations(id, n = 20) {
  const d = await call(`${BASE}/paper/${encodeURIComponent(id)}/citations?limit=${n}&fields=${FIELDS}`);
  return (d?.data ?? []).map((x) => fromS2(x.citingPaper)).filter(Boolean);
}
```

**`openAlex.js`** — abstracts come as an inverted index and must be rebuilt:

```js
import pLimit from "p-limit";
import { getJson } from "./http.js";
import { env } from "../../config/env.js";
import { normDoi } from "./paper.js";

const BASE = "https://api.openalex.org";
const limit = pLimit(2);
const mail = `mailto=${encodeURIComponent(env.CONTACT_EMAIL)}`;

export function abstractFromInverted(inv) {
  if (!inv) return null;
  const words = [];
  for (const [word, positions] of Object.entries(inv)) for (const i of positions) words[i] = word;
  return words.filter(Boolean).join(" ");
}

export function fromOpenAlex(w) {
  if (!w?.id || !w.display_name) return null;
  return {
    ids: { openAlexId: w.id.replace("https://openalex.org/", ""), doi: normDoi(w.doi) },
    title: w.display_name, authors: (w.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean),
    year: w.publication_year ?? null, venue: w.primary_location?.source?.display_name ?? null,
    abstract: abstractFromInverted(w.abstract_inverted_index), citationCount: w.cited_by_count ?? 0,
    oaPdfUrl: w.best_oa_location?.pdf_url ?? w.open_access?.oa_url ?? null, url: w.doi ?? w.id, providers: ["openalex"],
  };
}

export async function searchOpenAlex(query, n = 20) {
  const d = await limit(() => getJson("openalex", `${BASE}/works?search=${encodeURIComponent(query)}&per-page=${n}&${mail}`));
  return (d?.results ?? []).map(fromOpenAlex).filter(Boolean);
}
export async function getOpenAlexByDoi(doi) {
  return fromOpenAlex(await limit(() => getJson("openalex", `${BASE}/works/doi:${encodeURIComponent(doi)}?${mail}`)));
}
```

**`crossref.js`** (`https://api.crossref.org/works/{doi}` → `message.title[0]`, `message.author[].family/given`,
`message.issued["date-parts"][0][0]`, `message["container-title"][0]`) and **`unpaywall.js`**
(`https://api.unpaywall.org/v2/{doi}?email=…` → `best_oa_location.url_for_pdf`). Both return the common
shape (or `null` on 404). Send a `User-Agent` that includes `CONTACT_EMAIL` for Crossref's polite pool.

### 22.4 Merge + dedupe — `src/services/scholarly/merge.js`

```js
import { normTitle } from "../validation/metadata.js";

/** Merge records describing the same paper; prefers non-empty fields; unions ids & providers. */
export function mergePapers(papers) {
  const byKey = new Map();
  const keyOf = (p) =>
    (p.ids.doi && `doi:${p.ids.doi}`) || (p.ids.arxivId && `arxiv:${p.ids.arxivId}`) ||
    `t:${normTitle(p.title)}|${normTitle(p.authors[0] ?? "").split(" ").pop()}`;
  for (const p of papers) {
    const k = keyOf(p);
    const prev = byKey.get(k);
    if (!prev) { byKey.set(k, { ...p, ids: { ...p.ids }, providers: [...p.providers] }); continue; }
    prev.ids = { ...p.ids, ...Object.fromEntries(Object.entries(prev.ids).filter(([, v]) => v)) };
    for (const f of ["abstract", "venue", "year", "oaPdfUrl", "url"]) prev[f] ||= p[f];
    prev.citationCount = Math.max(prev.citationCount ?? 0, p.citationCount ?? 0);
    if ((p.abstract?.length ?? 0) > (prev.abstract?.length ?? 0)) prev.abstract = p.abstract;
    prev.providers = [...new Set([...prev.providers, ...p.providers])];
  }
  return [...byKey.values()];
}
```

### 22.5 Verification — `src/services/scholarly/verify.js` (L1 + L2)

A candidate came from one index. Verification means **resolving it independently in a second source**
and checking the metadata agrees.

```js
import { getS2Paper } from "./semanticScholar.js";
import { getOpenAlexByDoi } from "./openAlex.js";
import { getCrossref } from "./crossref.js";
import { metadataConsistent } from "../validation/metadata.js";

/** @returns {{ verified: boolean, verifiedIds: string[], reason?: string }} */
export async function verifyPaper(paper, log) {
  const label = `"${paper.title.slice(0, 60)}" (${paper.year ?? "n.d."})`;
  const checks = [];
  if (paper.ids.doi) {
    checks.push(["doi", () => getCrossref(paper.ids.doi)]);
    if (!paper.providers.includes("openalex")) checks.push(["openalex", () => getOpenAlexByDoi(paper.ids.doi)]);
  }
  if (!paper.providers.includes("s2")) {
    const s2Ref = paper.ids.doi ? `DOI:${paper.ids.doi}` : paper.ids.arxivId ? `ARXIV:${paper.ids.arxivId}` : null;
    if (s2Ref) checks.push(["s2", () => getS2Paper(s2Ref)]);
  } else if (paper.ids.s2Id) {
    checks.push(["s2", () => getS2Paper(paper.ids.s2Id)]);
  }
  if (!checks.length) { log?.drop("L1", label, "no_resolvable_id"); return { verified: false, verifiedIds: [], reason: "no_resolvable_id" }; }

  const verifiedIds = [];
  for (const [name, fetcher] of checks) {
    const record = await fetcher().catch(() => null);
    if (!record) continue;
    const c = metadataConsistent(paper, record);
    if (!c.ok) { log?.drop("L2", label, c.reasons.join(",")); return { verified: false, verifiedIds, reason: c.reasons.join(",") }; }
    verifiedIds.push(name);
  }
  if (!verifiedIds.length) { log?.drop("L1", label, "no_id_resolves"); return { verified: false, verifiedIds, reason: "no_id_resolves" }; }
  log?.pass("L1/L2", `${label} via ${verifiedIds.join("+")}`);
  return { verified: true, verifiedIds };
}
```

### 22.6 Tests

Use **fixture JSON** (fake papers like `"Fixture Paper A"`) and `vi.spyOn(globalThis, "fetch")` to return
it. Test: `fromS2`/`fromOpenAlex` mapping; `abstractFromInverted`; `mergePapers` merges by DOI and by title +
author; `verifyPaper` passes when Crossref agrees, fails with `title_mismatch` when it disagrees, fails
with `no_id_resolves` when every lookup returns 404; the cache returns the stored payload without calling fetch twice.

Optional live check: `server/scripts/scholarlyPing.js` searches "graph database benchmark" on both
APIs and prints titles and counts. The user runs it once.

🛑 **CHECKPOINT** — suggested commit: `feat(scholarly): semantic scholar/openalex/crossref/unpaywall clients, merge and L1/L2 verification`

---

## STEP 23 — Interest profile and evidence gap detector

**Goal:** model what the user is studying (topics, sources, question drift, feedback) and detect weak
spots in the evidence. Both feed the recommender.

### 23.1 Profile service — `src/services/profile/profileService.js`

```js
const W = { topics: 0.3, sources: 0.3, questions: 0.4 };
const DECAY = 0.8;           // weight of the i-th most recent question = DECAY^i
const MAX_QUESTIONS = 30;

export async function ensureProfile(projectId, userId) {
  return InterestProfile.findOneAndUpdate(
    { projectId, userId },
    { $setOnInsert: { topics: [], questionHistory: [], exclusions: [] } },
    { upsert: true, new: true },
  );
}

export async function recomputeProfileVector(projectId, userId) {
  const profile = await InterestProfile.findOne({ projectId, userId }).select("+vector +questionHistory.embedding");
  const project = await Project.findById(projectId);
  const topicsVec = project.topics.length ? await embedOne(project.topics.join(", "), "SEMANTIC_SIMILARITY") : null;

  // Sources: mean of a sample of passage embeddings per source (cheap: 5 per source, newest sources weigh more)
  const passages = await Passage.aggregate([
    { $match: { projectId: project._id } },
    { $sample: { size: 60 } },
    { $project: { embedding: 1 } },
  ]);
  const sourcesVec = weightedMean(passages.map((p) => [p.embedding, 1]));

  const qs = [...profile.questionHistory].sort((a, b) => b.at - a.at);
  const questionsVec = weightedMean(qs.map((q, i) => [q.embedding, DECAY ** i]));

  profile.vector = weightedMean([[topicsVec, W.topics], [sourcesVec, W.sources], [questionsVec, W.questions]]) ?? [];
  profile.topics = project.topics;
  await profile.save();
  return profile;
}

export async function recordQuestion(projectId, userId, text, embedding) {
  await InterestProfile.updateOne(
    { projectId, userId },
    { $push: { questionHistory: { $each: [{ text, embedding, at: new Date() }], $slice: -MAX_QUESTIONS } } },
  );
}
```

(Remember `$sample` doesn't return `select: false` fields unless you `$project` them, as above.)

Call `ensureProfile` when a project is created (Step 9 TODO) and when a member is added.
Call `recomputeProfileVector` after a source becomes ready, after a question, and after topics change.
Debounce it through the job runner key `profile:<projectId>:<userId>`.

### 23.2 Feedback → exclusion rule — `src/services/ai/prompts/feedbackRule.js`

```js
export const system = `Turn a researcher's reason for rejecting a paper into a reusable filter rule.
Only create a rule if the reason describes a topic/approach they want to avoid. Reply with JSON only.`;
export const schema = z.object({
  rule: z.object({ concept: z.string().min(2).max(80), strength: z.enum(["soft", "hard"]) }).nullable(),
});
export const build = ({ paperTitle, reason }) => `Paper: "${paperTitle}"
Reason: "${reason}"
Return {"rule": {"concept": "short topic phrase, e.g. RDF/SPARQL", "strength": "soft"}} or {"rule": null}.
Use "hard" only if the reason says they never want this topic.`;
export const mock = ({ reason }) => ({ rule: reason?.length > 5 ? { concept: reason.slice(0, 40), strength: "soft" } : null });
```

The service `addFeedbackRule(projectId, userId, { paperTitle, reason })` stores the rule with its
embedding (`SEMANTIC_SIMILARITY`) in `profile.exclusions` and returns it, so the UI can say
"I've added a soft exclusion for RDF/SPARQL".

### 23.3 Gap detector — `src/services/evidence/gapDetector.js`

Pure function plus a DB wrapper. The rules come from the design document's gap table.

```js
const STALE_YEARS = 8;
const WEAK_SOURCE_TYPES = new Set(["vendor", "blog"]);

/**
 * @param {object} claim                         { text }
 * @param {Array} links                          non-rejected links with { stance, status, source: { _id, sourceType, depth, year } }
 * @param {number} currentYear
 * @returns {Array<{type, weight, queryHint}>}
 */
export function detectGaps(claim, links, currentYear = new Date().getFullYear()) {
  const gaps = [];
  const supports = links.filter((l) => l.stance === "supports");
  const contradicts = links.filter((l) => l.stance === "contradicts");
  const confirmed = (arr) => arr.filter((l) => l.status === "confirmed");
  const distinctSources = (arr) => new Set(arr.map((l) => String(l.source._id))).size;
  const add = (type, weight, hint) => gaps.push({ type, weight, queryHint: `${claim.text} ${hint}`.trim(), detectedAt: new Date() });

  if (supports.length && distinctSources(supports) === 1) add("single_source", 0.8, "independent study");
  if (supports.length && supports.every((l) => WEAK_SOURCE_TYPES.has(l.source.sourceType)))
    add("interested_party_only", 0.9, "independent benchmark peer-reviewed evaluation");
  if (supports.length && !contradicts.length && !links.some((l) => l.stance === "inconclusive"))
    add("unchallenged", 0.6, "limitations criticism negative results");
  const years = supports.map((l) => l.source.year).filter(Boolean);
  if (years.length && currentYear - Math.max(...years) > STALE_YEARS) add("stale", 0.5, "recent evaluation");
  if (supports.length && supports.every((l) => l.source.depth === "abstract_only")) add("abstract_only", 0.4, "");
  if (confirmed(supports).length && confirmed(contradicts).length)
    add("contested", 0.85, "survey comparison why results differ");
  return gaps;
}

export async function refreshGaps(claimId) {
  const claim = await Claim.findById(claimId);
  const links = await EvidenceLink.find({ claimId, status: { $ne: "rejected" } })
    .populate("sourceId", "sourceType depth year").lean();
  const gaps = detectGaps(claim, links.map((l) => ({ ...l, source: l.sourceId })));
  claim.gaps = gaps;
  await claim.save();
  return gaps;
}
```

Call `refreshGaps` at the end of `recomputeClaimStatus`.

### 23.4 Routes

`GET /api/projects/:projectId/profile` (the caller's profile: topics, recent question texts, exclusions,
plus a derived "recent themes" list: the 5 most recent questions) and `PATCH .../profile` to remove
an exclusion or change its strength. Topic changes go through the project PATCH.

### 23.5 Tests

`detectGaps` table tests that reproduce the walkthrough: two passages from the same vendor blog → `single_source`
and `interested_party_only` (and `unchallenged`); adding a confirmed contradiction → `contested`, no longer
`unchallenged`; an old-only source → `stale`. Plus a profile test: question drift moves the vector
toward the question embedding (the cosine increases).

🛑 **CHECKPOINT** — suggested commit: `feat(profile): interest profile with question drift, feedback rules and evidence gap detector`

---

## STEP 24 — Recommender pipeline A: queries, candidates, scoring

**Goal:** steps 1–5 of the design doc's pipeline: build queries → fetch → dedupe → (verification happens in
Step 25 on the shortlist) → embed + score.

> Decision for `docs/decisions.md`: **L1/L2 verification runs on the scored shortlist** (around the top 15),
> not on all 100–200 candidates. This saves API quota. Unverified papers still can never reach the user.

### 24.1 Query generation prompt — `src/services/ai/prompts/searchQueries.js`

```js
export const system = `You write short academic search queries (2-6 words each) for paper search engines.
Do not invent paper titles or author names. Reply with JSON only.`;
export const schema = z.object({
  queries: z.array(z.object({
    q: z.string().min(3).max(80),
    purpose: z.enum(["core", "gap"]),
    gapClaimId: z.string().nullable().optional(),
  })).min(3).max(6),
});
export const build = ({ question, topics, gaps, exclusions }) => `Researcher topics: ${topics.join(", ")}
Current question: ${question ?? "(none — first recommendations)"}
Open evidence gaps:
${gaps.map((g) => `- [${g.claimHumanId}] ${g.type}: ${g.queryHint}`).join("\n") || "- none"}
Avoid these topics: ${exclusions.map((e) => e.concept).join(", ") || "none"}

Return {"queries":[{"q": string, "purpose": "core"|"gap", "gapClaimId": claim ID or null}]}.
Write 2 core queries about the question/topics and up to 3 gap queries targeting the gaps.`;
export const check = ({ gaps }) => idsCheck(new Set(gaps.map((g) => g.claimHumanId)), (d) => d.queries.map((x) => x.gapClaimId).filter(Boolean));
export const mock = ({ topics, gaps }) => {
  const t = topics[0] ?? "graph databases";
  const queries = [
    { q: t, purpose: "core", gapClaimId: null },
    { q: `${t} survey`, purpose: "core", gapClaimId: null },
    ...gaps.slice(0, 3).map((g) => ({ q: g.queryHint.split(" ").slice(0, 5).join(" "), purpose: "gap", gapClaimId: g.claimHumanId })),
  ];
  if (queries.length < 3) queries.push({ q: `${t} evaluation`, purpose: "core", gapClaimId: null });
  return { queries };
};
```

### 24.2 Candidate fetching — `src/services/recommender/candidates.js`

```js
export async function fetchCandidates({ queries, project, log }) {
  const results = await Promise.allSettled(
    queries.flatMap(({ q }) => [searchS2(q, 20), searchOpenAlex(q, 20)]),
  );
  let papers = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  results.filter((r) => r.status === "rejected").forEach((r) => log.info("provider error", { msg: r.reason.message }));

  // Snowballing: references + citations of up to 3 accepted paper-sources that have an S2 id
  const seeds = await Source.find({ projectId: project._id, kind: "paper", "ids.s2Id": { $exists: true } }).sort({ createdAt: -1 }).limit(3).lean();
  for (const s of seeds) {
    const [refs, cites] = await Promise.allSettled([getS2References(s.ids.s2Id, 20), getS2Citations(s.ids.s2Id, 20)]);
    papers.push(...(refs.value ?? []), ...(cites.value ?? []));
  }
  log.info("fetched", { raw: papers.length, seeds: seeds.length });

  papers = mergePapers(papers);
  log.info("after_dedupe", { count: papers.length });
  return papers;
}
```

### 24.3 Filtering — `src/services/recommender/filter.js`

Remove: papers already in the project (match any id against `Source.ids`, or a normalised title match);
papers with Feedback `not_relevant` or `added` (by `paperKey`); papers with **no abstract** (L3 can't be
grounded, so log `drop no_abstract`); papers whose title + abstract embedding has cosine ≥ 0.75 with a **hard**
exclusion. Soft exclusions don't remove papers; they become a score penalty.

### 24.4 Scoring — `src/services/recommender/scoring.js`

Pure functions, unit-tested. Weights match the design document.

```js
export const WEIGHTS = { question: 0.40, profile: 0.20, gap: 0.25, quality: 0.10, access: 0.05 };

export function qualityScore(paper, maxCitesPerYear, currentYear) {
  const age = Math.max(1, currentYear - (paper.year ?? currentYear) + 1);
  const perYear = (paper.citationCount ?? 0) / age;
  return maxCitesPerYear > 0 ? Math.log1p(perYear) / Math.log1p(maxCitesPerYear) : 0;
}

/**
 * @param {Array} papers  with .embedding (unit vectors)
 * @param {object} ctx    { questionVec?, profileVec?, gaps: [{embedding, weight, claimId, humanId, type}], softExclusions: [{embedding}], seenEmbeddings: [] }
 */
export function scorePapers(papers, ctx, currentYear = new Date().getFullYear()) {
  const maxCpy = Math.max(0, ...papers.map((p) => (p.citationCount ?? 0) / Math.max(1, currentYear - (p.year ?? currentYear) + 1)));
  return papers.map((p) => {
    const question = ctx.questionVec ? Math.max(0, cosine(p.embedding, ctx.questionVec)) : 0;
    const profile = ctx.profileVec?.length ? Math.max(0, cosine(p.embedding, ctx.profileVec)) : 0;
    let gap = 0, gapTarget = null;
    for (const g of ctx.gaps) {
      const s = Math.max(0, cosine(p.embedding, g.embedding)) * g.weight;
      if (s > gap) { gap = s; gapTarget = g; }
    }
    const quality = qualityScore(p, maxCpy, currentYear);
    const access = p.oaPdfUrl ? 1 : 0;
    const penalty = Math.max(0, ...ctx.softExclusions.map((e) => cosine(p.embedding, e.embedding) - 0.6)) +
      Math.max(0, ...ctx.seenEmbeddings.map((s) => cosine(p.embedding, s) - 0.92));
    const wq = ctx.questionVec ? WEIGHTS.question : 0;           // no question → redistribute to profile
    const wp = ctx.questionVec ? WEIGHTS.profile : WEIGHTS.profile + WEIGHTS.question;
    const score = wq * question + wp * profile + WEIGHTS.gap * gap + WEIGHTS.quality * quality + WEIGHTS.access * access - penalty;
    return { ...p, score, scoreBreakdown: { question, profile, gap, quality, access, penalty }, gapTarget };
  }).sort((a, b) => b.score - a.score);
}
```

Embed papers in one batch as `title + ". " + abstract` (truncated to ~1500 chars) with `RETRIEVAL_DOCUMENT`,
and embed each gap's `queryHint` with `RETRIEVAL_QUERY`. Cap the pool at the top **60** after a cheap pre-sort
(by citation count and query rank) to control embedding costs.

### 24.5 Tests

Scoring with hand-made vectors: a paper aligned with the gap embedding outranks an equally relevant paper
when a gap exists; a soft exclusion lowers the score; with no question, profile weight is used; quality is
normalised by age (a 2-year-old paper with 200 citations beats a 20-year-old paper with 1,000).
`filter` tests for already-in-project, rejected, no-abstract and hard-exclusion cases.

🛑 **CHECKPOINT** — suggested commit: `feat(recommender): query generation, candidate fetching with snowballing, filtering and scoring`

---

## STEP 25 — Recommender pipeline B: slots, MMR, grounded rationales, batches

**Goal:** steps 6–8 of the design doc: diversify into **five role slots** with MMR, verify each pick (L1/L2),
explain each with an abstract quote (L3), and store the batch with its pipeline log.

### 25.1 Slots + MMR — `src/services/recommender/slots.js`

```js
export const SLOT_ORDER = ["CHALLENGER", "FOUNDATION", "FRONTIER", "CORE", "CORE_2"]; // fill strict slots first
const LAMBDA = 0.7;

export function eligible(slot, p, ctx) {
  const { currentYear, challengerKeys } = ctx;
  switch (slot) {
    case "FOUNDATION": return p.year && p.year <= currentYear - 8 && p.scoreBreakdown.quality >= 0.5;
    case "FRONTIER": return p.year && p.year >= currentYear - 2;
    case "CHALLENGER": return challengerKeys.has(p.key);
    default: return true;
  }
}

/** MMR pick from pool given already-selected papers. */
export function mmrPick(pool, selected) {
  let best = null, bestVal = -Infinity;
  for (const p of pool) {
    const maxSim = selected.length ? Math.max(...selected.map((s) => cosine(p.embedding, s.embedding))) : 0;
    const val = LAMBDA * p.score - (1 - LAMBDA) * maxSim;
    if (val > bestVal) { bestVal = val; best = p; }
  }
  return best;
}

/**
 * Assign papers to five slots. `verify(p)` is async and returns true/false (L1/L2);
 * failed papers are skipped and the next candidate is tried.
 */
export async function assignSlots(ranked, ctx, verify) {
  const picks = {};
  const selected = [];
  const used = new Set();
  for (const slot of SLOT_ORDER) {
    let pool = ranked.filter((p) => !used.has(p.key) && eligible(slot, p, ctx));
    if (slot === "CORE_2" && picks.CORE) {
      const coreAuthors = new Set(picks.CORE.paper.authors.slice(0, 3));
      const diff = pool.filter((p) => !p.authors.slice(0, 3).some((a) => coreAuthors.has(a)) && p.venue !== picks.CORE.paper.venue);
      if (diff.length) pool = diff;
    }
    let note = null;
    if (!pool.length) {
      pool = ranked.filter((p) => !used.has(p.key));
      note = { FOUNDATION: "No strong older work found; showing another core paper.",
               FRONTIER: "No strong recent work found; showing another core paper.",
               CHALLENGER: "No paper challenging your claims was found; showing another core paper." }[slot] ?? null;
    }
    while (pool.length) {
      const p = mmrPick(pool, selected);
      pool = pool.filter((x) => x !== p);
      used.add(p.key);
      if (await verify(p)) {
        picks[slot] = { paper: p, slotNote: note };
        selected.push(p);
        break;
      }
    }
  }
  return ["CORE", "CORE_2", "FOUNDATION", "FRONTIER", "CHALLENGER"].filter((s) => picks[s]).map((slot) => ({ slot, ...picks[slot] }));
}
```

### 25.2 Challenger detection — `src/services/ai/prompts/challengers.js`

Take the top ~10 ranked candidates and the project's **confirmed or provisionally supported** claims. Ask
Gemini which abstracts contradict or qualify a claim. It must return
`{ results: [{ paperId, claimId, relation: "contradicts"|"qualifies"|"none", abstractQuote }] }` with IDs
taken only from the provided lists (use `idsCheck` on both). Validate `abstractQuote` with
`matchQuote(quote, abstract)`. Only validated `contradicts`/`qualifies` results add the paper's key to
`challengerKeys` (and set `gapTargets` to that claim). Give papers temporary IDs in the prompt (`X1…X10`),
never real titles as IDs.

### 25.3 Rationale (L3) — `src/services/ai/prompts/rationale.js`

```js
export const system = `Explain in one sentence why a paper is useful to this researcher, using ONLY its abstract.
Also copy one exact sentence from the abstract that justifies your explanation. Reply with JSON only.`;
export const schema = z.object({
  rationale: z.string().min(10).max(220),
  abstractQuote: z.string().min(15).max(500),
});
export const build = ({ slot, topics, gapText, paper }) => `Researcher topics: ${topics.join(", ")}
Slot: ${slot}${gapText ? `\nTargets this evidence gap: ${gapText}` : ""}
Paper title: ${paper.title}
Abstract: ${paper.abstract}
Return {"rationale": string (<= 25 words), "abstractQuote": one exact sentence from the abstract}.`;
export const mock = ({ paper }) => ({ rationale: `Relevant to your topics (${paper.title.slice(0, 40)}).`,
  abstractQuote: paper.abstract.split(/(?<=\.)\s/)[0] });
```

Pass `check: (d) => matchQuote(d.abstractQuote, paper.abstract).matched ? null : "abstractQuote is not in the abstract"`
so that `generateJson` retries **once** with feedback. If it still fails (an `AppError` is thrown), log
`L3 retry` → `L3 drop`, then replace the paper with the next verified candidate for that slot (call
`assignSlots` again for just that slot, excluding used keys). Store the **original abstract text** returned by
`matchQuote`, not Gemini's version.

### 25.4 Orchestration — `src/services/recommender/pipeline.js`

```js
export async function runRecommendation({ projectId, userId, trigger, triggerText }) {
  const humanId = await nextHumanId(projectId, "batch");
  const batch = await RecommendationBatch.create({ projectId, userId, humanId, trigger, triggerText, status: "running" });
  const log = createPipelineLog(`recommend batch ${humanId}`);
  try {
    // 1. context: project, profile (+vector), open gaps (top 3 by weight), exclusions, question vector
    // 2. queries (prompt 24.1) → log.info("queries", …)
    // 3. fetchCandidates → filter → pre-sort & cap 60 → embed → scorePapers
    // 4. challenger detection (25.2) → ctx.challengerKeys
    // 5. assignSlots(ranked, ctx, (p) => verifyPaper(p, log).then((r) => (p.verifiedIds = r.verifiedIds, r.verified)))
    // 6. rationale + L3 for each pick (replace on failure)
    // 7. save items (+ gapTargets, scoreBreakdown, verifiedIds, groundingPassed: true)
    batch.status = "ready";
    log.info("ready", { verified: `${batch.items.length}/5`, grounding: `${batch.items.length}/${batch.items.length}` });
  } catch (err) {
    batch.status = "failed";
    batch.error = err.message;
    log.info("failed", { error: err.message });
  } finally {
    batch.pipelineLog = log.lines;
    await batch.save();
    emitToProject(projectId, "batch.ready", { batchId: batch.id, status: batch.status });
  }
  return batch;
}
```

If fewer than 5 papers survive, still save the batch with what you have and a log line explaining why.
**Never pad with unverified papers.**

### 25.5 Routes — `src/routes/recommendations.js` (at `/api/projects/:projectId/recommendations`)

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/` | editor | `{ trigger?: "manual" }` → enqueue `runRecommendation` → **202** `{ batchId }` (`aiLimiter`; reject if a batch is already running for this user: 409) |
| GET | `/latest` | viewer | the caller's latest batch |
| GET | `/:batchId` | viewer | batch, including `pipelineLog` |
| POST | `/:batchId/items/:index/feedback` | editor | `{ action: "added"\|"not_relevant"\|"read"\|"later", reason? }` |

Feedback handling:
- Always upsert a `Feedback` row (by `paperKey`) and set `item.feedback`.
- `not_relevant` with a reason → `addFeedbackRule` (Step 23), returning the rule so the UI can show it. Then
  replace that card: run the slot assignment for that slot only, verify + ground the replacement, and update the batch item.
- `added` → create a `Source` (`kind: "paper"`, ids, title, authors, venue, year, `sourceType` via
  `classifySource({ kind: "paper", hasDoi })`). If `oaPdfUrl` exists, fetch it with `fetchUrl` (SSRF guard), extract with
  `extractPdf` and set `depth: "full_text"`. Otherwise set `rawPages = [abstract]` and `depth: "abstract_only"`.
  Then `scheduleIngestion`. If the PDF fetch fails, fall back to the abstract and note it on the source.

**Onboarding trigger:** after a project's first source becomes ready, run
`runRecommendation({ trigger: "onboarding" })` once.

### 25.6 Tests

With AI mock + fixture scholarly data (fetch spy): a batch has ≤ 5 items, every item has `groundingPassed` true
and a non-empty `verifiedIds`, no slot appears twice, and the pipeline log contains drop lines for the
fixture paper whose Crossref title mismatches. MMR test: two near-identical high scorers aren't both picked
when a diverse alternative exists. Rationale test: a mock returning a non-abstract quote triggers a replacement.

🛑 **CHECKPOINT** — suggested commit: `feat(recommender): five role slots with mmr, l1-l3 validation, batches and feedback`

---

## STEP 26 — Client: recommendation cards and profile panel

**Goal:** the right-hand panel shows five verified, explained papers and lets the user act on them.
The profile tab shows "What I think you're interested in".

### 26.1 API — `client/src/api/recommendations.js` and `profile.js`

Functions for: `latest`, `get`, `generate`, `feedback(batchId, index, data)`, `getProfile`, `updateProfile`.

### 26.2 `components/recommendations/RecommendationPanel.jsx`

- Header: "Recommended for you · Batch B2 · trigger: question" + a **Generate new batch** button
  (disabled while running). While running, show a skeleton of 5 cards and the text
  "Searching Semantic Scholar and OpenAlex, verifying papers…".
- Poll `/latest` every 3 seconds while `status === "running"` (Step 29 replaces this with `batch.ready`).
- If the batch failed: show the error and a retry button.

### 26.3 `components/recommendations/PaperCard.jsx` (matches the design doc's card table)

| Element | Content |
|---|---|
| Role badge | CORE / CORE-2 (navy), FOUNDATION (teal), FRONTIER (purple), CHALLENGER (red) |
| Title / authors / venue / year | First 3 authors + "et al." |
| Why this paper | `rationale` |
| Grounding | "✓ Explanation found in abstract", and an expandable box showing `rationaleQuote` |
| Fills gap | `C2 · contested` chips that link to the claim |
| Access | "Open-access PDF — full text will be ingested" or "Abstract only" |
| Verified IDs | `DOI ✓  S2 ✓  OpenAlex ✓` |
| Slot note | muted italic text when the slot fell back |
| Actions | **Add to project** · **Not relevant** (opens a reason input) · **Already read** · **Save for later** |

After "Not relevant" with a reason, show a toast with the created rule
("Added a soft exclusion for 'RDF/SPARQL' — undo") and swap in the replacement card.
After "Add", invalidate `["sources", pid]` and show "Added — ingesting…".

### 26.4 `components/profile/ProfilePanel.jsx`

A tab next to Recommendations: topics (editable chips, saved via project PATCH), level, recent question
themes (the last 5 questions), and exclusions with strength toggles (soft/hard) and remove buttons.
A short explainer line: "Recommendations use your topics, your sources and your recent questions."

### 26.5 Log tab

`components/review/PipelineLogView.jsx` in the centre "Log" tab: the latest batch's `pipelineLog` in a
monospace box, with drop lines tinted red and pass lines green. (This is the "trust moment" in the demo
script, so make it readable.)

### 26.6 Verify

In the deployed app: generate a batch, add one paper (it appears in Sources and gets ingested), reject
one with a reason (the rule appears in the Profile tab, and the card is replaced), and open the Log tab.

🛑 **CHECKPOINT** — suggested commit: `feat(client): recommendation cards, profile panel and pipeline log view`

---

## STEP 27 — Agent orchestrator and chat panel

**Goal:** the research chat from the walkthrough. Each turn is routed (question / new claim /
recommendation request / small talk). Questions get **grounded answers** whose citations are validated,
are mapped to claims, and trigger linking, profile drift and recommendations.

### 27.1 Intent prompt — `src/services/ai/prompts/intent.js`

```js
export const schema = z.object({
  intent: z.enum(["question", "claim", "recommend", "chitchat"]),
  claimText: z.string().max(300).nullable().optional(), // for "question": the checkable claim behind it
});
// system: classify the message; for questions, restate the underlying checkable claim
// (e.g. "are graph DBs faster than SQL?" → "Graph databases outperform relational databases on multi-hop queries").
// mock: intent "question", claimText = message
```

### 27.2 Grounded answer prompt — `src/services/ai/prompts/answer.js`

```js
export const system = `You are a careful research assistant. Answer ONLY from the passages provided.
Every factual sentence must cite a passage like [P-14] and you must list each citation with an exact quote.
If the passages disagree, say so and explain under what conditions each side holds.
If the passages don't answer the question, say what is missing. Never use outside knowledge. Reply with JSON only.`;
export const schema = z.object({
  answer: z.string().min(1).max(2500),             // markdown-free prose with [P-x] markers
  citations: z.array(z.object({ passageId: z.string(), quote: z.string().min(8).max(400) })).max(12),
  evidenceSufficient: z.boolean(),
});
```

### 27.3 Orchestrator — `src/services/agent/orchestrator.js`

```js
export async function handleTurn({ project, user, message }) {
  await ChatMessage.create({ projectId: project._id, userId: user._id, role: "user", content: message });
  const { intent, claimText } = await classifyIntent(message);

  if (intent === "recommend") {
    const batch = await enqueueRecommendation({ project, user, trigger: "manual", triggerText: message });
    return reply(project, "I'm searching for five verified papers now — they'll appear on the right.", { intent, batchId: batch?.id });
  }
  if (intent === "claim") {
    const { claim, merged } = await createOrMergeClaim({ projectId: project._id, text: claimText ?? message, origin: "user", userId: user._id });
    scheduleLinking(claim._id);
    return reply(project, merged ? `That matches existing claim ${claim.humanId}. I'm re-checking its evidence.` :
      `Added claim ${claim.humanId}. I'm looking for supporting and contradicting passages.`, { intent, claimId: claim.id });
  }
  if (intent === "chitchat") return reply(project, await smallTalk(message), { intent });

  // ---- question ----
  const qVec = await embedOne(message, "RETRIEVAL_QUERY");
  await recordQuestion(project._id, user._id, message, qVec);
  enqueue(`profile:${project._id}:${user._id}`, () => recomputeProfileVector(project._id, user._id));

  // map to an existing claim (cosine ≥ 0.85) or create one from claimText
  const claimVec = claimText ? await embedOne(claimText, "SEMANTIC_SIMILARITY") : qVec;
  const { claim, merged } = await createOrMergeClaim({ projectId: project._id, text: claimText ?? message,
    origin: "ai_from_question", userId: user._id, embedding: claimVec });

  const passages = await searchPassages({ projectId: project._id, queryVector: qVec, limit: 12 });
  const sources = await Source.find({ _id: { $in: passages.map((p) => p.sourceId) } }).select("title sourceType").lean();
  const input = { question: message, passages: passages.map((p) => ({ id: p.humanId, text: p.text,
    source: sources.find((s) => s._id.equals(p.sourceId)) })) };
  const out = await generateJson({ task: "chat.answer", ...answerPrompt, prompt: answerPrompt.build(input),
    check: answerPrompt.check(input), mock: () => answerPrompt.mock(input) });

  // Validate citations (L4). Invalid ones are removed from the answer text too.
  const valid = [];
  for (const c of out.citations) {
    const p = passages.find((x) => x.humanId === c.passageId);
    const m = p && matchQuote(c.quote, p.text);
    if (m?.matched) valid.push({ passageId: p._id, humanId: p.humanId, sourceId: p.sourceId, quote: m.original, matchType: m.matchType });
  }
  const validIds = new Set(valid.map((v) => v.humanId));
  const answer = out.answer.replace(/\[(P-\d+)\]/g, (m, id) => (validIds.has(id) ? m : ""));
  const dropped = out.citations.length - valid.length;

  scheduleLinking(claim._id);
  const shouldRecommend = await shouldTriggerRecommendation(project._id, user._id); // e.g. every 2nd question, or a new gap appeared
  if (shouldRecommend) enqueueRecommendation({ project, user, trigger: "question", triggerText: message });

  const footer = `${merged ? `Mapped to existing claim ${claim.humanId}` : `Tracking this as claim ${claim.humanId}`}. ` +
    `Evidence links are provisional until you review them.`;
  return reply(project, valid.length ? `${answer}\n\n${footer}` :
      `I couldn't find passages in your sources that answer this reliably. ${footer}`,
    { intent, claimId: claim.id, citations: valid, validation: { proposed: out.citations.length, dropped }, recommended: shouldRecommend });
}
```

`reply()` saves the agent `ChatMessage` (with `citations` and `meta`), emits `chat.message`, and returns it.
Write `smallTalk` with `generateText`, a short system prompt that steers back to the research, and a mock.

### 27.4 Routes — `src/routes/chat.js`

- `GET /api/projects/:projectId/chat?before=&limit=50` (viewer): paginated history.
- `POST /api/projects/:projectId/chat` (editor, `aiLimiter`): `{ message (1–2000 chars) }` → returns
  `{ userMessage, agentMessage }`. A turn takes a few seconds, so the request stays open. Set the client timeout to 60s.

### 27.5 Client — `components/chat/ChatPanel.jsx`

- Message list with auto-scroll. User bubbles are right-aligned. Agent bubbles render the text with `[P-14]` markers
  turned into **citation chips**. Clicking a chip navigates to `sources/:sourceId?passage=P-14`, and hovering shows
  the quote.
- Show `meta.validation.dropped > 0` as a subtle note: "1 citation was removed because its quote wasn't found in the source."
- Show a "Claim C2" chip linking to the claim detail, and "New recommendations on the right →" when `meta.recommended` is true.
- Optimistic user bubble plus a typing indicator while pending. On error, show a retry option.
- Input: textarea, Enter to send, Shift+Enter for a newline, character counter.
- Empty state with 3 example prompts for the project's topic (e.g. "What should I read first?",
  "Are graph databases actually faster than SQL?").

### 27.6 Tests

With mocks: a question creates or merges a claim, stores both messages, and returns only citations whose quotes match;
an answer containing a fabricated citation has that `[P-x]` marker stripped and `dropped: 1`;
`recommend` intent enqueues a batch; `claim` intent creates a claim.

🛑 **CHECKPOINT** — suggested commit: `feat(agent): chat orchestrator with grounded, citation-validated answers and chat panel`

---

## STEP 28 — Evidence graph endpoint and Cytoscape view

**Goal:** the evidence graph from the design doc's Figure 5. Claims are navy nodes, passages are small nodes
coloured by source type, and edges are coloured by stance: dashed when AI-suggested, purple when disputed.

### 28.1 Endpoint — `GET /api/projects/:projectId/graph?claimId=&status=&sourceId=`

Return Cytoscape-ready elements:

```js
// nodes
{ data: { id: `claim:${c._id}`, kind: "claim", label: c.humanId, text: c.text, status: c.status, gapCount: c.gaps.length } }
{ data: { id: `passage:${p._id}`, kind: "passage", label: p.humanId, sourceTitle, sourceType, sourceId, page: p.page } }
// edges (one per non-rejected link)
{ data: { id: `link:${l._id}`, source: `passage:${l.passageId}`, target: `claim:${l.claimId}`,
          stance: l.stance, status: l.status, scope: l.scope, linkId: l._id } }
```

Only include passages that have at least one link. Filters: a single claim (and its passages), status
(`unreviewed` = ai_suggested + disputed), contested claims only, or a single source. Cap at 400 elements
and return `truncated: true` when the cap is hit.

### 28.2 Install

```bash
cd client && npm install cytoscape
```

### 28.3 `components/graph/EvidenceGraph.jsx`

```jsx
import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";

const STANCE_COLOR = { supports: "#2e8b57", contradicts: "#c0392b", inconclusive: "#c98b0b" };
const TYPE_COLOR = { peer_reviewed: "#1f3a5f", preprint: "#4c6a90", vendor: "#c98b0b", blog: "#8a6d3b", news: "#5c6670", unknown: "#9aa5b1" };

const style = [
  { selector: "node[kind='claim']", style: {
      shape: "round-rectangle", "background-color": "#1f3a5f", color: "#fff", label: "data(label)",
      "text-valign": "center", "font-size": 11, "font-weight": 700, width: 56, height: 32 } },
  { selector: "node[kind='claim'][status='contested']", style: { "border-width": 3, "border-color": "#ffd27a" } },
  { selector: "node[kind='passage']", style: {
      "background-color": (n) => TYPE_COLOR[n.data("sourceType")] ?? TYPE_COLOR.unknown,
      label: "data(label)", "font-size": 9, color: "#222831", "text-valign": "bottom", "text-margin-y": 4, width: 16, height: 16 } },
  { selector: "edge", style: {
      width: 2.5, "curve-style": "bezier", "target-arrow-shape": "none",
      "line-color": (e) => STANCE_COLOR[e.data("stance")] } },
  { selector: "edge[status='ai_suggested']", style: { "line-style": "dashed", opacity: 0.8 } },
  { selector: "edge[status='disputed']", style: { "line-color": "#6c4ab6", width: 3.5 } },
  { selector: ":selected", style: { "overlay-color": "#17806f", "overlay-opacity": 0.15 } },
];

export default function EvidenceGraph({ elements, onSelectClaim, onSelectPassage, onSelectLink }) {
  const ref = useRef(null);
  const cyRef = useRef(null);

  useEffect(() => {
    const cy = cytoscape({ container: ref.current, style, elements: [], wheelSensitivity: 0.2 });
    cy.on("tap", "node[kind='claim']", (e) => onSelectClaim?.(e.target.id().split(":")[1]));
    cy.on("tap", "node[kind='passage']", (e) => onSelectPassage?.(e.target.data()));
    cy.on("tap", "edge", (e) => onSelectLink?.(e.target.data("linkId")));
    cyRef.current = cy;
    return () => cy.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => { cy.elements().remove(); cy.add(elements); });
    cy.layout({ name: "cose", animate: false, nodeRepulsion: 9000, idealEdgeLength: 90, padding: 30 }).run();
  }, [elements]);

  return <div ref={ref} className="h-full min-h-[480px] w-full rounded-xl border border-line bg-white" />;
}
```

### 28.4 `components/graph/GraphView.jsx` (Graph tab)

Toolbar filters (All · Contested only · Unreviewed only · Source ▾ · Claim ▾), a legend matching the design doc
("Edge colour = stance. Solid = reviewed by a human. Dashed = AI-suggested. Purple = disputed."), and a side
drawer. Clicking a claim opens its summary with a "Open claim" button. Clicking a passage shows the passage text
with "Open in source". Clicking an edge shows the `LinkCard` with review buttons, so you can review straight from the graph.
Handle the empty state ("Add sources and claims to see the evidence graph") and `truncated`.

### 28.5 Verify

In the deployed app, recreate the walkthrough shape: one claim with passages from two sources, one confirmed
support, one confirmed contradiction (the claim gets the contested ring), one AI-suggested (dashed) and one disputed
(purple). Clicking each element opens the right panel.

🛑 **CHECKPOINT** — suggested commit: `feat(graph): evidence graph endpoint and interactive cytoscape view`

---

## STEP 29 — Realtime collaboration: Socket.io, comments, disputes, presence

**Goal:** two researchers see each other's reviews, comments and new batches live, plus who else is online.
This replaces the polling from Steps 17 and 26.

### 29.1 Install

```bash
cd server && npm install socket.io
cd ../client && npm install socket.io-client
```

### 29.2 Server — `src/sockets/index.js`

```js
import { Server } from "socket.io";
import { isAllowedOrigin } from "../config/cors.js";
import { verifyToken } from "../services/auth/authService.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { setIo } from "../services/realtime/events.js";

export function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: (origin, cb) => cb(null, isAllowedOrigin(origin)) },
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  io.use(async (socket, next) => {
    try {
      const { sub } = verifyToken(socket.handshake.auth?.token);
      const user = await User.findById(sub);
      if (!user) return next(new Error("unauthorized"));
      socket.data.user = { id: user.id, name: user.name };
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("project:join", async (projectId, ack) => {
      const ok = await Project.exists({ _id: projectId, "members.userId": socket.data.user.id }).catch(() => null);
      if (!ok) return ack?.({ ok: false });
      for (const room of socket.rooms) if (room.startsWith("project:")) socket.leave(room);
      socket.join(`project:${projectId}`);
      socket.data.projectId = projectId;
      ack?.({ ok: true });
      broadcastPresence(io, projectId);
    });
    socket.on("disconnect", () => socket.data.projectId && broadcastPresence(io, socket.data.projectId));
  });

  setIo(io);
  return io;
}

async function broadcastPresence(io, projectId) {
  const sockets = await io.in(`project:${projectId}`).fetchSockets();
  const users = [...new Map(sockets.map((s) => [s.data.user.id, s.data.user])).values()];
  io.to(`project:${projectId}`).emit("presence", users);
}
```

Replace the stub in `src/services/realtime/events.js`:

```js
let io = null;
export const setIo = (instance) => (io = instance);
/** Safe to call anywhere; no-op in tests or before sockets start. */
export function emitToProject(projectId, event, payload) {
  io?.to(`project:${projectId}`).emit(event, { ...payload, at: Date.now() });
}
```

Call `initSockets(server)` in `index.js` before `server.listen`.

Events emitted by the services (check every one exists): `source.updated`, `claim.updated`,
`link.updated`, `batch.ready`, `chat.message`, `comment.added`, `presence`.

### 29.3 Comments & disputes

Routes `GET/POST /api/projects/:projectId/comments?targetKind=link&targetId=` (viewer reads, editor writes;
text 1–2000 chars) and `PATCH /comments/:commentId { resolved }`. Posting a comment emits `comment.added`.
When a link becomes `disputed` (Step 20), the UI opens its comment thread automatically. When the dispute is
resolved (moved to `confirmed`/`rejected` with a reason), the audit event captures the resolution reasoning,
exactly as in the walkthrough's Step 6.

### 29.4 Client — `context/SocketContext.jsx` + `hooks/useProjectEvents.js`

```jsx
// SocketContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { API_URL, tokenStore } from "../api/client.js";
import { useAuth } from "./AuthContext.jsx";

const SocketContext = createContext(null);
export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  useEffect(() => {
    if (!user) return;
    const s = io(API_URL, { auth: { token: tokenStore.get() }, transports: ["websocket", "polling"] });
    setSocket(s);
    return () => s.disconnect();
  }, [user]);
  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}
export const useSocket = () => useContext(SocketContext);
```

```js
// hooks/useProjectEvents.js
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "../context/SocketContext.jsx";

const INVALIDATE = {
  "source.updated": (pid) => [["sources", pid]],
  "claim.updated": (pid, p) => [["claims", pid], ["claim", p.claimId], ["graph", pid]],
  "link.updated": (pid, p) => [["links", pid], ["claims", pid], ["claim", p.claimId], ["graph", pid]],
  "batch.ready": (pid) => [["recommendations", pid]],
  "chat.message": (pid) => [["chat", pid]],
  "comment.added": (pid, p) => [["comments", p.targetId]],
};

export function useProjectEvents(projectId) {
  const socket = useSocket();
  const qc = useQueryClient();
  const [presence, setPresence] = useState([]);
  useEffect(() => {
    if (!socket || !projectId) return;
    const join = () => socket.emit("project:join", projectId);
    join();
    socket.on("connect", join); // re-join after reconnects (e.g. Render restarts)
    const handlers = Object.entries(INVALIDATE).map(([event, keys]) => {
      const h = (payload) => keys(projectId, payload).forEach((k) => qc.invalidateQueries({ queryKey: k }));
      socket.on(event, h);
      return [event, h];
    });
    socket.on("presence", setPresence);
    return () => {
      socket.off("connect", join);
      handlers.forEach(([e, h]) => socket.off(e, h));
      socket.off("presence", setPresence);
    };
  }, [socket, projectId, qc]);
  return { presence };
}
```

Then:
- Wrap the app in `SocketProvider` (inside `AuthProvider`).
- Call `useProjectEvents` in `WorkspacePage` and show presence avatars (initials) in the header.
- **Remove the polling** (`refetchInterval`) from Steps 17 and 26, keeping a 30s fallback poll only
  while `socket.connected === false`.
- Add a `CommentThread` component to `LinkCard` (collapsed by default, shows a count) and to the claim detail.
- Show a small "Live" / "Reconnecting…" indicator in the header.
- Make sure the query keys used across the client match the table above (refactor them if not).

### 29.5 Tests

Server: start the app on an ephemeral port in a test, connect two `socket.io-client` clients with tokens
(one member, one non-member). The member's `project:join` gets `ok: true`, the non-member's gets `false`, and
a review via the REST API emits `link.updated` to the member only. A connection without a token is rejected.

### 29.6 Verify in production

Open the deployed app in two browsers with two accounts (add the second as an editor). Change a stance in one:
the other updates without a reload, presence shows both users, and comments appear live.

🛑 **CHECKPOINT** — suggested commit: `feat(realtime): socket.io rooms with jwt auth, live updates, comments, disputes and presence`

---

## STEP 30 — Export, hardening, CI, demo seed, final deployment check

**Goal:** ship it. This step has five parts (30a–30e). Finish them all before the checkpoint.
If the user prefers, pause after any part and ask whether to continue.

### 30a. Export

`src/services/export/` with two functions and routes under `/api/projects/:projectId/export`:

- **`GET /export?format=md`** → `text/markdown` attachment `proofchain-<project>-<date>.md` containing:
  the project, topics and export date; then **for each claim**: ID, text, confirmed status (and provisional
  status if different), gaps, and confirmed supporting and contradicting passages as blockquotes with the source
  title, page and passage ID. Then unreviewed/disputed links listed separately under "Still provisional", and
  "Open evidence gaps". Finally, "Sources" with each source's URL/DOI, retrieval time and snapshot hash
  (provenance, L7).
- **`GET /export?format=bib`** → `application/x-bibtex`, generated **only from sources with verified metadata**
  (`kind: "paper"` with a DOI/S2 id, or a URL source with title/URL as `@misc`). Escape BibTeX special characters.
  Keys: `firstauthorlastnameYEARfirsttitleword`, de-duplicated with a/b suffixes.

Client: an "Export" menu in the workspace header that downloads via
`api.get(url, { responseType: "blob" })` and an object URL (a plain link won't send the Bearer token).

Test both formats with fixtures (snapshot tests are fine).

### 30b. Production hardening checklist

Work through it, fixing anything missing:

- [ ] `aiLimiter` on every route that calls Gemini or the scholarly APIs (chat, claims POST, linking run, recommendations, feedback).
- [ ] All request bodies validated with Zod; string lengths capped; ObjectId params validated.
- [ ] No route returns `embedding`, `rawPages` or `passwordHash` (grep for `select("+` and check each use).
- [ ] Error responses in production never include stack traces (check `errorHandler`).
- [ ] Every Mongo query on project data is scoped by `projectId` from `req.project`, **never** from the request body.
- [ ] `dangerouslySetInnerHTML` appears nowhere in the client.
- [ ] Client: every query has loading, empty and error states; the cold-start banner works on every page.
- [ ] Interrupted jobs: restart the Render service mid-ingestion and confirm the source resumes (`resumeInterruptedJobs`). Recommendation batches stuck in `running` for more than 10 minutes are marked `failed` at boot.
- [ ] Logs: no secrets or full documents logged; Gemini errors are logged with the `task` name.
- [ ] `render.yaml`, both `.env.example` files and Appendix A list every env var actually used (`grep -rn "env\." server/src`).

### 30c. CI — `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:
jobs:
  server:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: server } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: server/package-lock.json }
      - run: npm ci
      - run: npm test
        env: { AI_MOCK: "true", VECTOR_SEARCH_MODE: "memory" }
  client:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: client } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: client/package-lock.json }
      - run: npm ci
      - run: npm run build
        env: { VITE_API_URL: "https://example.invalid" }
```

Suggest that the user enables branch protection requiring CI to pass (optional).

### 30d. Demo seed — `server/scripts/seedDemo.js`

Creates a demo user (`demo@proofchain.dev`, password printed once) and a project named "Seminar: Graph Databases"
with topics `graph databases, query languages, performance`. It does **not** fabricate sources or papers.
It prints instructions for the presenter to add real sources through the UI during setup (a vendor blog post
and a survey PDF they own), matching the walkthrough. Add the npm script `"seed:demo"`. It must refuse to run
unless `ALLOW_SEED=true` is set.

### 30e. Final deployment verification

1. Run `npm test` (server) and `npm run build` (client) locally.
2. Ask the user to push and confirm that Render and Vercel both deployed the latest commit (the health
   `version` shows the commit SHA).
3. Ask the user to run `npm run smoke` against production.
4. Walk through the **demo script** from the design document (Section 13.2) on production and tick each item:
   - [ ] Create a project and add a vendor blog post → claims appear with passage highlights
   - [ ] Batch one shows five role-labelled cards with verified badges, including a CHALLENGER
   - [ ] Ask "are graph databases actually faster than SQL?" → the claim turns contested and red edges appear
   - [ ] The pipeline log shows at least one dropped candidate and why
   - [ ] A second browser changes a stance live → the graph updates and the audit event appears
   - [ ] Export → a BibTeX file in which every entry was verified
5. Complete `README.md`: pitch, live URLs, architecture summary (link to the design PDF), local setup
   (`npm run install:all`, copy both `.env.example` files, `npm run db:indexes`, `npm run dev`), testing, deployment
   (link `docs/deployment.md`), the env var table (Appendix A), and known limitations (from the design doc's risks table).

🛑 **CHECKPOINT** — suggested commit: `feat: export, production hardening, ci, demo seed and final docs`

After this checkpoint, tell the user the build plan is complete and suggest optional next steps from the
design document's "Future scope" (an NLI second opinion for stance, Zotero import, a systematic review mode, and so on).

---

## Appendix A — Environment variables

### Server (`server/.env`, Render dashboard)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | yes | development | `production` on Render |
| `PORT` | no | 4000 | Render injects this |
| `LOG_LEVEL` | no | info | pino level |
| `MONGODB_URI` | **yes** | — | Atlas connection string including `/proofchain` |
| `JWT_SECRET` | **yes** | — | ≥ 32 chars; Render generates it |
| `JWT_EXPIRES_IN` | no | 7d | Token lifetime |
| `CORS_ORIGINS` | **yes** (prod) | http://localhost:5173 | Comma-separated; `*` wildcard allowed for Vercel previews |
| `AI_MOCK` | no | false | `true` = no Gemini calls (tests/dev) |
| `GEMINI_API_KEY` | yes unless mock | — | Google AI Studio key |
| `GEMINI_MODEL` | no | gemini-2.5-flash | Generation model |
| `GEMINI_EMBED_MODEL` | no | gemini-embedding-001 | Embedding model |
| `EMBED_DIM` | no | 768 | Must match the Atlas vector index |
| `AI_CONCURRENCY` | no | 2 | Parallel Gemini calls |
| `VECTOR_SEARCH_MODE` | no | atlas | `memory` for tests |
| `VECTOR_INDEX_NAME` | no | passage_vector_index | Atlas index name |
| `S2_API_KEY` | recommended | — | Semantic Scholar key |
| `CONTACT_EMAIL` | yes (prod) | — | OpenAlex/Crossref polite pool, Unpaywall |
| `MAX_UPLOAD_MB` | no | 15 | PDF upload limit |
| `ALLOW_SEED` | no | — | Must be `true` to run `seed:demo` |

### Client (`client/.env`, Vercel dashboard)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_URL` | **yes** | API origin without a trailing slash, e.g. `https://proofchain-api.onrender.com` |

---

## Appendix B — Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Server exits at boot with "Invalid environment configuration" | Missing or invalid env var | Read the listed variable names; check `.env` / the Render dashboard |
| `$vectorSearch` error "index not found" | Index not created or still building | Run `npm run db:indexes`; wait until it shows READY in Atlas |
| Vector search returns nothing | `EMBED_DIM` doesn't match the index, or passages have no embeddings | Recreate the index; re-ingest sources |
| CORS error in the browser | `CORS_ORIGINS` doesn't include the Vercel domain | Add it (and the preview wildcard), then redeploy the API |
| 404 when refreshing a page on Vercel | Missing `vercel.json` rewrites | See Step 5.5 |
| First request takes ~50s | Render free tier was asleep | Expected; the banner explains it |
| Gemini 429 errors | Free-tier rate limit | Lower `AI_CONCURRENCY` to 1; backoff is built in |
| Semantic Scholar 429 | No API key / shared pool | Add `S2_API_KEY`; the cache reduces repeat calls |
| PDF "no extractable text" | Scanned PDF | OCR is out of scope; ask for a text PDF |
| Socket keeps reconnecting | Token expired, or CORS origin rejected | Log in again; check `CORS_ORIGINS` |
| `mongodb-memory-server` download fails in CI | Network/cache | Re-run; or set `MONGOMS_VERSION` to a known version |

---

## Appendix C — Mapping to the design document

| Design doc section | Implemented in steps |
|---|---|
| 3 Core concepts | 9, 11 |
| 4 Architecture | 2–6, 12, 13 |
| 5.1 Source ingestion | 14–17 |
| 5.2 Claim extraction | 19 |
| 5.3 Evidence linking (+ lifecycle) | 20, 21 |
| 5.4 Interest profile | 23, 26 |
| 5.5 Evidence gap detection | 23 |
| 6 Recommendation engine | 22, 24, 25, 26 |
| 7 Validation layers L1–L7 | L1/L2: 18, 22 · L3: 25 · L4: 18–20, 27 · L5: 13 · L6: 20–21 · L7: 16, 30a |
| 8 Walkthrough (chat, batches, review, export) | 27, 25–26, 20–21, 29, 30a |
| 9 Data model | 11 |
| 10 API design | routes across steps 7–30 |
| 11 Prompt design | 13, 19, 20, 24, 25, 27 |
| 12 Main screens | 10, 17, 21, 26, 27, 28 |
| 13 Build plan, demo, evaluation | this guide; demo check in 30e |
| 14 Risks | 30b hardening, Appendix B |
