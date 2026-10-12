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
| 2026-10-12 (step 16) | `drain()` loops until no jobs are running | Jobs can enqueue follow-up jobs (Step 19+); a single `Promise.all` snapshot would miss them |
| 2026-10-12 (step 16) | Source JSON never includes `rawPages` | The upload response otherwise echoed the whole extracted PDF text back to the client |
| 2026-10-12 (step 16) | Ingestion checks the source still exists before writing passages, and doesn't resurrect it on failure | Deleting a source mid-ingestion would otherwise leave orphaned passages or recreate the source |
| 2026-10-12 (step 16) | Audit events also for `source.added` and `source.retried` (guide asks for PATCH and DELETE) | Complete provenance trail; cheap |
| 2026-10-12 (step 16) | Interrupted jobs resume after `server.listen`, not before | Render's health check shouldn't wait on the resume query |
| 2026-10-12 (step 17) | Client loads passages in pages of 200 until `total` (`sourcesApi.allPassages`) instead of one `limit: 500` request | The server caps `limit` at 200 (Step 16), so the guide's request would 400; real sources exceed 200 passages (Wikipedia page: 358) |
| 2026-10-12 (step 17) | Source text is rendered in one `whitespace-pre-wrap` block of segments; page starts are extra segment cuts with a "p.N" marker | Splitting segments on `"\n\n"` into `<p>` breaks segments that span a paragraph break; pre-wrap shows paragraphs without splitting |
| 2026-10-12 (step 17) | Source list also has "Remove" (with confirm) for editors | The DELETE route exists (Step 16) and users need a way to undo a wrong source |
| 2026-10-12 (step 18) | `matchQuote` strips wrapping quote marks/ellipses *after* normalising (the guide stripped before) | Curly quotes around an AI quote (e.g. “…”) weren't stripped, so verbatim quotes fell through to near-match instead of exact |
| 2026-10-12 (step 18) | Near matches are extended to the end of the word | The best window can end mid-word; the UI must never show half a word as "the quote" |
| 2026-10-12 (step 18) | Matching also unifies primes (′ ″) like `normalizeText` does | Keeps quote normalisation consistent with the canonical source text |
| 2026-10-12 (step 18) | `lastName` handles "Last, First" (takes the part before the comma) | Otherwise "Smith, J." → "j" and same-paper records fail L2 with author_mismatch |
| 2026-10-12 (step 19) | In mock mode, `generateJson` also runs `check()` on the mock output | Mocks are held to the same semantic checks as real output, so tests catch invalid IDs instead of crashing later |
| 2026-10-12 (step 19) | When extraction finds a near-duplicate of an existing claim, the new passage is still linked to that claim | The second source is new evidence for the same claim; dropping it would lose provenance |
| 2026-10-12 (step 19) | `POST /claims` returns 201 for a new claim and 200 with `merged: true` for a near-duplicate | Lets the client tell the user "this claim already exists as C2" |
| 2026-10-12 (step 19) | `GET /claims/:id` returns links with `passage` and `source` objects (populated) instead of raw `passageId`/`sourceId` | Clearer client shape; the evidence panel needs passage text, page and source title/type |
| 2026-10-12 (step 20) | The linker looks up existing links first: refreshes `ai_suggested` ones, skips reviewed ones, and only draws a new `L-` ID when creating a link | The guide's upsert drew an ID on every run (gaps in L-numbers) and relied on a duplicate-key error to protect reviewed links |
| 2026-10-12 (step 20) | Source-scoped re-linking jobs use their own job key (`link:<claim>:<source>`) | Otherwise a running full linking job for the same claim would swallow the new-source job, and the new passages might be missed |
| 2026-10-12 (step 20) | Editing only stance/scope of an `ai_suggested` link moves it to `under_review` | The linker refreshes `ai_suggested` links, so a human's stance edit would be overwritten on the next run |
| 2026-10-12 (step 20) | Editing a claim's text re-runs linking; extraction recomputes claim status for created/merged claims | New wording needs new evidence; extracted claims start with an AI link, so `provisionalStatus` must reflect it |
| 2026-10-12 (step 20) | Manual links require the quote to pass L4 (422 otherwise) and are rejected with 409 if the claim–passage pair is already linked | Humans are held to the same "real quote" rule; the existing link should be reviewed instead |
| 2026-10-12 (step 20) | A missing review reason returns 400 with `details: { field: "reason", why }` | The client can show the error under the reason field |
