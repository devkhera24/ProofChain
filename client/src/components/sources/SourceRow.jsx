import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { sourcesApi } from "../../api/sources.js";
import { toApiError } from "../../api/client.js";
import { SOURCE_TYPES, DEPTH_LABELS, STATUS_STYLES } from "../../lib/sourceLabels.js";
import { Loader2, RotateCw, Trash2 } from "lucide-react";
import Chip from "../ui/Chip.jsx";
import Button from "../ui/Button.jsx";

const Badge = ({ className, children }) => (
  <span className={clsx("rounded-full px-2 py-0.5 text-xs", className ?? "bg-black/5 text-muted")}>{children}</span>
);

export default function SourceRow({ projectId, source, canEdit }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["sources", projectId] });
  const update = useMutation({ mutationFn: (data) => sourcesApi.update(projectId, source.id, data), onSuccess: refresh });
  const retry = useMutation({ mutationFn: () => sourcesApi.retry(projectId, source.id), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => sourcesApi.remove(projectId, source.id), onSuccess: refresh });
  const error = [update, retry, remove].find((m) => m.error)?.error;

  const ready = source.status === "ready";
  const busy = ["queued", "processing"].includes(source.status);
  const title = ready ? (
    <Link to={`/projects/${projectId}/sources/${source.id}`} className="font-medium text-navy hover:underline">
      {source.title}
    </Link>
  ) : (
    <span className="font-medium text-ink">{source.title}</span>
  );

  return (
    <div className="card space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate">{title}</div>
          <p className="truncate text-xs text-muted">{source.url ?? source.fileName}</p>
        </div>
        <Chip animateKey={source.status} className={clsx("capitalize", STATUS_STYLES[source.status])}>
          {busy && <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {source.status === "processing" ? "Processing…" : source.status}
        </Chip>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {canEdit ? (
          <select
            aria-label="Source type"
            className="rounded-full border border-line bg-white px-2 py-0.5 text-xs text-ink"
            value={source.sourceType}
            disabled={update.isPending}
            onChange={(e) => update.mutate({ sourceType: e.target.value })}
          >
            {Object.entries(SOURCE_TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <Badge>{SOURCE_TYPES[source.sourceType]}</Badge>
        )}
        <Badge>{DEPTH_LABELS[source.depth]}</Badge>
        {ready && <Badge>{source.passageCount} passages</Badge>}
        {source.year && <Badge>{source.year}</Badge>}
        {canEdit && (
          <Button
            size="sm"
            icon={Trash2}
            className="ml-auto text-muted hover:text-red-700"
            loading={remove.isPending}
            onClick={() => window.confirm(`Remove "${source.title}" and its passages?`) && remove.mutate()}
          >
            {remove.isPending ? "Removing…" : "Remove"}
          </Button>
        )}
      </div>

      {source.status === "failed" && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          <span>{source.error ?? "Processing failed."}</span>
          {canEdit && (
            <Button size="sm" icon={RotateCw} className="shrink-0 text-red-800 hover:bg-red-100" loading={retry.isPending} onClick={() => retry.mutate()}>
              {retry.isPending ? "Retrying…" : "Retry"}
            </Button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-700">{toApiError(error).message}</p>}
    </div>
  );
}
