import { useEffect, useMemo, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { sourcesApi } from "../../api/sources.js";
import { toApiError } from "../../api/client.js";
import { buildSegments } from "../../lib/segments.js";
import { SOURCE_TYPES, DEPTH_LABELS } from "../../lib/sourceLabels.js";
import StateMessage from "../common/StateMessage.jsx";

export default function SourceViewer() {
  const { projectId, sourceId } = useParams();
  const [params] = useSearchParams();
  const target = params.get("passage"); // e.g. "P-14"
  const textRef = useRef(null);

  const source = useQuery({ queryKey: ["source", projectId, sourceId], queryFn: () => sourcesApi.get(projectId, sourceId) });
  const passages = useQuery({
    queryKey: ["passages", projectId, sourceId],
    queryFn: () => sourcesApi.allPassages(projectId, sourceId),
    enabled: source.data?.status === "ready",
  });

  const pageStarts = useMemo(() => source.data?.pageStarts ?? [], [source.data]);
  const segments = useMemo(
    () => (source.data?.text && passages.data ? buildSegments(source.data.text, passages.data, pageStarts) : []),
    [source.data, passages.data, pageStarts],
  );
  const pageAt = useMemo(() => new Map(pageStarts.map((start, i) => [start, i + 1])), [pageStarts]);

  // Deep link: scroll to the first segment of ?passage=P-14 and pulse every segment it covers
  useEffect(() => {
    if (!target || !segments.length || !textRef.current) return;
    const els = [...textRef.current.querySelectorAll("[data-passages]")].filter((el) =>
      el.dataset.passages.split(" ").includes(target),
    );
    if (!els.length) return;
    els[0].scrollIntoView({ behavior: "smooth", block: "center" });
    els.forEach((el) => el.classList.add("passage-pulse"));
    const t = setTimeout(() => els.forEach((el) => el.classList.remove("passage-pulse")), 2600);
    return () => clearTimeout(t);
  }, [target, segments]);

  const back = (
    <Link to={`/projects/${projectId}/sources`} className="text-sm text-teal hover:underline">
      ← All sources
    </Link>
  );

  if (source.isPending) return <StateMessage kind="loading" title="Loading source…" />;
  if (source.error) {
    const { status, message } = toApiError(source.error);
    return (
      <StateMessage kind="error" title={status === 404 ? "Source not found" : "Couldn't load this source"} action={back}>
        {message}
      </StateMessage>
    );
  }

  const s = source.data;
  return (
    <article className="mx-auto max-w-3xl">
      <div className="mb-4">{back}</div>
      <header className="mb-6 space-y-1">
        <h2 className="text-xl font-semibold text-navy">{s.title}</h2>
        <p className="text-sm text-muted">
          {[s.authors?.join(", "), s.year, SOURCE_TYPES[s.sourceType], DEPTH_LABELS[s.depth], `${s.passageCount} passages`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {s.url && (
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-teal hover:underline">
            {s.url}
          </a>
        )}
      </header>

      {s.status !== "ready" ? (
        <StateMessage title={`This source is ${s.status}`}>Its text appears here once processing has finished.</StateMessage>
      ) : passages.isPending ? (
        <StateMessage kind="loading" title="Loading passages…" />
      ) : passages.error ? (
        <StateMessage kind="error" title="Couldn't load passages">
          {toApiError(passages.error).message}
        </StateMessage>
      ) : (
        // Text is rendered as React text nodes — never as HTML
        <div ref={textRef} className="card whitespace-pre-wrap text-[15px] leading-7 text-ink">
          {segments.map((seg) => {
            const page = pageStarts.length > 1 ? pageAt.get(seg.start) : null;
            return (
              <span key={seg.start}>
                {page && (
                  <span className="mr-2 inline-block select-none rounded bg-black/5 px-1.5 text-xs font-medium text-muted" aria-label={`Page ${page}`}>
                    p.{page}
                  </span>
                )}
                {seg.passageIds.length ? (
                  <span
                    data-passages={seg.passageIds.join(" ")}
                    title={seg.passageIds.join(", ")}
                    className={clsx(
                      "rounded-sm transition-colors hover:bg-teal/10",
                      seg.passageIds.includes(target) && "bg-amber-100",
                    )}
                  >
                    {seg.text}
                  </span>
                ) : (
                  seg.text
                )}
              </span>
            );
          })}
        </div>
      )}
    </article>
  );
}
