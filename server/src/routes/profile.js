import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireProjectRole } from "../middleware/projectRole.js";
import { InterestProfile } from "../models/InterestProfile.js";
import { getProfileView, ensureProfile } from "../services/profile/profileService.js";
import { recordAudit } from "../services/audit/auditService.js";
import { notFoundError } from "../utils/errors.js";

// Mounted at /api/projects/:projectId/profile — always the caller's own profile
export const profileRouter = Router({ mergeParams: true });

const patchBody = z.union([
  z.object({ exclusion: z.object({ id: z.string(), strength: z.enum(["soft", "hard"]) }) }),
  z.object({ removeExclusion: z.string() }),
]);

profileRouter.get("/", requireProjectRole("viewer"), async (req, res) => {
  res.json({ profile: await getProfileView(req.project, req.user._id) });
});

profileRouter.patch("/", requireProjectRole("viewer"), validate({ body: patchBody }), async (req, res) => {
  await ensureProfile(req.project._id, req.user._id);
  const profile = await InterestProfile.findOne({ projectId: req.project._id, userId: req.user._id });
  const id = req.valid.body.exclusion?.id ?? req.valid.body.removeExclusion;
  const rule = profile.exclusions.id(id);
  if (!rule) throw notFoundError("Exclusion");

  let change;
  if (req.valid.body.removeExclusion) {
    change = { exclusion: [rule.concept, null] };
    rule.deleteOne();
  } else {
    change = { [`exclusion "${rule.concept}"`]: [rule.strength, req.valid.body.exclusion.strength] };
    rule.strength = req.valid.body.exclusion.strength;
  }
  await profile.save();
  await recordAudit({
    projectId: req.project._id,
    actor: req.user.id,
    actorName: req.user.name,
    action: "profile.exclusion",
    target: { kind: "profile", id: profile._id },
    change,
  });
  res.json({ profile: await getProfileView(req.project, req.user._id) });
});
