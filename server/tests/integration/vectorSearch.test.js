import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { useTestDb } from "../helpers/db.js";
import { Passage } from "../../src/models/Passage.js";
import { searchPassages } from "../../src/services/evidence/vectorSearch.js";

const oid = () => new mongoose.Types.ObjectId();

describe("searchPassages (memory mode)", () => {
  useTestDb();

  async function seed() {
    const projectId = oid();
    const [srcA, srcB] = [oid(), oid()];
    const passage = (humanId, sourceId, embedding) => ({
      projectId, sourceId, humanId, text: `passage ${humanId}`, charStart: 0, charEnd: 10, embedding,
    });
    await Passage.create([
      passage("P-1", srcA, [1, 0, 0]), // identical to the query
      passage("P-2", srcA, [1, 1, 0]), // 45°
      passage("P-3", srcB, [0, 0, 1]), // orthogonal
      passage("P-4", srcB, undefined), // not embedded yet
      { ...passage("P-1", srcA, [1, 0, 0]), projectId: oid() }, // another project
    ]);
    return { projectId, srcA, srcB };
  }

  it("ranks by similarity, scopes to the project and skips unembedded passages", async () => {
    const { projectId } = await seed();
    const hits = await searchPassages({ projectId, queryVector: [1, 0, 0] });
    expect(hits.map((h) => h.humanId)).toEqual(["P-1", "P-2", "P-3"]);
    expect(hits[0].score).toBeCloseTo(1);
    expect(hits[1].score).toBeCloseTo((1 + Math.SQRT1_2) / 2);
    expect(hits[2].score).toBeCloseTo(0.5);
    expect(hits[0]).not.toHaveProperty("embedding");
    expect(hits[0]).toMatchObject({ text: "passage P-1", charStart: 0, charEnd: 10 });
  });

  it("respects limit and sourceIds (as strings or ObjectIds)", async () => {
    const { projectId, srcB } = await seed();
    expect(await searchPassages({ projectId, queryVector: [1, 0, 0], limit: 1 })).toHaveLength(1);
    const scoped = await searchPassages({ projectId: String(projectId), queryVector: [1, 0, 0], sourceIds: [String(srcB)] });
    expect(scoped.map((h) => h.humanId)).toEqual(["P-3"]);
  });
});
