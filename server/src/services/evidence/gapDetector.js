import { Claim } from "../../models/Claim.js";
import { EvidenceLink } from "../../models/EvidenceLink.js";

const STALE_YEARS = 8;
const WEAK_SOURCE_TYPES = new Set(["vendor", "blog"]);

/**
 * Gap rules from the design document's gap table. Pure.
 * @param {object} claim                         { text }
 * @param {Array} links                          non-rejected links with { stance, status, source: { _id, sourceType, depth, year } }
 * @param {number} currentYear
 * @returns {Array<{type, weight, queryHint, detectedAt}>}
 */
export function detectGaps(claim, links, currentYear = new Date().getFullYear()) {
  links = links.filter((l) => l.source); // a link whose source was deleted isn't evidence
  const gaps = [];
  const supports = links.filter((l) => l.stance === "supports");
  const contradicts = links.filter((l) => l.stance === "contradicts");
  const confirmed = (arr) => arr.filter((l) => l.status === "confirmed");
  const distinctSources = (arr) => new Set(arr.map((l) => String(l.source._id))).size;
  const add = (type, weight, hint) => gaps.push({ type, weight, queryHint: `${claim.text} ${hint}`.trim(), detectedAt: new Date() });

  if (supports.length && distinctSources(supports) === 1) add("single_source", 0.8, "independent study");
  if (supports.length && supports.every((l) => WEAK_SOURCE_TYPES.has(l.source.sourceType)))
    add("interested_party_only", 0.9, "independent benchmark peer-reviewed evaluation");
  if (supports.length && !contradicts.length && !links.some((l) => l.stance === "inconclusive"))
    add("unchallenged", 0.6, "limitations criticism negative results");
  const years = supports.map((l) => l.source.year).filter(Boolean);
  if (years.length && currentYear - Math.max(...years) > STALE_YEARS) add("stale", 0.5, "recent evaluation");
  if (supports.length && supports.every((l) => l.source.depth === "abstract_only")) add("abstract_only", 0.4, "");
  if (confirmed(supports).length && confirmed(contradicts).length) add("contested", 0.85, "survey comparison why results differ");
  return gaps;
}

export async function refreshGaps(claimId) {
  const claim = await Claim.findById(claimId);
  if (!claim) return [];
  const links = await EvidenceLink.find({ claimId, status: { $ne: "rejected" } })
    .populate("sourceId", "sourceType depth year")
    .lean();
  const gaps = detectGaps(
    claim,
    links.map((l) => ({ ...l, source: l.sourceId })),
  );
  claim.gaps = gaps;
  await claim.save();
  return gaps;
}
