import { Claim } from "../../models/Claim.js";
import { EvidenceLink } from "../../models/EvidenceLink.js";

export function statusFrom(links) {
  const sup = links.some((l) => l.stance === "supports");
  const con = links.some((l) => l.stance === "contradicts");
  if (sup && con) return "contested";
  if (sup) return "supported";
  if (con) return "unsupported";
  return "open";
}

/** status ← CONFIRMED links only; provisionalStatus ← all links except rejected ones. */
export async function recomputeClaimStatus(claimId) {
  const links = await EvidenceLink.find({ claimId, status: { $ne: "rejected" } }).lean();
  const confirmed = links.filter((l) => l.status === "confirmed");
  await Claim.updateOne({ _id: claimId }, { status: statusFrom(confirmed), provisionalStatus: statusFrom(links) });
  // Step 23 adds: await refreshGaps(claimId)
}
