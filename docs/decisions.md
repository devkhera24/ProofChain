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
| 2026-10-12 (step 12) | Memory-mode vector search scores as `(1 + cosine) / 2` instead of raw cosine | Atlas reports cosine similarity on that 0–1 scale; matching it keeps any score threshold identical in tests and production |
| 2026-10-12 (step 12) | `db:indexes` catches search-index errors and prints guidance instead of crashing | Local MongoDB has no Atlas Search; the user needs a pointer to the UI fallback |
| 2026-10-12 (step 14) | The canonical text of a source is its normalised text; all passage offsets and highlights refer to it | We don't map back to the raw HTML/PDF layout (guide §14) |
| 2026-10-12 (step 14) | `normalizeText` strips trailing spaces before newlines, so a whitespace-only line (`"\n \n"`) still counts as a paragraph break | PDF/HTML extraction often produces such lines; without this, paragraphs were silently merged |
| 2026-10-12 (step 14) | `joinPages` adds no `"\n\n"` separator for empty pages (e.g. scanned images) | Avoids runs of blank paragraphs; `pageForOffset` still maps text to the right page |
| 2026-10-12 (step 14) | A sentence longer than `maxChars` is split at the last space before the limit (mid-word only when there is no space) | Guide §14.2 edge case: PDF tables flattened into one "sentence" |
| 2026-10-12 (step 15) | DNS rebinding between the SSRF lookup and the fetch is not fully prevented | Acceptable for this project's threat model (guide §15.2) |
| 2026-10-12 (step 15) | `isPrivateIp` also blocks hex IPv4-mapped IPv6 (`::ffff:7f00:1`), NAT64 (`64:ff9b::/96`), all of `fe80::/10`, `fec0::/10`, multicast `ff00::/8` and `198.18.0.0/15`; IP-literal hosts are checked without DNS | `new URL("http://[::ffff:127.0.0.1]/")` normalises to `::ffff:7f00:1`, which the guide's check let through to localhost |
| 2026-10-12 (step 15) | pdfjs-dist v6: `destroy()` is called on the loading task (in `finally`), not the document | The document proxy no longer has `destroy()` in v6 |
| 2026-10-12 (step 15) | PDF line/paragraph breaks don't stack: `hasEOL` plus the next line's vertical jump is one line break | The guide's version turned every PDF line into its own paragraph (`"\n" + "\n"`), so passages were single lines and quotes spanning lines could never match; on a 15-page arXiv paper passages went from 696 (median 59 chars) to 284 |
| 2026-10-12 (step 15) | jsdom 30 requires Node `^22.22.2` on the 22 line | Render's `NODE_VERSION=22` resolves to the latest 22.x, which satisfies it |
