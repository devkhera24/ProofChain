import { useServerStatus } from "../../hooks/useServerStatus.js";

export default function ServerStatusBanner() {
  const status = useServerStatus();
  if (status === "ok" || status === "checking") return null;
  const waking = status === "waking";
  return (
    <div className={`px-4 py-2 text-center text-sm ${waking ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800"}`}>
      {waking
        ? "Waking up the server (free hosting sleeps when idle). This can take up to a minute…"
        : "The server is unreachable right now. Please try again shortly."}
    </div>
  );
}
