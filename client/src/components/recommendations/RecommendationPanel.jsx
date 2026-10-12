import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { recommendationsApi } from "../../api/recommendations.js";
import { profileApi } from "../../api/profile.js";
import { toApiError } from "../../api/client.js";
import { useProject } from "../../hooks/useProject.js";
import { useLatestBatch, latestBatchKey } from "../../hooks/useLatestBatch.js";
import { TRIGGER_LABEL } from "../../lib/recommendations.js";
import PaperCard from "./PaperCard.jsx";

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="animate-pulse space-y-2 rounded-xl border border-line bg-white p-3 motion-reduce:animate-none">
          <div className="h-3 w-16 rounded bg-black/10" />
          <div className="h-4 w-11/12 rounded bg-black/10" />
          <div className="h-3 w-2/3 rounded bg-black/5" />
          <div className="h-3 w-full rounded bg-black/5" />
        </div>
      ))}
    </div>
  );
}

function Toast({ toast, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  return (
    <div role="status" className="flex items-start gap-2 rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-lg">
      <span className="flex-1">{toast.text}</span>
      {toast.undo && (
        <button type="button" className="font-semibold text-teal-200 underline" onClick={() => (toast.undo(), onClose())}>
          Undo
        </button>
      )}
      <button type="button" className="opacity-70 hover:opacity-100" onClick={onClose} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

export default function RecommendationPanel() {
  const { projectId } = useParams();
  const qc = useQueryClient();
  const { data: project } = useProject(projectId);
  const canAct = ["editor", "owner"].includes(project?.role);
  const { data: batch, isPending, error } = useLatestBatch(projectId);
  const [toast, setToast] = useState(null);
  const closeToast = useCallback(() => setToast(null), []);
  const [pendingIndex, setPendingIndex] = useState(null);
  const running = batch?.status === "running";

  const generate = useMutation({
    mutationFn: () => recommendationsApi.generate(projectId),
    onSettled: () => qc.invalidateQueries({ queryKey: latestBatchKey(projectId) }), // 409 = already running → just refresh
  });

  const undoRule = useMutation({
    mutationFn: (id) => profileApi.update(projectId, { removeExclusion: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", projectId] }),
  });

  const feedback = useMutation({
    mutationFn: ({ index, ...data }) => recommendationsApi.feedback(projectId, batch.id, index, data),
    onMutate: ({ index }) => setPendingIndex(index),
    onSettled: () => setPendingIndex(null),
    onSuccess: (res, { action }) => {
      qc.setQueryData(latestBatchKey(projectId), res.batch);
      if (action === "added") {
        qc.invalidateQueries({ queryKey: ["sources", projectId] });
        setToast({ text: res.note ? `Added — ingesting the abstract. ${res.note}` : "Added — ingesting…" });
      } else if (action === "not_relevant") {
        qc.invalidateQueries({ queryKey: ["profile", projectId] });
        const swap = res.replaced ? " Here's another paper for this slot." : res.note ? ` ${res.note}` : "";
        setToast(
          res.rule
            ? { text: `Added a ${res.rule.strength} exclusion for “${res.rule.concept}”.${swap}`, undo: () => undoRule.mutate(res.rule.id) }
            : { text: `Got it.${swap}` },
        );
      }
    },
    onError: (err) => setToast({ text: toApiError(err).message }),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-navy">Recommended for you</h2>
          {canAct && (
            <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={running || generate.isPending} onClick={() => generate.mutate()}>
              {running ? "Working…" : "Generate new batch"}
            </button>
          )}
        </div>
        {batch && (
          <p className="text-xs text-muted">
            Batch {batch.humanId} · trigger: {TRIGGER_LABEL[batch.trigger] ?? batch.trigger}
            {batch.triggerText ? ` “${batch.triggerText.slice(0, 40)}”` : ""}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {isPending ? (
          <Skeleton />
        ) : error ? (
          <p className="text-sm text-red-700">{toApiError(error).message}</p>
        ) : !batch ? (
          <div className="space-y-2 p-2 text-sm text-muted">
            <p>No recommendations yet. They're generated automatically once your first source is ready.</p>
            {canAct && (
              <button type="button" className="btn-primary text-xs" onClick={() => generate.mutate()} disabled={generate.isPending}>
                Generate now
              </button>
            )}
          </div>
        ) : running ? (
          <>
            <p className="text-xs text-muted">Searching Semantic Scholar and OpenAlex, verifying papers…</p>
            <Skeleton />
          </>
        ) : batch.status === "failed" ? (
          <div className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
            <p>This batch failed: {batch.error ?? "unknown error"}</p>
            {canAct && (
              <button type="button" className="btn-ghost text-xs text-red-800" onClick={() => generate.mutate()}>
                Try again
              </button>
            )}
          </div>
        ) : !batch.items.length ? (
          <p className="text-sm text-muted">No paper passed verification this time. The Log tab shows what was checked and why it was dropped.</p>
        ) : (
          batch.items.map((item, index) => (
            <PaperCard
              key={`${item.slot}-${item.paper.title}`}
              projectId={projectId}
              item={item}
              canAct={canAct}
              pending={pendingIndex === index}
              onAction={(data) => feedback.mutate({ index, ...data })}
            />
          ))
        )}
        {generate.error && toApiError(generate.error).status !== 409 && <p className="text-xs text-red-700">{toApiError(generate.error).message}</p>}
      </div>

      {toast && (
        <div className="p-3 pt-0">
          <Toast toast={toast} onClose={closeToast} />
        </div>
      )}
    </div>
  );
}
