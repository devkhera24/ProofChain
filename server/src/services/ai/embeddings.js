import crypto from "node:crypto";
import { env } from "../../config/env.js";
import { callAi } from "./common.js";
import { getClient, GEMINI_EMBED_INFO } from "./gemini.js";
import { normalize } from "../../utils/vectors.js";

// Small requests: one big batch can exceed a free-tier tokens-per-minute limit on its own
const BATCH = 20;
const BATCH_CHARS = 24_000; // ≈ 6k tokens

/** Deterministic pseudo-embedding for tests: same text → same vector; shared words → similar vectors. */
function mockEmbed(text) {
  const v = new Array(env.EMBED_DIM).fill(0);
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    const h = crypto.createHash("md5").update(word).digest();
    for (let k = 0; k < 4; k++) v[h.readUInt16BE(k * 2) % env.EMBED_DIM] += 1;
  }
  return normalize(v);
}

/** Split texts into requests of at most BATCH texts and about BATCH_CHARS characters (a long text goes alone). */
export function batchTexts(texts, { max = BATCH, maxChars = BATCH_CHARS } = {}) {
  const batches = [];
  let current = [];
  let chars = 0;
  for (const t of texts) {
    if (current.length && (current.length >= max || chars + t.length > maxChars)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(t);
    chars += t.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

/**
 * @param {string[]} texts
 * @param {"RETRIEVAL_DOCUMENT"|"RETRIEVAL_QUERY"|"SEMANTIC_SIMILARITY"} taskType
 * @returns {Promise<number[][]>} unit-length vectors
 */
export async function embedTexts(texts, taskType = "RETRIEVAL_DOCUMENT") {
  if (!texts.length) return [];
  if (env.AI_MOCK) return texts.map(mockEmbed);

  const out = [];
  for (const chunk of batchTexts(texts.map((t) => t.slice(0, 8000)))) {
    const res = await callAi(
      `embed.${taskType}`,
      () =>
        getClient().models.embedContent({
          model: env.GEMINI_EMBED_MODEL,
          contents: chunk,
          config: { taskType, outputDimensionality: env.EMBED_DIM },
        }),
      GEMINI_EMBED_INFO,
    );
    // Reduced-dimension Gemini embeddings are not unit-length: normalise them.
    out.push(...res.embeddings.map((e) => normalize(e.values)));
  }
  return out;
}

export const embedOne = async (text, taskType) => (await embedTexts([text], taskType))[0];
