import crypto from "node:crypto";
import { PaperCache } from "../../models/PaperCache.js";
import { logger } from "../../utils/logger.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_WAIT_MS = 30_000;

export class UpstreamError extends Error {
  constructor(provider, status, message) {
    super(message);
    this.provider = provider;
    this.status = status;
  }
}

/** GET JSON with retries on 429/5xx (respects Retry-After) and a Mongo-backed cache. 404 → null. */
export async function getJson(provider, url, { headers = {}, ttlHours = 24 * 7, retries = 3, parse = "json" } = {}) {
  const key = `${provider}:${crypto.createHash("sha1").update(url).digest("hex")}`;
  const cached = await PaperCache.findById(key).lean();
  if (cached) return cached.payload;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) }).catch((e) => ({ ok: false, status: 0, error: e }));
    if (res.ok) {
      const payload = parse === "text" ? await res.text() : await res.json();
      await PaperCache.updateOne(
        { _id: key },
        { payload, expiresAt: new Date(Date.now() + ttlHours * 3600_000) },
        { upsert: true },
      );
      return payload;
    }
    if (res.status === 404) return null;
    const retryable = res.status === 0 || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) throw new UpstreamError(provider, res.status, `${provider} request failed (${res.status})`);
    const retryAfter = Number(res.headers?.get?.("retry-after")) * 1000;
    const wait = Math.min(retryAfter || 1000 * 2 ** attempt + Math.random() * 300, MAX_WAIT_MS);
    logger.warn({ provider, status: res.status, wait }, "scholarly API retry");
    await sleep(wait);
  }
}
