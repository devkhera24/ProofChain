import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import clsx from "clsx";
import { ease } from "../../lib/motion.js";

const ToastContext = createContext(null);
const DURATION = 8000;
let nextId = 1;

/**
 * App-wide toasts: const toast = useToast(); toast({ text, undo?, tone?: "success"|"error" }).
 * Toasts stack bottom-right, pause while hovered and close after 8 s.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback((toast) => setToasts((t) => [...t.slice(-2), { id: nextId++, tone: "success", ...toast }]), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }) {
  const [paused, setPaused] = useState(false);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => close.current(), DURATION);
    return () => clearTimeout(t);
  }, [paused]);
  const Icon = toast.tone === "error" ? CircleAlert : CircleCheck;

  return (
    <motion.div
      layout
      role={toast.tone === "error" ? "alert" : "status"}
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.24, ease } }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="pointer-events-auto flex items-start gap-2.5 rounded-xl bg-ink px-3.5 py-3 text-sm text-white shadow-xl ring-1 ring-white/10"
    >
      <Icon size={18} className={clsx("mt-px shrink-0", toast.tone === "error" ? "text-red-300" : "text-emerald-300")} aria-hidden="true" />
      <span className="flex-1 leading-snug">{toast.text}</span>
      {toast.undo && (
        <button type="button" className="shrink-0 font-semibold text-teal-200 hover:underline" onClick={() => (toast.undo(), onClose())}>
          Undo
        </button>
      )}
      <button type="button" className="shrink-0 opacity-60 hover:opacity-100" onClick={onClose} aria-label="Dismiss">
        <X size={16} />
      </button>
    </motion.div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
