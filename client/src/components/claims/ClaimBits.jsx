import clsx from "clsx";
import { STANCE, STANCE_ORDER, CLAIM_STATUS, CLAIM_STATUS_STYLE, GAP_LABEL } from "../../lib/evidence.js";

/** Confirmed status is prominent; the provisional (AI-inclusive) status is shown muted when different. */
export function ClaimStatus({ claim }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", CLAIM_STATUS_STYLE[claim.status])}>
        {CLAIM_STATUS[claim.status]}
      </span>
      {claim.provisionalStatus && claim.provisionalStatus !== claim.status && (
        <span className="text-xs text-muted" title="Including AI suggestions that nobody has reviewed yet">
          provisionally {CLAIM_STATUS[claim.provisionalStatus].toLowerCase()}
        </span>
      )}
    </span>
  );
}

/** ●3 ●1 ●0 in stance colours (rejected links excluded by the caller's counts). */
export function StanceCounts({ byStance = {} }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      {STANCE_ORDER.map((s) => (
        <span key={s} className="inline-flex items-center gap-1" title={STANCE[s].label}>
          <span className={clsx("h-2 w-2 rounded-full", STANCE[s].dot)} />
          {byStance[s] ?? 0}
        </span>
      ))}
    </span>
  );
}

export function GapBadges({ gaps = [] }) {
  if (!gaps.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {gaps.map((g) => (
        <span key={g.type} className="rounded-full border border-inconclusive/40 px-2 py-0.5 text-xs text-inconclusive">
          {GAP_LABEL[g.type] ?? g.type}
        </span>
      ))}
    </span>
  );
}
