import { useState } from "react";
import { Link } from "react-router";
import clsx from "clsx";
import { SLOT, VERIFIED_LABEL, FEEDBACK_LABEL, formatAuthors } from "../../lib/recommendations.js";
import { GAP_LABEL } from "../../lib/evidence.js";

const GAP_TYPE_LABEL = { ...GAP_LABEL, contradicts: "may contradict", qualifies: "may qualify" };

/** One recommended paper, laid out like the design doc's card table. */
export default function PaperCard({ projectId, item, canAct, pending, onAction }) {
  const [showQuote, setShowQuote] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const { paper } = item;
  const slot = SLOT[item.slot];
  const done = item.feedback?.action;
  const link = paper.url ?? (paper.ids?.doi ? `https://doi.org/${paper.ids.doi}` : null);

  return (
    <article className={clsx("rounded-xl border border-line bg-white p-3 shadow-sm", pending && "opacity-60")}>
      <div className="flex items-center gap-2">
        <span className={clsx("rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide", slot.className)}>{slot.label}</span>
        {done && <span className="text-xs text-teal">{FEEDBACK_LABEL[done]}</span>}
      </div>

      <h3 className="mt-2 text-sm font-semibold leading-snug text-ink">
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {paper.title}
          </a>
        ) : (
          paper.title
        )}
      </h3>
      <p className="mt-0.5 text-xs text-muted">
        {[formatAuthors(paper.authors), paper.venue, paper.year].filter(Boolean).join(" · ")}
      </p>
      {item.slotNote && <p className="mt-1 text-xs italic text-muted">{item.slotNote}</p>}

      <p className="mt-2 text-sm text-ink">
        <span className="font-medium">Why this paper: </span>
        {item.rationale}
      </p>
      <button type="button" className="mt-1 text-xs text-supports hover:underline" onClick={() => setShowQuote((s) => !s)} aria-expanded={showQuote}>
        ✓ Explanation found in abstract {showQuote ? "▴" : "▾"}
      </button>
      {showQuote && <blockquote className="mt-1 border-l-2 border-supports/40 pl-2 text-xs text-ink">“{item.rationaleQuote}”</blockquote>}

      {item.gapTargets?.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
          <span className="text-muted">Fills gap:</span>
          {item.gapTargets.map((g) => (
            <Link
              key={`${g.humanId}-${g.gapType}`}
              to={`/projects/${projectId}/claims/${g.claimId}`}
              className="rounded-full border border-inconclusive/40 px-2 py-0.5 text-inconclusive hover:bg-inconclusive/10"
            >
              {g.humanId} · {GAP_TYPE_LABEL[g.gapType] ?? g.gapType}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>{paper.oaPdfUrl ? "Open-access PDF — full text will be ingested" : "Abstract only"}</span>
        <span className="text-supports" title="Found independently in these indexes with matching metadata">
          {(item.verifiedIds ?? []).map((id) => `${VERIFIED_LABEL[id] ?? id} ✓`).join("  ")}
        </span>
      </div>

      {canAct && !rejecting && (
        <div className="mt-3 flex flex-wrap gap-1">
          <button type="button" className="btn-primary px-2 py-1 text-xs" disabled={pending || done === "added"} onClick={() => onAction({ action: "added" })}>
            {done === "added" ? "Added" : "Add to project"}
          </button>
          <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => setRejecting(true)}>
            Not relevant
          </button>
          <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={pending || done === "read"} onClick={() => onAction({ action: "read" })}>
            Already read
          </button>
          <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={pending || done === "later"} onClick={() => onAction({ action: "later" })}>
            Save for later
          </button>
        </div>
      )}
      {rejecting && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            setRejecting(false);
            onAction({ action: "not_relevant", ...(reason.trim() && { reason: reason.trim() }) });
          }}
        >
          <input
            className="input text-xs"
            placeholder="Why? e.g. “not interested in RDF/SPARQL” (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            autoFocus
            aria-label="Reason"
          />
          <p className="text-xs text-muted">A reason helps filter similar papers out of future batches.</p>
          <div className="flex justify-end gap-1">
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setRejecting(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary px-2 py-1 text-xs">
              Not relevant
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
