export const STANCE = {
  supports: { label: "Supports", color: "text-supports", bg: "bg-supports/10", border: "border-supports", dot: "bg-supports", decoration: "decoration-supports" },
  contradicts: { label: "Contradicts", color: "text-contradicts", bg: "bg-contradicts/10", border: "border-contradicts", dot: "bg-contradicts", decoration: "decoration-contradicts" },
  inconclusive: { label: "Inconclusive", color: "text-inconclusive", bg: "bg-inconclusive/10", border: "border-inconclusive", dot: "bg-inconclusive", decoration: "decoration-inconclusive" },
};
export const STANCE_ORDER = ["supports", "contradicts", "inconclusive"];

export const LINK_STATUS = {
  ai_suggested: { label: "AI-suggested", dashed: true },
  under_review: { label: "Under review" },
  confirmed: { label: "Confirmed" },
  rejected: { label: "Rejected" },
  disputed: { label: "Disputed", color: "text-disputed" },
};

/** Mirrors the server's allowed review transitions (reviewService.js). */
export const TRANSITIONS = {
  ai_suggested: ["under_review", "confirmed", "rejected", "disputed"],
  under_review: ["confirmed", "rejected", "disputed"],
  confirmed: ["disputed", "rejected", "under_review"],
  rejected: ["under_review", "confirmed"],
  disputed: ["confirmed", "rejected", "under_review"],
};

export const CLAIM_STATUS = {
  open: "Open",
  supported: "Supported",
  contested: "Contested",
  unsupported: "Unsupported",
};
export const CLAIM_STATUS_STYLE = {
  open: "bg-black/5 text-muted",
  supported: "bg-supports/10 text-supports",
  contested: "bg-inconclusive/10 text-inconclusive",
  unsupported: "bg-contradicts/10 text-contradicts",
};

export const GAP_LABEL = {
  single_source: "Single source",
  interested_party_only: "Vendor-only support",
  unchallenged: "Unchallenged",
  stale: "Stale evidence",
  abstract_only: "Abstract-only",
  contested: "Contested",
};

export const NEEDS_REVIEW = ["ai_suggested", "disputed"];
