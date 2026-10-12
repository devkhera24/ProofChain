import { Fragment } from "react";
import { Link } from "react-router";
import clsx from "clsx";

/** Agent text with [P-14] markers turned into citation chips (text is rendered as text, never HTML). */
function WithCitations({ projectId, content, citations }) {
  const byId = new Map(citations.map((c) => [c.humanId, c]));
  return content.split(/(\[P-\d+\])/g).map((part, i) => {
    const id = part.match(/^\[(P-\d+)\]$/)?.[1];
    const c = id && byId.get(id);
    if (!c) return <Fragment key={i}>{part}</Fragment>;
    return (
      <Link
        key={i}
        to={`/projects/${projectId}/sources/${c.sourceId}?passage=${c.humanId}`}
        title={`“${c.quote}”`}
        className="mx-0.5 inline-flex items-center rounded bg-teal/10 px-1 font-mono text-[11px] font-medium text-teal hover:bg-teal/20"
      >
        {c.humanId}
      </Link>
    );
  });
}

export default function ChatMessage({ projectId, message }) {
  const mine = message.role === "user";
  const meta = message.meta ?? {};
  const dropped = meta.validation?.dropped ?? 0;
  return (
    <div className={clsx("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
          mine ? "rounded-br-sm bg-navy text-white" : "rounded-bl-sm bg-surface text-ink ring-1 ring-line",
          message.pending && "opacity-70",
        )}
      >
        {mine ? message.content : <WithCitations projectId={projectId} content={message.content} citations={message.citations ?? []} />}

        {!mine && (meta.claimHumanId || meta.recommended || dropped > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {meta.claimHumanId && (
              <Link to={`/projects/${projectId}/claims/${meta.claimId}`} className="rounded-full bg-navy/10 px-2 py-0.5 font-medium text-navy hover:bg-navy/20">
                Claim {meta.claimHumanId}
              </Link>
            )}
            {meta.recommended && <span className="text-teal">New recommendations on the right →</span>}
          </div>
        )}
        {!mine && dropped > 0 && (
          <p className="mt-1 text-[11px] italic text-muted">
            {dropped === 1 ? "1 citation was" : `${dropped} citations were`} removed because the quote wasn't found in the source.
          </p>
        )}
      </div>
    </div>
  );
}
