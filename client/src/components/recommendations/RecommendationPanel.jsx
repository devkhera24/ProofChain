import { useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { recommendationsApi } from "../../api/recommendations.js";
import { profileApi } from "../../api/profile.js";
import { toApiError } from "../../api/client.js";
import { useProject } from "../../hooks/useProject.js";
import { useLatestBatch, latestBatchKey } from "../../hooks/useLatestBatch.js";
import { TRIGGER_LABEL } from "../../lib/recommendations.js";
import { AnimatePresence, motion } from "motion/react";
import { RefreshCw, Sparkles } from "lucide-react";
import PaperCard from "./PaperCard.jsx";
import Button from "../ui/Button.jsx";
import { Skeleton } from "../ui/Skeleton.jsx";
import { useToast } from "../ui/Toast.jsx";
import { stagger, staggerChild } from "../../lib/motion.js";

function CardSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-line bg-white p-3" style={{ opacity: 1 - i * 0.12 }}>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

export default function RecommendationPanel() {
  const { projectId } = useParams();
  const qc = useQueryClient();
  const { data: project } = useProject(projectId);
  const canAct = ["editor", "owner"].includes(project?.role);
  const { data: batch, isPending, error } = useLatestBatch(projectId);
  const setToast = useToast();
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
    onError: (err) => setToast({ text: toApiError(err).message, tone: "error" }),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-navy">Recommended for you</h2>
          {canAct && (
            <Button size="sm" icon={RefreshCw} loading={running || generate.isPending} onClick={() => generate.mutate()}>
              {running ? "Working…" : "New batch"}
            </Button>
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
          <CardSkeleton />
        ) : error ? (
          <p className="text-sm text-red-700">{toApiError(error).message}</p>
        ) : !batch ? (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-teal/10 text-teal">
              <Sparkles size={22} aria-hidden="true" />
            </span>
            <p className="font-medium text-ink">No recommendations yet</p>
            <p className="mt-1 text-sm text-muted">They're generated automatically once your first source is ready.</p>
            {canAct && (
              <Button variant="primary" size="sm" icon={Sparkles} className="mt-4" onClick={() => generate.mutate()} loading={generate.isPending}>
                Generate now
              </Button>
            )}
          </div>
        ) : running ? (
          <>
            <p className="flex items-center gap-2 text-xs text-muted">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-teal motion-reduce:animate-none" aria-hidden="true" />
              Searching Semantic Scholar and OpenAlex, verifying papers…
            </p>
            <CardSkeleton />
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
          // Keyed by batch so a new batch staggers in; a replaced card cross-fades in its slot
          <motion.div key={batch.id} className="space-y-3" variants={stagger(0.07)} initial="initial" animate="animate">
            {batch.items.map((item, index) => (
              <motion.div key={item.slot} variants={staggerChild} layout="position">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={item.paper.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                    <PaperCard
                      projectId={projectId}
                      item={item}
                      canAct={canAct}
                      pending={pendingIndex === index}
                      onAction={(data) => feedback.mutate({ index, ...data })}
                    />
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            ))}
          </motion.div>
        )}
        {generate.error && toApiError(generate.error).status !== 409 && <p className="text-xs text-red-700">{toApiError(generate.error).message}</p>}
      </div>
    </div>
  );
}
