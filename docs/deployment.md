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

## Notes
- Every push to main redeploys both services.
- Env vars changed in Vercel need a redeploy to take effect (they're baked into the build).
- After adding new env vars in later steps, update them in the Render dashboard too.
