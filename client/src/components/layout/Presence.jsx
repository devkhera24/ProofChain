import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { useSocketStatus } from "../../context/SocketContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { spring } from "../../lib/motion.js";

const initials = (name = "?") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
const MAX_SHOWN = 4;

/** "Live" / "Reconnecting…" plus avatars of everyone viewing this project right now (you first). */
export default function Presence({ users }) {
  const status = useSocketStatus();
  const { user: me } = useAuth();
  const sorted = [...users].sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : a.name.localeCompare(b.name)));
  const shown = sorted.slice(0, MAX_SHOWN);
  const live = status === "live";

  return (
    <div className="ml-auto flex items-center gap-3">
      {live && users.length > 0 && (
        <div className="flex -space-x-1.5" aria-label={`Here now: ${sorted.map((u) => u.name).join(", ")}`}>
          <AnimatePresence initial={false}>
            {shown.map((u) => (
              <motion.span
                key={u.id}
                layout
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={spring}
                title={u.id === me?.id ? `${u.name} (you)` : u.name}
                className={clsx(
                  "grid h-7 w-7 place-items-center rounded-full text-[10px] font-semibold ring-2 ring-white",
                  u.id === me?.id ? "bg-navy text-white" : "bg-teal text-white",
                )}
              >
                {initials(u.name)}
              </motion.span>
            ))}
          </AnimatePresence>
          {sorted.length > MAX_SHOWN && (
            <span className="grid h-7 w-7 place-items-center rounded-full bg-black/10 text-[10px] font-semibold text-muted ring-2 ring-white">
              +{sorted.length - MAX_SHOWN}
            </span>
          )}
        </div>
      )}
      <span
        className={clsx("inline-flex items-center gap-1.5 text-xs", live ? "text-supports" : "text-inconclusive")}
        role="status"
        title={live ? "Changes by others appear instantly" : "Live updates are paused; the page refreshes every 30 s until reconnected"}
      >
        <span className="relative flex h-2 w-2">
          {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-supports opacity-50 motion-reduce:animate-none" />}
          <span className={clsx("relative inline-flex h-2 w-2 rounded-full", live ? "bg-supports" : "bg-inconclusive")} />
        </span>
        {live ? "Live" : status === "connecting" ? "Connecting…" : "Reconnecting…"}
      </span>
    </div>
  );
}
