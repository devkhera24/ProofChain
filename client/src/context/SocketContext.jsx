import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { API_URL, tokenStore } from "../api/client.js";
import { useAuth } from "./AuthContext.jsx";

const SocketContext = createContext({ socket: null, status: "offline" });

/**
 * One Socket.io connection per logged-in user. status: "connecting" → "live", "reconnecting" after a drop
 * (e.g. Render restarting or sleeping). Socket.io retries on its own; the token is read on every attempt.
 */
export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({ socket: null, status: "offline" });

  useEffect(() => {
    if (!user) return;
    const s = io(API_URL, {
      auth: (cb) => cb({ token: tokenStore.get() }),
      transports: ["websocket", "polling"],
      reconnectionDelayMax: 10_000,
    });
    const set = (status) => setState({ socket: s, status });
    set("connecting");
    s.on("connect", () => set("live"));
    s.on("disconnect", () => set("reconnecting"));
    s.on("connect_error", () => set("reconnecting"));
    return () => {
      s.disconnect();
      setState({ socket: null, status: "offline" });
    };
  }, [user]);

  return <SocketContext.Provider value={state}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext).socket;
export const useSocketStatus = () => useContext(SocketContext).status;

/** refetchInterval helper: poll every 30 s only while the socket is down, and only when `needed`. */
export function useFallbackPoll() {
  const live = useSocketStatus() === "live";
  return (needed = true) => (!live && needed ? 30_000 : false);
}
