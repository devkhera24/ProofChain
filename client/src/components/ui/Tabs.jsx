import { motion } from "motion/react";
import clsx from "clsx";
import { spring } from "../../lib/motion.js";

/**
 * Tab/segment control with a sliding indicator.
 * variant: "underline" (panel tabs), "pill" (filters), "segment" (inside a grey track).
 * `layoutId` must be unique per control on the page so indicators don't jump between controls.
 * items: [{ key, label, count?, icon? }]
 */
export default function Tabs({ items, value, onChange, layoutId, variant = "pill", className, label, fill = false }) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={clsx(
        "flex",
        variant === "underline" && "border-b border-line",
        variant === "pill" && "flex-wrap gap-1",
        variant === "segment" && "gap-1 rounded-lg bg-black/5 p-1",
        className,
      )}
    >
      {items.map(({ key, label: text, count, icon: Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={clsx(
              "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40",
              fill && "flex-1",
              variant === "underline" && ["px-3 py-2 text-sm", active ? "font-medium text-navy" : "text-muted hover:text-ink"],
              variant === "pill" && ["rounded-full px-3 py-1 text-xs", active ? "text-white" : "bg-black/5 text-muted hover:bg-black/10"],
              variant === "segment" && ["rounded-md py-1.5 text-sm", active ? "font-medium text-navy" : "text-muted hover:text-ink"],
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={spring}
                className={clsx(
                  "absolute",
                  variant === "underline" && "inset-x-0 -bottom-px h-0.5 bg-navy",
                  variant === "pill" && "inset-0 rounded-full bg-navy",
                  variant === "segment" && "inset-0 rounded-md bg-white shadow-sm",
                )}
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {Icon && <Icon size={14} aria-hidden="true" />}
              {text}
              {count != null && <span className={clsx("tabular-nums", active ? "opacity-80" : "opacity-70")}>({count})</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
