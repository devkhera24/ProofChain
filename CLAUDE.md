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
