import mongoose from "mongoose";
import { Passage } from "../../models/Passage.js";
import { env } from "../../config/env.js";
import { cosine } from "../../utils/vectors.js";

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/**
 * Top-k passages in a project most similar to queryVector.
 * Returns [{ _id, humanId, sourceId, text, page, paragraph, charStart, charEnd, score }]
 * `score` is in [0, 1] in both modes (Atlas reports cosine as (1 + cos) / 2).
 */
export async function searchPassages({ projectId, queryVector, limit = 25, sourceIds }) {
  if (env.VECTOR_SEARCH_MODE === "memory") return memorySearch({ projectId, queryVector, limit, sourceIds });

  const filter = { projectId: oid(projectId) };
  if (sourceIds?.length) filter.sourceId = { $in: sourceIds.map(oid) };

  return Passage.aggregate([
    {
      $vectorSearch: {
        index: env.VECTOR_INDEX_NAME,
        path: "embedding",
        queryVector,
        numCandidates: Math.max(limit * 10, 100),
        limit,
        filter,
      },
    },
    { $project: { embedding: 0, score: { $meta: "vectorSearchScore" } } },
  ]);
}

async function memorySearch({ projectId, queryVector, limit, sourceIds }) {
  const q = { projectId: oid(projectId) };
  if (sourceIds?.length) q.sourceId = { $in: sourceIds.map(oid) };
  const all = await Passage.find(q).select("+embedding").lean();
  return all
    .filter((p) => p.embedding?.length)
    .map(({ embedding, ...p }) => ({ ...p, score: (1 + cosine(queryVector, embedding)) / 2 })) // same scale as Atlas
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
