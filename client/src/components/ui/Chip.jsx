import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";

/** Small rounded label. Pass `animateKey` (e.g. the status) to cross-fade when the value changes. */
export default function Chip({ className, children, animateKey, title, as = "span" }) {
  const base = clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs", className ?? "bg-black/5 text-muted");
  if (animateKey === undefined) {
    const Tag = as;
    return (
      <Tag className={base} title={title}>
        {children}
      </Tag>
    );
  }
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={animateKey}
        className={base}
        title={title}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1, transition: { type: "spring", stiffness: 600, damping: 30 } }}
        exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.1 } }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}
