import { motion } from "motion/react";
import clsx from "clsx";
import { CircleAlert } from "lucide-react";
import Spinner from "./Spinner.jsx";
import { fade } from "../../lib/motion.js";

/** Shared loading / empty / error state. `icon` is a lucide component shown above the title. */
export default function StateMessage({ kind = "empty", title, children, action, icon }) {
  if (kind === "loading") return <Spinner label={title ?? "Loading…"} />;
  const Icon = kind === "error" ? CircleAlert : icon;
  return (
    <motion.div
      {...fade}
      className={clsx(
        "flex flex-col items-center rounded-xl border border-dashed px-6 py-10 text-center",
        kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-line bg-white text-muted",
      )}
      role={kind === "error" ? "alert" : undefined}
    >
      {Icon && (
        <span className={clsx("mb-3 grid h-11 w-11 place-items-center rounded-full", kind === "error" ? "bg-red-100 text-red-700" : "bg-teal/10 text-teal")}>
          <Icon size={22} aria-hidden="true" />
        </span>
      )}
      {title && <p className={clsx("font-medium", kind === "error" ? "text-red-800" : "text-ink")}>{title}</p>}
      {children && <div className="mt-1 max-w-sm text-sm">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}
