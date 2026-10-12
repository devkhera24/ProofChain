import { useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import Tabs from "../ui/Tabs.jsx";
import { Skeleton } from "../ui/Skeleton.jsx";
import { profileApi } from "../../api/profile.js";
import { projectsApi } from "../../api/projects.js";
import { toApiError } from "../../api/client.js";
import { useProject } from "../../hooks/useProject.js";
import { timeAgo } from "../../lib/format.js";

const LEVELS = ["beginner", "intermediate", "advanced"];

function TopicChips({ projectId, topics, canEdit }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const save = useMutation({
    mutationFn: (next) => projectsApi.update(projectId, { topics: next }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["profile", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const add = () => {
    const t = draft.trim();
    if (t && !topics.includes(t) && topics.length < 10) save.mutate([...topics, t]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <AnimatePresence initial={false}>
          {topics.map((t) => (
            <motion.span
              key={t}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="inline-flex items-center gap-1 rounded-full bg-teal/10 px-2 py-0.5 text-xs text-teal"
            >
              {t}
              {canEdit && (
                <button type="button" aria-label={`Remove ${t}`} className="rounded-full hover:text-red-700" onClick={() => save.mutate(topics.filter((x) => x !== t))}>
                  <X size={12} />
                </button>
              )}
            </motion.span>
          ))}
        </AnimatePresence>
        {!topics.length && <span className="text-xs text-muted">No topics yet.</span>}
      </div>
      {canEdit && topics.length < 10 && (
        <form className="flex gap-1" onSubmit={(e) => (e.preventDefault(), add())}>
          <input className="input py-1 text-xs" placeholder="Add a topic" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80} aria-label="New topic" />
          <button type="submit" className="btn-ghost px-2 py-1 text-xs" disabled={!draft.trim() || save.isPending}>
            Add
          </button>
        </form>
      )}
      {save.error && <p className="text-xs text-red-700">{toApiError(save.error).message}</p>}
    </div>
  );
}

export default function ProfilePanel() {
  const { projectId } = useParams();
  const qc = useQueryClient();
  const { data: project } = useProject(projectId);
  const canEdit = ["editor", "owner"].includes(project?.role);
  const { data: profile, isPending, error } = useQuery({ queryKey: ["profile", projectId], queryFn: () => profileApi.get(projectId) });
  const update = useMutation({
    mutationFn: (data) => profileApi.update(projectId, data),
    onSuccess: (p) => qc.setQueryData(["profile", projectId], p),
  });
  const setLevel = useMutation({
    mutationFn: (level) => projectsApi.update(projectId, { level }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["profile", projectId] });
    },
  });

  if (isPending)
    return (
      <div className="space-y-3 p-3" role="status" aria-label="Loading profile…">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-6 w-1/2 rounded-full" />
      </div>
    );
  if (error) return <p className="p-3 text-sm text-red-700">{toApiError(error).message}</p>;

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-auto p-3 text-sm">
      <div>
        <h2 className="font-semibold text-navy">What I think you're interested in</h2>
        <p className="text-xs text-muted">Recommendations use your topics, your sources and your recent questions.</p>
      </div>

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Topics</h3>
        <TopicChips projectId={projectId} topics={profile.topics} canEdit={canEdit} />
      </section>

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Level</h3>
        <fieldset disabled={!canEdit || setLevel.isPending} className="capitalize">
          <Tabs
            label="Level"
            layoutId="profile-level"
            value={profile.level}
            onChange={(l) => l !== profile.level && setLevel.mutate(l)}
            items={LEVELS.map((l) => ({ key: l, label: l }))}
          />
        </fieldset>
        {profile.goal && <p className="text-xs text-muted">Goal: {profile.goal}</p>}
      </section>

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Recent question themes</h3>
        {profile.recentThemes.length ? (
          <ul className="space-y-1">
            {profile.recentThemes.map((q) => (
              <li key={`${q.at}-${q.text}`} className="text-xs">
                <span className="text-ink">{q.text}</span> <span className="text-muted">· {timeAgo(q.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">Ask questions in the chat and they'll shape your recommendations.</p>
        )}
      </section>

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Filtered out</h3>
        {profile.exclusions.length ? (
          <ul className="space-y-2">
            {profile.exclusions.map((e) => (
              <li key={e.id} className="rounded-lg border border-line p-2">
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-xs font-medium text-ink">{e.concept}</span>
                  <div className="flex overflow-hidden rounded-full border border-line text-[10px]" role="group" aria-label={`Strength for ${e.concept}`}>
                    {["soft", "hard"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={e.strength === s}
                        disabled={update.isPending}
                        onClick={() => e.strength !== s && update.mutate({ exclusion: { id: e.id, strength: s } })}
                        className={clsx("px-2 py-0.5 capitalize", e.strength === s ? "bg-navy text-white" : "text-muted hover:bg-black/5")}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="rounded p-0.5 text-muted hover:bg-black/5 hover:text-red-700" aria-label={`Remove ${e.concept}`} onClick={() => update.mutate({ removeExclusion: e.id })}>
                    <X size={14} />
                  </button>
                </div>
                {e.reason && <p className="mt-1 text-[11px] italic text-muted">From your feedback: “{e.reason}”</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">Nothing yet. Marking a paper “Not relevant” with a reason adds a filter here.</p>
        )}
        <p className="text-[11px] text-muted">Soft filters lower a paper's rank; hard filters remove it.</p>
        {update.error && <p className="text-xs text-red-700">{toApiError(update.error).message}</p>}
      </section>
    </div>
  );
}
