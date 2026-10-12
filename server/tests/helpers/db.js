import mongoose from "mongoose";
import { beforeAll, afterAll, afterEach } from "vitest";
import { drain } from "../../src/jobs/runner.js";

export function useTestDb() {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
  });
  afterEach(async () => {
    await drain(); // background jobs must not write into the next test's data
    const { collections } = mongoose.connection;
    await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  });
  afterAll(async () => {
    await drain();
    await mongoose.disconnect();
  });
}
