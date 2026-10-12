import { useState } from "react";
import clsx from "clsx";
import { STANCE, STANCE_ORDER } from "../../lib/evidence.js";
import Dialog, { FormError } from "../ui/Dialog.jsx";
import Button from "../ui/Button.jsx";

/**
 * Asks for a reason (required) and optionally a new stance.
 * onSubmit({ reason, stance? }) may return a promise; errors are shown in the dialog.
 * Render inside <AnimatePresence> so it animates out.
 */
export default function ReasonDialog({ title, description, confirmLabel = "Save", withStance, currentStance, onSubmit, onClose }) {
  const [reason, setReason] = useState("");
  const [stance, setStance] = useState(withStance ? STANCE_ORDER.find((s) => s !== currentStance) : undefined);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

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
    <Dialog as="form" title={title} description={description} onClose={onClose} busy={pending} onSubmit={submit}>
      {withStance && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-ink">New stance</legend>
          <div className="flex gap-2">
            {STANCE_ORDER.map((s) => (
              <label
                key={s}
                className={clsx(
                  "flex-1 cursor-pointer rounded-lg border px-2 py-1.5 text-center text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal/40",
                  stance === s ? [STANCE[s].border, STANCE[s].bg, STANCE[s].color, "font-medium"] : "border-line text-muted hover:border-black/20",
                  s === currentStance && "cursor-not-allowed opacity-50",
                )}
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

      <FormError>{error}</FormError>

      <div className="flex justify-end gap-2">
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          {pending ? "Saving…" : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
