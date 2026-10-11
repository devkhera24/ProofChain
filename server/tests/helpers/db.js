import mongoose from "mongoose";
import { beforeAll, afterAll, afterEach } from "vitest";

export function useTestDb() {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
  });
  afterEach(async () => {
    const { collections } = mongoose.connection;
    await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  });
  afterAll(async () => {
    await mongoose.disconnect();
  });
}
