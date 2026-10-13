import { AsyncLocalStorage } from "node:async_hooks";

/** Set while a background job runs (ingestion, linking, profiles, recommendations). */
export const jobContext = new AsyncLocalStorage();

/** True inside a background job: nobody is waiting on screen, so slow retries are fine. */
export const inBackgroundJob = () => jobContext.getStore() !== undefined;
