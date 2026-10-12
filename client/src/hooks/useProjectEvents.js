import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "../context/SocketContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { latestBatchKey } from "./useLatestBatch.js";

/**
 * Server event → query keys to refetch. Keys are prefixes, so ["claim", pid] covers every claim of the project.
 * Events carry ids only; the data itself is refetched over REST so permissions are checked in one place.
 */
const INVALIDATE = {
  "source.updated": (pid, p) => [["sources", pid], ["source", pid, p.sourceId], ["graph", pid]],
  "claim.updated": (pid, p) => [["claims", pid], p.claimId ? ["claim", pid, p.claimId] : ["claim", pid], ["links", pid], ["graph", pid]],
  "link.updated": (pid, p) => [["links", pid], ["claims", pid], ["claim", pid, p.claimId], ["claim-history", pid, p.claimId], ["graph", pid]],
  "batch.ready": (pid, p, me) => (p.userId === me ? [latestBatchKey(pid)] : []), // batches are per user
  "batch.updated": (pid, p, me) => (p.userId === me ? [latestBatchKey(pid)] : []),
  "chat.message": (pid) => [["chat", pid]],
  "comment.added": (pid, p) => [["comments", pid, p.targetId], ["comments", pid, "counts"], ["claim-history", pid]],
  "comment.updated": (pid, p) => [["comments", pid, p.targetId], ["comments", pid, "counts"]],
};

/** Joins the project's room, keeps queries fresh from server events, and returns who else is here. */
export function useProjectEvents(projectId) {
  const socket = useSocket();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [presence, setPresence] = useState([]);

  useEffect(() => {
    if (!socket || !projectId) return;
    let joinedBefore = false;
    const join = () => {
      socket.emit("project:join", projectId);
      // After a reconnect, events may have been missed while offline: refresh everything for this project
      if (joinedBefore) qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === projectId });
      joinedBefore = true;
    };
    if (socket.connected) join();
    socket.on("connect", join);
    const handlers = Object.entries(INVALIDATE).map(([event, keys]) => {
      const h = (payload = {}) => keys(projectId, payload, user?.id).forEach((queryKey) => qc.invalidateQueries({ queryKey }));
      socket.on(event, h);
      return [event, h];
    });
    socket.on("presence", setPresence);
    return () => {
      socket.emit("project:leave");
      socket.off("connect", join);
      handlers.forEach(([e, h]) => socket.off(e, h));
      socket.off("presence", setPresence);
      setPresence([]);
    };
  }, [socket, projectId, qc, user?.id]);

  return { presence };
}
