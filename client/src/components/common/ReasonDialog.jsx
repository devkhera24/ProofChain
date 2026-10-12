import { useEffect, useState } from "react";
import { STANCE, STANCE_ORDER } from "../../lib/evidence.js";

/**
 * Asks for a reason (required) and optionally a new stance.
 * onSubmit({ reason, stance? }) may return a promise; errors are shown in the dialog.
 */
export default function ReasonDialog({ title, description, confirmLabel = "Save", withStance, currentStance, onSubmit, onClose }) {
  const [reason, setReason] = useState("");
  const [stance, setStance] = useState(withStance ? STANCE_ORDER.find((s) => s !== currentStance) : undefined);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !pending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  async function submit(e) {
    e.preventDefault();
    if (!reason.trim()) return setError("Please give a reason. It is saved in the audit history.");
    setPending(true);
    setError(null);
    try {
      await onSubmit({ reason: reason.trim(), ...(withStance && { stance }) });
      onClose();
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={() => !pending && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="reason-title"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        className="card w-full max-w-md space-y-4"
      >
        <div>
          <h2 id="reason-title" className="text-lg font-semibold text-navy">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>

        {withStance && (
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium text-ink">New stance</legend>
            <div className="flex gap-2">
              {STANCE_ORDER.map((s) => (
                <label
                  key={s}
                  className={`flex-1 cursor-pointer rounded-lg border px-2 py-1.5 text-center text-sm ${
                    stance === s ? `${STANCE[s].border} ${STANCE[s].bg} ${STANCE[s].color} font-medium` : "border-line text-muted"
                  } ${s === currentStance ? "opacity-50" : ""}`}
                >
                  <input type="radio" name="stance" value={s} checked={stance === s} disabled={s === currentStance} onChange={() => setStance(s)} className="sr-only" />
                  {STANCE[s].label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink">Reason</span>
          <textarea
            className="input min-h-20"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. The passage is about a different workload"
            maxLength={500}
            autoFocus
          />
        </label>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Saving…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
