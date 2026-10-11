process.env.NODE_ENV = "test";
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI ?? "mongodb://127.0.0.1:27017/proofchain-test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.AI_MOCK = "true";
process.env.VECTOR_SEARCH_MODE = "memory";
process.env.CORS_ORIGINS = "http://localhost:5173";
