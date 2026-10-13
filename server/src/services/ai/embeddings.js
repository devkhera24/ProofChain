import crypto from "node:crypto";
import { env } from "../../config/env.js";
import { callAi } from "./common.js";
import { getClient, GEMINI_EMBED_INFO } from "./gemini.js";
import { normalize } from "../../utils/vectors.js";

const BATCH = 50;

/** Deterministic pseudo-embedding for tests: same text → same vector; shared words → similar vectors. */
function mockEmbed(text) {
  const v = new Array(env.EMBED_DIM).fill(0);
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    const h = crypto.createHash("md5").update(word).digest();
    for (let k = 0; k < 4; k++) v[h.readUInt16BE(k * 2) % env.EMBED_DIM] += 1;
  }
  return normalize(v);
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
  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH).map((t) => t.slice(0, 8000));
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
