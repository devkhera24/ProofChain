import { useState } from "react";
import { Link } from "react-router";
import clsx from "clsx";
import { STANCE, LINK_STATUS, TRANSITIONS } from "../../lib/evidence.js";
import { SOURCE_TYPES } from "../../lib/sourceLabels.js";
import { useReviewLink } from "../../hooks/useReviewLink.js";
import { toApiError } from "../../api/client.js";
import ReasonDialog from "../common/ReasonDialog.jsx";

const ACTIONS = {
  confirm: { label: "✓ Confirm", to: "confirmed" },
  reject: { label: "✗ Reject", to: "rejected", reason: "Reject this evidence" },
  stance: { label: "⇄ Change stance", reason: "Change the stance" },
  dispute: { label: "⚑ Dispute", to: "disputed", reason: "Dispute this evidence" },
};

/** One piece of evidence: the real quote, where it comes from, how it was matched, and review actions. */
export default function LinkCard({ projectId, link, canReview, showClaim = false }) {
  const review = useReviewLink(projectId);
  const [dialog, setDialog] = useState(null); // key of ACTIONS
  const stance = STANCE[link.stance];
  const status = LINK_STATUS[link.status];
  const allowed = TRANSITIONS[link.status] ?? [];
  const passage = link.passage ?? {};
  const source = link.source ?? {};
  const run = (data) => review.mutateAsync({ linkId: link.id, ...data }).catch((err) => {
    throw new Error(toApiError(err).message);
  });

  return (
    <article
      className={clsx(
        "rounded-xl border-l-4 bg-white p-3 shadow-sm ring-1 ring-line",
        stance?.border,
        status?.dashed && "border-dashed",
        link.status === "rejected" && "opacity-60",
      )}
    >
      {showClaim && link.claim && (
        <p className="mb-2 text-sm">
          <Link to={`/projects/${projectId}/claims/${link.claim.id}`} className="font-medium text-navy hover:underline">
            {link.claim.humanId}
          </Link>{" "}
          <span className="text-ink">{link.claim.text}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className={clsx("rounded-full px-2 py-0.5 font-medium", stance?.bg, stance?.color)}>{stance?.label}</span>
        <span className={clsx("rounded-full bg-black/5 px-2 py-0.5", status?.color ?? "text-muted")}>{status?.label}</span>
        <span className="font-mono text-muted">{link.humanId}</span>
        <span className="text-muted">·</span>
        <span className="font-mono text-muted">{passage.humanId}</span>
        {passage.page && <span className="text-muted">p.{passage.page}</span>}
      </div>

      <blockquote className="mt-2 border-l-2 border-line pl-3 text-sm text-ink">“{link.quote}”</blockquote>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <span className="max-w-full truncate font-medium text-ink">{source.title}</span>
        {source.sourceType && <span className="rounded-full bg-black/5 px-2 py-0.5">{SOURCE_TYPES[source.sourceType]}</span>}
        {link.scope && <span className="rounded-full bg-navy/10 px-2 py-0.5 text-navy">Scope: {link.scope}</span>}
        <span>{link.matchType === "exact" ? "exact quote" : `near match ${link.matchScore?.toFixed(2)}`}</span>
        {link.origin === "user" && <span>· added by a person</span>}
      </div>
      {link.aiRationale && link.origin === "ai" && <p className="mt-1 text-xs italic text-muted">AI: {link.aiRationale}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Link
          to={`/projects/${projectId}/sources/${source.id}?passage=${passage.humanId}`}
          className="mr-auto text-xs text-teal hover:underline"
        >
          Open in source →
        </Link>
        {canReview && allowed.includes("confirmed") && (
          <button type="button" className="btn-ghost px-2 py-1 text-xs text-supports" disabled={review.isPending} onClick={() => run({ status: "confirmed" })}>
            {ACTIONS.confirm.label}
          </button>
        )}
        {canReview && allowed.includes("rejected") && (
          <button type="button" className="btn-ghost px-2 py-1 text-xs text-contradicts" onClick={() => setDialog("reject")}>
            {ACTIONS.reject.label}
          </button>
        )}
        {canReview && link.status !== "rejected" && (
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setDialog("stance")}>
            {ACTIONS.stance.label}
          </button>
        )}
        {canReview && allowed.includes("disputed") && (
          <button type="button" className="btn-ghost px-2 py-1 text-xs text-disputed" onClick={() => setDialog("dispute")}>
            {ACTIONS.dispute.label}
          </button>
        )}
      </div>
      {review.error && !dialog && <p className="mt-1 text-xs text-red-700">{toApiError(review.error).message}</p>}

      {dialog && (
        <ReasonDialog
          title={`${ACTIONS[dialog].reason} (${link.humanId})`}
          description={dialog === "stance" ? "The AI's label is kept in the history." : "Your reason is saved in the audit history."}
          confirmLabel={ACTIONS[dialog].label.replace(/^\S+ /, "")}
          withStance={dialog === "stance"}
          currentStance={link.stance}
          onSubmit={({ reason, stance: newStance }) => run(dialog === "stance" ? { stance: newStance, reason } : { status: ACTIONS[dialog].to, reason })}
          onClose={() => setDialog(null)}
        />
      )}
    </article>
  );
}
