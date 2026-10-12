import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookMarked, ChevronDown, Download, FileText } from "lucide-react";
import { downloadExport } from "../../api/export.js";
import { toApiError } from "../../api/client.js";
import { useToast } from "../ui/Toast.jsx";
import Button from "../ui/Button.jsx";

const OPTIONS = [
  { format: "md", label: "Report (Markdown)", hint: "Claims with confirmed quotes, gaps and source provenance", icon: FileText },
  { format: "bib", label: "Bibliography (BibTeX)", hint: "Only sources with verified metadata", icon: BookMarked },
];

/** Workspace header menu: download the project as a Markdown report or a BibTeX file. */
export default function ExportMenu({ projectId }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const toast = useToast();
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function run(format) {
    setBusy(format);
    try {
      const name = await downloadExport(projectId, format);
      toast({ text: `Downloaded ${name}` });
      setOpen(false);
    } catch (err) {
      toast({ text: `Export failed: ${toApiError(err).message}`, tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <Button size="sm" variant="outline" icon={Download} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        Export <ChevronDown size={14} className={open ? "rotate-180 transition-transform" : "transition-transform"} aria-hidden="true" />
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.15 }}
            style={{ originY: 0 }}
            className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-line bg-white p-1 shadow-lg"
          >
            {OPTIONS.map(({ format, label, hint, icon: Icon }) => (
              <button
                key={format}
                type="button"
                role="menuitem"
                disabled={!!busy}
                onClick={() => run(format)}
                className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left outline-none hover:bg-black/5 focus-visible:bg-black/5 disabled:opacity-60"
              >
                <Icon size={16} className="mt-0.5 shrink-0 text-teal" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-medium text-ink">{busy === format ? "Preparing…" : label}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
