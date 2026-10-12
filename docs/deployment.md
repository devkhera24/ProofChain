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

## 6. Database indexes and the Vector Search index
Run once after the first deploy, and again whenever models change (safe to re-run):

```bash
npm --prefix server run db:indexes   # uses MONGODB_URI from server/.env — point it at Atlas
```

It syncs every model's indexes and requests the `passage_vector_index` Vector Search index. In Atlas →
your cluster → **Atlas Search** (or **Search & Vector Search**), wait until the index shows **READY** (~1 minute).

**Fallback (if the script can't create it):** Atlas Search → Create Search Index → **Vector Search** →
JSON Editor → database `proofchain`, collection `passages`, index name `passage_vector_index`, definition:

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "projectId" },
    { "type": "filter", "path": "sourceId" }
  ]
}
```

> If `EMBED_DIM` ever changes, drop and recreate this index and re-embed all passages.

## 7. Demo account (optional)
Creates `demo@proofchain.dev` and an empty "Seminar: Graph Databases" project. It never creates sources or papers:
the presenter adds real ones in the UI, and the script prints those steps.

```bash
ALLOW_SEED=true npm --prefix server run seed:demo                    # prints the password once
ALLOW_SEED=true npm --prefix server run seed:demo -- --reset-password  # issue a new password
```

Run it from your machine with `MONGODB_URI` pointing at Atlas; keep `ALLOW_SEED=false` on Render.

## 8. Continuous integration
`.github/workflows/ci.yml` runs the server tests (mock AI, in-memory vector search, in-memory MongoDB) and the
client build on every push to `main` and on pull requests. Optional: GitHub → Settings → Branches → add a
branch protection rule for `main` that requires the `server` and `client` checks to pass.

## 9. Release checklist
1. `npm test` and `npm run build:client` pass locally.
2. Push; check `/api/health` shows the new commit in `version`, and Vercel shows the same commit.
3. `API_URL=https://<service>.onrender.com WEB_URL=https://<your-app>.vercel.app npm run smoke`

## Notes
- Render web services support WebSockets; live updates use the same URL as the API (`VITE_API_URL`).
- The API runs as a single instance: background jobs and socket rooms live in memory. Interrupted ingestion
  resumes at boot; recommendation batches stuck for over 10 minutes are marked failed.
- Every push to main redeploys both services.
- Env vars changed in Vercel need a redeploy to take effect (they're baked into the build).
- After adding new env vars in later steps, update them in the Render dashboard too.
