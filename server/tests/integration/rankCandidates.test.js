import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../../src/app.js";
import { useTestDb } from "../helpers/db.js";
import { registerAndLogin } from "../helpers/auth.js";
import { drain } from "../../src/jobs/runner.js";
import { Project } from "../../src/models/Project.js";
import { Source } from "../../src/models/Source.js";
import { Feedback } from "../../src/models/Feedback.js";
import { Claim } from "../../src/models/Claim.js";
import { rankCandidates } from "../../src/services/recommender/rank.js";
import { createPipelineLog } from "../../src/services/validation/pipelineLog.js";

// Made-up papers only. Abstracts are long enough to pass the no_abstract filter.
const abs = (topic) => `This fixture abstract describes a made-up study about ${topic}, written only for automated tests of ranking.`;
const fixture = (id, title, extra = {}) => ({
  ids: { s2Id: `s2-${id}`, doi: `10.5555/fixture.${id}` },
  title,
  authors: ["Ada Example"],
  year: 2023,
  venue: "Fixture Venue",
  abstract: abs(title.toLowerCase()),
  citationCount: 10,
  oaPdfUrl: null,
  url: null,
  providers: ["s2"],
  ...extra,
});
const S2 = [
  fixture("a", "Graph Database Query Performance"),
  fixture("b", "Graph Database Benchmarks Survey"),
  fixture("c", "Already Added Paper About Graph Databases"),
  fixture("d", "Rejected Paper About Graph Databases"),
  fixture("e", "No Abstract Paper", { abstract: null }),
];
const OA = [{ ...S2[0], ids: { openAlexId: "W1", doi: "10.5555/fixture.a" }, providers: ["openalex"], abstract: `${abs("graph database query performance")} Longer.` }];

const calls = vi.hoisted(() => ({ s2: [], oa: [], refs: [], cites: [] }));
vi.mock("../../src/services/scholarly/semanticScholar.js", async (orig) => ({
  ...(await orig()),
  searchS2: async (q) => (calls.s2.push(q), S2.map((p) => ({ ...p, ids: { ...p.ids } }))),
}));
vi.mock("../../src/services/scholarly/openAlex.js", async (orig) => ({
  ...(await orig()),
  searchOpenAlex: async (q) => (calls.oa.push(q), OA.map((p) => ({ ...p, ids: { ...p.ids } }))),
}));

// Snowballing must not reach the network either
vi.mock("../../src/services/scholarly/graph.js", () => ({
  getReferences: async (ids) => (calls.refs.push(ids), [fixture("r", "Snowballed Reference On Graph Storage", { providers: ["openalex"] })]),
  getCitations: async (ids) => (calls.cites.push(ids), []),
}));

const app = createApp();

describe("rankCandidates (pipeline A, AI mock)", () => {
  useTestDb();

  it("builds queries, fetches, dedupes, filters and scores", async () => {
    const owner = await registerAndLogin(app);
    const { body } = await request(app).post("/api/projects").set(owner.auth).send({ name: "Rank", topics: ["graph databases"] });
    await drain();
    const projectId = new mongoose.Types.ObjectId(body.project.id);
    const userId = new mongoose.Types.ObjectId(owner.user.id);
    await Source.create({ projectId, addedBy: userId, kind: "paper", title: "Already Added Paper About Graph Databases", ids: { doi: "10.5555/fixture.c" }, status: "ready" });
    await Feedback.create({ projectId, userId, paperKey: "doi:10.5555/fixture.d", action: "not_relevant" });
    await Claim.create({
      projectId, humanId: "C1", text: "Graph databases are faster for multi-hop queries", origin: "user",
      gaps: [{ type: "interested_party_only", weight: 0.9, queryHint: "Graph databases are faster independent benchmark" }],
    });

    const log = createPipelineLog("test");
    const project = await Project.findById(projectId);
    const { ranked, queries, ctx } = await rankCandidates({ project, userId, question: "how fast are graph database queries", log });

    expect(queries.map((q) => q.q)).toEqual(["graph databases", "graph databases survey", "Graph databases are faster independent"]);
    expect(queries[2]).toMatchObject({ purpose: "gap", gapClaimId: "C1" });
    expect(calls.s2).toHaveLength(3);
    expect(ranked.map((p) => p.title).sort()).toEqual([
      "Graph Database Benchmarks Survey",
      "Graph Database Query Performance",
      "Snowballed Reference On Graph Storage",
    ]);
    expect(calls.refs).toEqual([expect.objectContaining({ doi: "10.5555/fixture.c" })]); // seeded from the paper source
    const a = ranked.find((p) => p.title === "Graph Database Query Performance");
    expect(a.providers).toEqual(["s2", "openalex"]); // merged by DOI
    expect(a.key).toBe("doi:10.5555/fixture.a");
    expect(a.embedding).toHaveLength(768);
    expect(a.scoreBreakdown).toEqual(expect.objectContaining({ question: expect.any(Number), gap: expect.any(Number) }));
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    expect(ctx.questionVec).toHaveLength(768);
    expect(ctx.gaps[0]).toMatchObject({ claimHumanId: "C1", embedding: expect.any(Array) });

    const text = log.lines.join("\n");
    expect(text).toMatch(/already_in_project/);
    expect(text).toMatch(/marked_not_relevant/);
    expect(text).toMatch(/no_abstract/);
    expect(text).toMatch(/fetched raw=19 seeds=1/);
    expect(text).toMatch(/after_dedupe count=6/);
  });
});
