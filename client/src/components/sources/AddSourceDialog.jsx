import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { sourcesApi } from "../../api/sources.js";
import { toApiError } from "../../api/client.js";

const MAX_MB = 15; // matches the server's MAX_UPLOAD_MB default

const isHttpUrl = (s) => {
  try {
    return ["http:", "https:"].includes(new URL(s).protocol);
  } catch {
    return false;
  }
};

const friendlyError = (err) => {
  const { status, message } = toApiError(err);
  if (status === 413) return message || `The file is too large (max ${MAX_MB} MB).`;
  if (status === 415) return "Only PDF files are supported.";
  return message;
};

export default function AddSourceDialog({ projectId, onClose }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState(null);

  const done = () => {
    qc.invalidateQueries({ queryKey: ["sources", projectId] });
    onClose();
  };
  const addUrl = useMutation({ mutationFn: (u) => sourcesApi.addUrl(projectId, u), onSuccess: done });
  const upload = useMutation({ mutationFn: (f) => sourcesApi.upload(projectId, f, setProgress), onSuccess: done });
  const active = tab === "url" ? addUrl : upload;
  const error = localError ?? (active.error && friendlyError(active.error));

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !active.isPending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, active.isPending]);

  function onSubmit(e) {
    e.preventDefault();
    setLocalError(null);
    if (tab === "url") {
      const u = url.trim();
      if (!isHttpUrl(u)) return setLocalError("Enter a full web address starting with http:// or https://");
      addUrl.mutate(u);
    } else {
      if (!file) return setLocalError("Choose a PDF file.");
      if (file.type && file.type !== "application/pdf") return setLocalError("Only PDF files are supported.");
      if (file.size > MAX_MB * 1024 * 1024) return setLocalError(`The file is too large (max ${MAX_MB} MB).`);
      setProgress(0);
      upload.mutate(file);
    }
  }

  const switchTab = (t) => {
    setTab(t);
    setLocalError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={() => !active.isPending && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-source-title"
        onSubmit={onSubmit}
        onMouseDown={(e) => e.stopPropagation()}
        noValidate
        className="card w-full max-w-md space-y-4"
      >
        <h2 id="add-source-title" className="text-lg font-semibold text-navy">
          Add a source
        </h2>

        <div className="flex gap-1 rounded-lg bg-black/5 p-1" role="tablist">
          {[
            ["url", "Web page"],
            ["pdf", "PDF"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => switchTab(key)}
              className={clsx("flex-1 rounded-md py-1.5 text-sm", tab === key ? "bg-white font-medium text-navy shadow-sm" : "text-muted")}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "url" ? (
          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink">Web address</span>
            <input
              className="input"
              type="url"
              inputMode="url"
              placeholder="https://example.com/article"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
            <span className="block text-xs text-muted">The page is downloaded and split into citable passages.</span>
          </label>
        ) : (
          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink">PDF file</span>
            <input
              className="input file:mr-3 file:rounded-md file:border-0 file:bg-black/5 file:px-2 file:py-1 file:text-sm"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <span className="block text-xs text-muted">Text PDFs up to {MAX_MB} MB. Scanned images can't be read.</span>
            {upload.isPending && (
              <div className="pt-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-black/5">
                  <div className="h-full bg-teal transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-xs text-muted">
                  {progress < 100 ? `Uploading… ${progress}%` : "Reading the PDF…"}
                </span>
              </div>
            )}
          </label>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={active.isPending}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={active.isPending}>
            {active.isPending ? "Adding…" : "Add source"}
          </button>
        </div>
      </form>
    </div>
  );
}
