# ProofChain

**A collaborative research agent that links every claim to a verified, quoted passage from your sources, and
recommends real, verified papers to fill the gaps.**

Add web pages and PDFs, and ProofChain splits them into numbered passages, extracts the checkable claims, and links
each claim to the passages that support or contradict it (or are inconclusive), quoting them word for word. A person confirms or
rejects every AI suggestion. ProofChain then looks for what is missing (single-source claims, vendor-only support,
nothing that challenges a claim) and recommends five papers, each verified in two scholarly indexes and explained
with a sentence quoted from its abstract. The AI never invents papers, passages, quotes or IDs: every AI output is
checked before it is stored.

## Live

- App: https://proof-chain-virid.vercel.app
- API: https://proofchain-api-quf3.onrender.com/api/health (the free tier sleeps when idle; the first request can take ~60 s)

## Features

- **Sources**: web pages (SSRF-safe fetching, readable-text extraction) and text PDFs, split into citable passages (`P-14`)
  with page numbers; deep links highlight the exact passage.
- **Claims and evidence**: claims are extracted from sources, chat or typed in; evidence links (`L-3`) carry a stance
  (supports / contradicts / inconclusive), an optional scope and the verbatim quote. Claim status (supported,
  contested, …) comes only from human-confirmed evidence; the AI-inclusive status is shown separately as provisional.
- **Review**: a review queue for AI suggestions and disputes; rejecting, disputing and changing a stance require a
  reason; everything is in the audit history.
- **Recommendations**: five role slots (CORE, CORE-2, FOUNDATION, FRONTIER, CHALLENGER) from Semantic Scholar and
  OpenAlex, verified via DOI/Crossref, ranked against your interest profile and evidence gaps; "Not relevant" with a
  reason becomes an exclusion rule. The pipeline log shows every check and every dropped candidate.
- **Research chat**: answers only from your passages, with citation chips; citations whose quote isn't found are removed.
- **Evidence graph**: claims and passages coloured by stance, source type and review state (Cytoscape).
- **Collaboration**: live updates, presence, comment threads, and disputes resolved with a recorded reason (Socket.io).
- **Export**: a Markdown report (confirmed evidence, provisional links, gaps, sources with snapshot hashes) and a
  BibTeX file of verified sources only.

## Architecture

| Part | Stack | Hosting |
|---|---|---|
| Client | React 19, Vite, Tailwind CSS v4, React Router 7, TanStack Query, motion, Cytoscape, socket.io-client | Vercel |
| API | Node 22, Express 5, Mongoose 8, Zod, Socket.io, pino | Render (free web service) |
| Data | MongoDB Atlas with Atlas Vector Search (`passage_vector_index`, 768-d cosine) | Atlas M0 |
| AI | Claude Sonnet 5.5 for generation (Gemini optional), Gemini `gemini-embedding-001` for embeddings; all JSON output validated with Zod | Anthropic API, Google AI Studio |
| Scholarly | Semantic Scholar, OpenAlex, Crossref, Unpaywall (responses cached in MongoDB) | public APIs |

The server is stateless apart from an in-memory job runner (ingestion, linking, recommendations), and every config
value comes from environment variables. The client authenticates with a Bearer JWT, and the same token
authenticates the socket. Validation layers: L1, the paper exists in a second index; L2, its metadata matches;
L3, the rationale is quoted from the abstract; L4, quotes exist in the passage; L5, AI output passes schema and
checks; L6, human review; L7, provenance (retrieval time and snapshot hash).

The full design is in `docs/ProofChain_Research_Agent_Design.pdf`. Deviations from it are logged in
[`docs/decisions.md`](docs/decisions.md).

```
client/   React app (src/api, components, context, hooks, pages)
server/   API (src/routes, services/{ingestion,claims,evidence,recommender,scholarly,agent,…}, sockets, models)
          scripts/ (db:indexes, ai:ping, scholarly:ping, seed:demo), tests/ (unit + integration)
docs/     deployment guide, decision log
scripts/  smoke.mjs (production smoke test)
```

## Local setup

Requirements: Node 22 (`nvm use 22`), a MongoDB Atlas cluster (or any MongoDB with `VECTOR_SEARCH_MODE=memory`),
an Anthropic API key (generation) and a Gemini API key (embeddings), or `AI_MOCK=true` to run without either.

```bash
npm run install:all
cp server/.env.example server/.env    # fill MONGODB_URI (with /proofchain), JWT_SECRET, ANTHROPIC_API_KEY, GEMINI_API_KEY, CONTACT_EMAIL
cp client/.env.example client/.env    # VITE_API_URL=http://localhost:4000
npm --prefix server run db:indexes    # once: model indexes + the Atlas Vector Search index
npm run dev                           # API on :4000, web on :5173
```

Useful checks: `AI_MOCK=false npm --prefix server run ai:ping` (Claude + Gemini embeddings), `npm --prefix server run scholarly:ping`
(scholarly APIs), `ALLOW_SEED=true npm --prefix server run seed:demo` (demo account and project).

## Testing

```bash
npm test                  # server: Vitest + Supertest + in-memory MongoDB; AI is mocked, external APIs are blocked
npm run build:client      # client production build
API_URL=… WEB_URL=… npm run smoke   # against a deployment
```

Tests never call real external APIs (`AI_MOCK=true`, `VECTOR_SEARCH_MODE=memory`, and a fetch guard). GitHub
Actions runs both on every push and pull request (`.github/workflows/ci.yml`).

## Deployment

See [`docs/deployment.md`](docs/deployment.md): Atlas, API keys, Render (Blueprint from `render.yaml`), Vercel
(root `client`), CORS, indexes, the demo account and the release checklist.

## Environment variables

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
| `AI_MOCK` | no | false | `true` = no AI calls (tests/dev) |
| `AI_PROVIDER` | no | anthropic | Text generation: `anthropic` (Claude) or `gemini` |
| `ANTHROPIC_API_KEY` | yes unless mock or `AI_PROVIDER=gemini` | — | Anthropic API key |
| `ANTHROPIC_MODEL` | no | claude-sonnet-5-5 | Claude model for generation |
| `ANTHROPIC_EFFORT` | no | medium | `low`…`max`: how much Claude thinks (speed/cost vs. depth) |
| `GEMINI_API_KEY` | yes unless mock | — | Google AI Studio key (embeddings; generation too if `AI_PROVIDER=gemini`) |
| `GEMINI_MODEL` | no | gemini-3.8-flash | Generation model when `AI_PROVIDER=gemini` |
| `GEMINI_EMBED_MODEL` | no | gemini-embedding-001 | Embedding model |
| `EMBED_DIM` | no | 768 | Must match the Atlas vector index |
| `AI_CONCURRENCY` | no | 2 | Parallel AI calls |
| `VECTOR_SEARCH_MODE` | no | atlas | `memory` for tests |
| `VECTOR_INDEX_NAME` | no | passage_vector_index | Atlas index name |
| `S2_API_KEY` | recommended | — | Semantic Scholar key |
| `CONTACT_EMAIL` | yes (prod) | — | OpenAlex/Crossref polite pool, Unpaywall |
| `MAX_UPLOAD_MB` | no | 15 | PDF upload limit |
| `AUTO_RECOMMEND` | no | true | Run the onboarding batch after a project's first source is ready |
| `ALLOW_SEED` | no | — | Must be `true` to run `seed:demo` |

### Client (`client/.env`, Vercel dashboard)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_URL` | **yes** | API origin without a trailing slash, e.g. `https://proofchain-api-quf3.onrender.com` |

## Known limitations

- **Stance is a model judgement.** The model's stance labels can be wrong or miss nuance (scope, conditions). That is
  why claim status counts only human-confirmed evidence and every AI link is marked as a suggestion.
- **Coverage of recommendations** is limited to what Semantic Scholar and OpenAlex index; papers that can't be
  verified in a second index are dropped rather than shown. Without `S2_API_KEY`, Semantic Scholar rate-limits
  heavily and the recommender falls back to OpenAlex.
- **Paywalled and scanned documents**: only open-access full text is ingested (otherwise the abstract only), and
  scanned PDFs have no extractable text (no OCR).
- **Free-tier hosting**: Render sleeps when idle (first request ~60 s), AI providers rate-limit bursts (tune `AI_CONCURRENCY`), and
  the API is a single instance (in-memory jobs and socket rooms; interrupted jobs resume at boot).
- **Quote matching** tolerates small differences (≥ 0.92 similarity), so a near match is labelled as such rather
  than claimed as exact.
- **Recommendations are per user**: each member gets their own batches and interest profile.

