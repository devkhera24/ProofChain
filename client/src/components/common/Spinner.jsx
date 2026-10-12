import { Loader2 } from "lucide-react";

/** `inline` fits inside panels; the default fills half the screen for page-level loading. */
export default function Spinner({ label = "Loading…", inline = false }) {
  return (
    <div className={`flex items-center justify-center gap-2.5 text-sm text-muted ${inline ? "py-8" : "min-h-[50vh]"}`} role="status">
      <Loader2 size={18} className="animate-spin text-teal motion-reduce:animate-none" aria-hidden="true" />
      {label}
    </div>
  );
}
