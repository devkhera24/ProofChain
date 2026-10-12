import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe, FileText } from "lucide-react";
import { sourcesApi } from "../../api/sources.js";
import { toApiError } from "../../api/client.js";
import Dialog, { FormError } from "../ui/Dialog.jsx";
import Button from "../ui/Button.jsx";
import Tabs from "../ui/Tabs.jsx";
import { useToast } from "../ui/Toast.jsx";

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
  const toast = useToast();
  const [tab, setTab] = useState("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState(null);

  const done = (source) => {
    qc.invalidateQueries({ queryKey: ["sources", projectId] });
    toast({ text: `Added “${source?.title ?? "source"}”. It's being split into passages…` });
    onClose();
  };
  const addUrl = useMutation({ mutationFn: (u) => sourcesApi.addUrl(projectId, u), onSuccess: done });
  const upload = useMutation({ mutationFn: (f) => sourcesApi.upload(projectId, f, setProgress), onSuccess: done });
  const active = tab === "url" ? addUrl : upload;
  const error = localError ?? (active.error && friendlyError(active.error));

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
    <Dialog as="form" title="Add a source" onClose={onClose} busy={active.isPending} onSubmit={onSubmit} noValidate>
        <Tabs
          variant="segment"
          fill
          layoutId="add-source-tab"
          label="Source kind"
          value={tab}
          onChange={switchTab}
          items={[
            { key: "url", label: "Web page", icon: Globe },
            { key: "pdf", label: "PDF", icon: FileText },
          ]}
        />

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
                  <div className="h-full bg-teal transition-[width] duration-200" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-xs text-muted">
                  {progress < 100 ? `Uploading… ${progress}%` : "Reading the PDF…"}
                </span>
              </div>
            )}
          </label>
        )}

        <FormError>{error}</FormError>

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} disabled={active.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={active.isPending}>
            {active.isPending ? "Adding…" : "Add source"}
          </Button>
        </div>
    </Dialog>
  );
}
