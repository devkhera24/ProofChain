# Decision log

| Date | Decision | Reason |
|---|---|---|
| (step 1) | Express 5, bcryptjs, pdfjs-dist, TanStack Query, Tailwind v4 | See guide.md §0.6 |
| (step 1) | Bearer JWT instead of cookies | Client and API are on different domains |
| (step 1) | One Atlas vector index (passages); claims/papers compared in memory | Free tier search-index limit |
| 2026-10-11 (step 2) | Pinned Mongoose to v8 (npm defaulted to v9) | Guide §0.6 pre-approves Mongoose 8; v9 has breaking middleware changes |
| 2026-10-11 (step 2) | Zod v4 installed; guide snippets work unchanged | `z.string().email()` is deprecated in v4 but still supported |
