import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "../../api/projects.js";
import { toApiError } from "../../api/client.js";

const LEVELS = ["beginner", "intermediate", "advanced"];
const parseTopics = (s) => [...new Set(s.split(",").map((t) => t.trim()).filter(Boolean))];

export default function NewProjectDialog({ onClose }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: "", topics: "", level: "intermediate", goal: "" });
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const topics = parseTopics(values.topics);

  const create = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate(`/projects/${project.id}`);
    },
  });
  const error = create.error && toApiError(create.error);
  const fieldError = (name) => error?.issues?.find((i) => i.path === name || i.path.startsWith(`${name}.`))?.message;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onSubmit(e) {
    e.preventDefault();
    create.mutate({ name: values.name, topics, level: values.level, goal: values.goal });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        onSubmit={onSubmit}
        onMouseDown={(e) => e.stopPropagation()}
        noValidate
        className="card w-full max-w-md space-y-4"
      >
        <h2 id="new-project-title" className="text-lg font-semibold text-navy">
          New project
        </h2>

        {error && !error.issues && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error.message}
          </p>
        )}

        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink">Name</span>
          <input className="input" value={values.name} onChange={set("name")} autoFocus required />
          {fieldError("name") && <span className="block text-xs text-red-700">{fieldError("name")}</span>}
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink">Topics</span>
          <input className="input" value={values.topics} onChange={set("topics")} placeholder="sleep, memory consolidation" />
          {fieldError("topics") ? (
            <span className="block text-xs text-red-700">{fieldError("topics")}</span>
          ) : (
            <span className="block text-xs text-muted">Comma-separated, up to 10.</span>
          )}
          {topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {topics.map((t) => (
                <span key={t} className="rounded-full bg-teal/10 px-2 py-0.5 text-xs text-teal">
                  {t}
                </span>
              ))}
            </div>
          )}
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink">Level</span>
          <select className="input capitalize" value={values.level} onChange={set("level")}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink">Goal</span>
          <input
            className="input"
            value={values.goal}
            onChange={set("goal")}
            placeholder="Literature review for a seminar"
          />
          {fieldError("goal") && <span className="block text-xs text-red-700">{fieldError("goal")}</span>}
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create project"}
          </button>
        </div>
      </form>
    </div>
  );
}
