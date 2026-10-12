import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "../../api/projects.js";
import { toApiError } from "../../api/client.js";
import Dialog, { FormError } from "../ui/Dialog.jsx";
import Button from "../ui/Button.jsx";
import Chip from "../ui/Chip.jsx";

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

  function onSubmit(e) {
    e.preventDefault();
    create.mutate({ name: values.name, topics, level: values.level, goal: values.goal });
  }

  return (
    <Dialog
      as="form"
      title="New project"
      description="Recommendations start from these topics and get sharper as you add sources."
      onClose={onClose}
      busy={create.isPending}
      onSubmit={onSubmit}
      noValidate
    >
        <FormError>{error && !error.issues && error.message}</FormError>

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
                <Chip key={t} className="bg-teal/10 text-teal">
                  {t}
                </Chip>
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
          <Button onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={create.isPending}>
            {create.isPending ? "Creating…" : "Create project"}
          </Button>
        </div>
    </Dialog>
  );
}
