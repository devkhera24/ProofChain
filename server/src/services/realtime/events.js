let io = null;
export const setIo = (instance) => (io = instance);
export const roomFor = (projectId) => `project:${projectId}`;

/** Safe to call anywhere; no-op in tests or before sockets start. */
export function emitToProject(projectId, event, payload = {}) {
  io?.to(roomFor(projectId)).emit(event, { ...payload, at: Date.now() });
}

/** A removed member must stop receiving the project's events straight away. */
export async function removeUserFromProject(projectId, userId) {
  if (!io) return;
  const sockets = await io.in(roomFor(projectId)).fetchSockets();
  for (const s of sockets) if (s.data.user?.id === String(userId)) s.leave(roomFor(projectId));
  await broadcastPresence(projectId);
}

/** Everyone currently in the project room, one entry per user (a user may have several tabs open). */
export async function broadcastPresence(projectId) {
  if (!io || !projectId) return;
  const sockets = await io.in(roomFor(projectId)).fetchSockets();
  const users = [...new Map(sockets.map((s) => [s.data.user.id, s.data.user])).values()];
  io.to(roomFor(projectId)).emit("presence", users);
}
