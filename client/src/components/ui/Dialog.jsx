import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { ease } from "../../lib/motion.js";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog rendered in a portal. Render it inside <AnimatePresence> at the call site
 * (`<AnimatePresence>{open && <Dialog … />}</AnimatePresence>`) so it also animates out.
 * - Escape and clicking the backdrop close it, unless `busy` (e.g. while saving).
 * - Tab is kept inside the dialog; focus returns to the previously focused element on close.
 * - `as="form"` makes the panel the form, so Enter submits.
 */
export default function Dialog({ title, description, onClose, busy = false, as = "div", size = "max-w-md", children, ...panelProps }) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef(null);
  const Panel = as === "form" ? motion.form : motion.div;

  useEffect(() => {
    const previous = document.activeElement;
    // autoFocus inside the dialog wins; otherwise focus the first field or button
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.querySelector(FOCUSABLE)?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
    };
  }, []);

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!busy) onClose();
    } else if (e.key === "Tab") {
      const els = [...panelRef.current.querySelectorAll(FOCUSABLE)];
      if (!els.length) return;
      const [first, last] = [els[0], els.at(-1)];
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" onKeyDown={onKeyDown}>
      <motion.div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.18 } }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
        onMouseDown={() => !busy && onClose()}
        aria-hidden="true"
      />
      <Panel
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.24, ease } }}
        exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.14 } }}
        className={`card relative max-h-[90vh] w-full ${size} space-y-4 overflow-auto p-5 shadow-xl`}
        {...panelProps}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight text-navy">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <button type="button" className="-m-1 rounded-md p-1 text-muted hover:bg-black/5 hover:text-ink" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </Panel>
    </div>,
    document.body,
  );
}

/** Red error box used inside dialogs and forms. */
export function FormError({ children }) {
  if (!children) return null;
  return (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
      {children}
    </motion.p>
  );
}
