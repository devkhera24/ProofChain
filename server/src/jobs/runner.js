import pLimit from "p-limit";
import { logger } from "../utils/logger.js";

const limit = pLimit(2);
const running = new Map(); // key → promise, prevents duplicate jobs for the same key

/** Fire-and-forget. `key` dedupes (e.g. `ingest:<sourceId>`). Errors are logged, never thrown. */
export function enqueue(key, fn) {
  if (running.has(key)) return running.get(key);
  const p = limit(async () => {
    const started = Date.now();
    try {
      await fn();
      logger.info({ key, ms: Date.now() - started }, "job done");
    } catch (err) {
      logger.error({ err, key }, "job failed");
    } finally {
      running.delete(key);
    }
  });
  running.set(key, p);
  return p;
}

export const isRunning = (key) => running.has(key);
/** For tests: wait until all jobs have finished (including jobs enqueued by jobs). */
export async function drain() {
  while (running.size) await Promise.all([...running.values()]);
}
