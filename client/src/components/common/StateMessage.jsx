import clsx from "clsx";
import Spinner from "./Spinner.jsx";

/** Shared loading / empty / error state. */
export default function StateMessage({ kind = "empty", title, children, action }) {
  if (kind === "loading") return <Spinner label={title ?? "Loading…"} />;
  return (
    <div
      className={clsx(
        "rounded-xl border border-dashed px-6 py-10 text-center",
        kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-line bg-white text-muted",
      )}
      role={kind === "error" ? "alert" : undefined}
    >
      {title && <p className={clsx("font-medium", kind === "error" ? "text-red-800" : "text-ink")}>{title}</p>}
      {children && <div className="mt-1 text-sm">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
