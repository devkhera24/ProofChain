import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { useTestDb } from "../helpers/db.js";
import { User } from "../../src/models/User.js";
import { Source } from "../../src/models/Source.js";
import { Passage } from "../../src/models/Passage.js";
import { Claim } from "../../src/models/Claim.js";
import { EvidenceLink } from "../../src/models/EvidenceLink.js";
import { InterestProfile } from "../../src/models/InterestProfile.js";
import { RecommendationBatch } from "../../src/models/RecommendationBatch.js";
import { Feedback } from "../../src/models/Feedback.js";
import { AuditEvent } from "../../src/models/AuditEvent.js";
import { Comment } from "../../src/models/Comment.js";
import { ChatMessage } from "../../src/models/ChatMessage.js";

const oid = () => new mongoose.Types.ObjectId();
const errorPaths = (doc) => Object.keys(doc.validateSync()?.errors ?? {}).sort();

describe("domain models", () => {
  useTestDb();

  it("enforce required fields", () => {
    expect(errorPaths(new Source({}))).toEqual(["addedBy", "kind", "projectId"]);
    expect(errorPaths(new Passage({}))).toEqual(["charEnd", "charStart", "humanId", "projectId", "sourceId", "text"]);
    expect(errorPaths(new Claim({}))).toEqual(["humanId", "origin", "projectId", "text"]);
    expect(errorPaths(new EvidenceLink({}))).toEqual(["claimId", "passageId", "projectId", "sourceId", "stance"]);
    expect(errorPaths(new InterestProfile({}))).toEqual(["projectId", "userId"]);
    expect(errorPaths(new RecommendationBatch({}))).toEqual(["projectId", "trigger", "userId"]);
    expect(errorPaths(new Feedback({}))).toEqual(["action", "paperKey", "projectId", "userId"]);
    expect(errorPaths(new AuditEvent({}))).toEqual(["action", "actor", "projectId"]);
    expect(errorPaths(new Comment({}))).toEqual(["authorId", "projectId", "text"]);
    expect(errorPaths(new ChatMessage({}))).toEqual(["content", "projectId", "role"]);
  });

  it("enforce enums and limits", () => {
    const base = { projectId: oid(), claimId: oid(), passageId: oid(), sourceId: oid() };
    expect(errorPaths(new EvidenceLink({ ...base, stance: "agrees" }))).toEqual(["stance"]);
    expect(errorPaths(new EvidenceLink({ ...base, stance: "supports", status: "maybe" }))).toEqual(["status"]);
    expect(errorPaths(new Claim({ projectId: oid(), humanId: "C1", origin: "user", text: "x".repeat(501) }))).toEqual(["text"]);
  });

  it("toJSON exposes id and strips _id, __v and embeddings", async () => {
    const claim = await Claim.create({
      projectId: oid(),
      humanId: "C1",
      text: "Sleep improves memory consolidation",
      origin: "user",
      embedding: [0.1, 0.2, 0.3],
    });
    const json = claim.toJSON();
    expect(json.id).toBe(claim._id.toString());
    expect(json).not.toHaveProperty("_id");
    expect(json).not.toHaveProperty("__v");
    expect(json).not.toHaveProperty("embedding");

    const reloaded = await Claim.findById(claim._id).select("+embedding");
    expect(reloaded.embedding).toHaveLength(3); // stored, just never serialised
    expect(reloaded.toJSON()).not.toHaveProperty("embedding");
  });

  it("User toJSON never includes the password hash, even when selected", async () => {
    await User.create({ name: "A", email: "a@test.dev", passwordHash: "hash" });
    const user = await User.findOne({ email: "a@test.dev" }).select("+passwordHash");
    expect(user.passwordHash).toBe("hash");
    expect(user.toJSON()).not.toHaveProperty("passwordHash");
  });

  it("the unique (claimId, passageId) index rejects duplicate links", async () => {
    await EvidenceLink.init();
    const link = { projectId: oid(), claimId: oid(), passageId: oid(), sourceId: oid(), stance: "supports" };
    await EvidenceLink.create(link);
    await expect(EvidenceLink.create({ ...link, stance: "contradicts" })).rejects.toMatchObject({ code: 11000 });
  });

  it("the source textHash index only applies when a hash is set", async () => {
    await Source.init();
    const projectId = oid();
    const base = { projectId, addedBy: oid(), kind: "url" };
    await Source.create([{ ...base }, { ...base }]); // no textHash yet → no conflict
    await Source.create({ ...base, textHash: "abc" });
    await expect(Source.create({ ...base, textHash: "abc" })).rejects.toMatchObject({ code: 11000 });
  });
});
