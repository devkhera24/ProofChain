import request from "supertest";
import mongoose from "mongoose";
import { drain } from "../../src/jobs/runner.js";
import { Source } from "../../src/models/Source.js";
import { Passage } from "../../src/models/Passage.js";
import { Claim } from "../../src/models/Claim.js";
import { EvidenceLink } from "../../src/models/EvidenceLink.js";
import { nextHumanId } from "../../src/utils/ids.js";

/**
 * A project with one claim (C1) and one AI-suggested link (L-1) on a passage (P-1). Text is generated, not real.
 * IDs come from the project counter, so records created later through the API get the next numbers.
 */
export async function projectWithLink(app, owner) {
  const { body } = await request(app).post("/api/projects").set(owner.auth).send({ name: "Realtime" });
  await drain();
  const projectId = new mongoose.Types.ObjectId(body.project.id);
  const source = await Source.create({ projectId, addedBy: owner.user.id, kind: "url", title: "Fixture source", sourceType: "unknown", status: "ready" });
  const passage = await Passage.create({ projectId, sourceId: source._id, humanId: await nextHumanId(projectId, "passage"), text: "Generated passage one.", charStart: 0, charEnd: 22 });
  const claim = await Claim.create({ projectId, humanId: await nextHumanId(projectId, "claim"), text: "Fixture claim one", origin: "user" });
  const link = await EvidenceLink.create({ projectId, humanId: await nextHumanId(projectId, "link"), claimId: claim._id, passageId: passage._id, sourceId: source._id, stance: "supports", status: "ai_suggested", quote: "Generated passage one." });
  return { projectId: String(projectId), claim, link, base: `/api/projects/${projectId}` };
}
