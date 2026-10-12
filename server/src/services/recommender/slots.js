import { cosine } from "../../utils/vectors.js";

export const SLOT_ORDER = ["CHALLENGER", "FOUNDATION", "FRONTIER", "CORE", "CORE_2"]; // fill strict slots first
export const DISPLAY_ORDER = ["CORE", "CORE_2", "FOUNDATION", "FRONTIER", "CHALLENGER"];
const LAMBDA = 0.7;
const FALLBACK_NOTE = {
  FOUNDATION: "No strong older work found; showing another core paper.",
  FRONTIER: "No strong recent work found; showing another core paper.",
  CHALLENGER: "No paper challenging your claims was found; showing another core paper.",
};

export function eligible(slot, p, ctx) {
  const { currentYear, challengerKeys } = ctx;
  switch (slot) {
    case "FOUNDATION":
      return Boolean(p.year && p.year <= currentYear - 8 && p.scoreBreakdown.quality >= 0.5);
    case "FRONTIER":
      return Boolean(p.year && p.year >= currentYear - 2);
    case "CHALLENGER":
      return challengerKeys.has(p.key);
    default:
      return true;
  }
}

/** MMR pick from pool given already-selected papers. */
export function mmrPick(pool, selected) {
  let best = null,
    bestVal = -Infinity;
  for (const p of pool) {
    const maxSim = selected.length ? Math.max(...selected.map((s) => cosine(p.embedding, s.embedding))) : 0;
    const val = LAMBDA * p.score - (1 - LAMBDA) * maxSim;
    if (val > bestVal) {
      bestVal = val;
      best = p;
    }
  }
  return best;
}

/**
 * Fill ONE slot: eligible unused papers (falling back to any unused paper with a note), picked by MMR,
 * each checked with `accept(p)` (async; verification and/or grounding). Rejected papers are marked used.
 * `state` = { used: Set<key>, selected: Paper[], picks: { [slot]: { paper } } } and is updated in place.
 * @returns {{ paper, slotNote } | null}
 */
export async function fillSlot(slot, ranked, ctx, accept, state, { fallback = true } = {}) {
  const unused = () => ranked.filter((p) => !state.used.has(p.key));
  let pool = unused().filter((p) => eligible(slot, p, ctx));
  if (slot === "CORE_2" && state.picks.CORE) {
    const core = state.picks.CORE.paper;
    const coreAuthors = new Set(core.authors.slice(0, 3));
    const diff = pool.filter((p) => !p.authors.slice(0, 3).some((a) => coreAuthors.has(a)) && p.venue !== core.venue);
    if (diff.length) pool = diff;
  }
  // Phase 1: papers that fit the slot. Phase 2 (strict slots only): if none fits or none passes the
  // checks, any other paper — still verified and grounded — with a note saying why.
  const phases = [[pool, null]];
  if (fallback && FALLBACK_NOTE[slot]) phases.push([null, FALLBACK_NOTE[slot]]);
  for (const [candidates, slotNote] of phases) {
    let remaining = candidates ?? unused();
    while (remaining.length) {
      const p = mmrPick(remaining, state.selected);
      remaining = remaining.filter((x) => x !== p);
      if (state.used.has(p.key)) continue;
      state.used.add(p.key);
      if (await accept(p, slot)) {
        state.picks[slot] = { paper: p, slotNote };
        state.selected.push(p);
        return state.picks[slot];
      }
    }
  }
  return null;
}

/**
 * Assign papers to the five slots. Pass 1: every slot (strict ones first) takes only papers that fit it.
 * Pass 2: slots still empty take any other verified paper, with a note — so an early slot's fallback
 * can't steal the paper a later slot needed.
 */
export async function assignSlots(ranked, ctx, accept, state = { used: new Set(), selected: [], picks: {} }) {
  for (const slot of SLOT_ORDER) await fillSlot(slot, ranked, ctx, accept, state, { fallback: false });
  for (const slot of SLOT_ORDER) if (!state.picks[slot]) await fillSlot(slot, ranked, ctx, accept, state);
  return DISPLAY_ORDER.filter((s) => state.picks[s]).map((slot) => ({ slot, ...state.picks[slot] }));
}
