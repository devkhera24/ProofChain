import { Counter } from "../models/Counter.js";

const PREFIX = { passage: "P-", claim: "C", link: "L-", batch: "B" };

/** Reserve `count` sequential human IDs for a project, e.g. ["P-13","P-14"]. Atomic. */
export async function reserveHumanIds(projectId, kind, count = 1) {
  const doc = await Counter.findOneAndUpdate(
    { _id: `${projectId}:${kind}` },
    { $inc: { seq: count } },
    { upsert: true, new: true },
  );
  const first = doc.seq - count + 1;
  return Array.from({ length: count }, (_, i) => `${PREFIX[kind]}${first + i}`);
}
export const nextHumanId = async (projectId, kind) => (await reserveHumanIds(projectId, kind, 1))[0];
