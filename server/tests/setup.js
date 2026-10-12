process.env.NODE_ENV = "test";
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI ?? "mongodb://127.0.0.1:27017/proofchain-test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.AI_MOCK = "true";
process.env.VECTOR_SEARCH_MODE = "memory";
process.env.CORS_ORIGINS = "http://localhost:5173";
process.env.AUTO_RECOMMEND = "false"; // tests that need the onboarding batch call runRecommendation directly

// Tests never hit real external APIs (CLAUDE.md rule 5). Mock fetch (vi.spyOn / vi.mock) where a test needs it.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const { hostname } = new URL(typeof input === "string" ? input : input.url ?? String(input));
  if (["127.0.0.1", "localhost", "::1"].includes(hostname)) return realFetch(input, init);
  throw new Error(`Tests must not call external APIs (attempted: ${hostname})`);
};
