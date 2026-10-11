import { useEffect, useState } from "react";
import { api } from "../api/client.js";

// 'checking' → 'ok' | 'waking' | 'down'
export function useServerStatus() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let cancelled = false;
    const slowTimer = setTimeout(() => !cancelled && setStatus((s) => (s === "checking" ? "waking" : s)), 2500);

    (async () => {
      for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
        try {
          await api.get("/health", { timeout: 70_000 });
          if (!cancelled) setStatus("ok");
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      if (!cancelled) setStatus("down");
    })();

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, []);

  return status;
}
