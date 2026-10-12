# Decision log

| Date | Decision | Reason |
|---|---|---|
| (step 1) | Express 5, bcryptjs, pdfjs-dist, TanStack Query, Tailwind v4 | See guide.md §0.6 |
| (step 1) | Bearer JWT instead of cookies | Client and API are on different domains |
| (step 1) | One Atlas vector index (passages); claims/papers compared in memory | Free tier search-index limit |
| 2026-10-11 (step 2) | Pinned Mongoose to v8 (npm defaulted to v9) | Guide §0.6 pre-approves Mongoose 8; v9 has breaking middleware changes |
| 2026-10-11 (step 2) | Zod v4 installed; guide snippets work unchanged | `z.string().email()` is deprecated in v4 but still supported |
| 2026-10-11 (step 4) | Pinned React Router to v7 (npm defaulted to v8) | Guide §0.6 pre-approves React Router v7 |
| 2026-10-11 (step 4) | Component classes (`card`, `btn`, `input`…) declared with `@utility` instead of `@layer components` | Tailwind v4 can't `@apply` a class defined in `@layer components` (`btn-primary` applies `btn`) |
| 2026-10-12 (step 7) | `aiLimiter` key falls back to `ipKeyGenerator(req.ip)` instead of raw `req.ip` | express-rate-limit v8 rejects custom key generators that return raw IPs (IPv6 users could bypass the limit by rotating addresses); the helper groups IPv6 by subnet |
| 2026-10-12 (step 8) | Auth token stored in `localStorage` | Simple across the Vercel/Render domains; XSS exposure is limited by never rendering user HTML (`dangerouslySetInnerHTML` is banned) |
| 2026-10-12 (step 8) | Startup `/auth/me` only logs out on 401, not on any error | Guide used `.catch(logout)`; a cold-start timeout or network error would otherwise wipe a valid token |
| 2026-10-12 (step 8) | Login/register pages redirect to the app if already logged in | Avoids showing the form to a signed-in user |
| 2026-10-12 (step 11) | `toJSONPlugin` takes a `hide` option; `User` uses `hide: ["passwordHash"]`, `Project` also uses the plugin | Login selects `+passwordHash`, so the plugin alone would leak the hash in the response |
| 2026-10-12 (step 11) | `auditHistory` returns documents (no `.lean()`) and sorts by `{ at: -1, _id: -1 }` | So the API sends `id` instead of `_id` like every other model; `_id` makes same-millisecond events order deterministically |
| 2026-10-12 (step 11) | Audit route accepts `limit` (1–500, default 100) and is mounted inside the projects router | Avoids running `requireAuth` twice for nested project routes |
