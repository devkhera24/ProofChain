import mongoose from "mongoose";
import { Server } from "socket.io";
import { isAllowedOrigin } from "../config/cors.js";
import { verifyToken } from "../services/auth/authService.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { setIo, roomFor, broadcastPresence } from "../services/realtime/events.js";
import { logger } from "../utils/logger.js";

/**
 * Socket.io on the same HTTP server as the API. Clients authenticate with the same JWT
 * (handshake `auth.token`) and join one project room at a time; membership is checked on join.
 * Events only tell clients what changed; they refetch over REST, so permissions stay in one place.
 */
export function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: (origin, cb) => cb(null, isAllowedOrigin(origin)) },
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  io.use(async (socket, next) => {
    try {
      const { sub } = verifyToken(socket.handshake.auth?.token);
      const user = await User.findById(sub);
      if (!user) return next(new Error("unauthorized"));
      socket.data.user = { id: user.id, name: user.name };
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const leaveCurrent = async () => {
      const previous = socket.data.projectId;
      if (!previous) return;
      socket.leave(roomFor(previous));
      socket.data.projectId = null;
      await broadcastPresence(previous);
    };

    socket.on("project:join", async (projectId, ack) => {
      const ok =
        typeof projectId === "string" &&
        mongoose.isValidObjectId(projectId) &&
        (await Project.exists({ _id: projectId, "members.userId": socket.data.user.id }).catch(() => null));
      if (!ok) return typeof ack === "function" && ack({ ok: false });
      if (socket.data.projectId !== projectId) await leaveCurrent();
      socket.join(roomFor(projectId));
      socket.data.projectId = projectId;
      if (typeof ack === "function") ack({ ok: true });
      await broadcastPresence(projectId);
    });

    socket.on("project:leave", leaveCurrent);
    socket.on("disconnect", () => broadcastPresence(socket.data.projectId).catch(() => {}));
  });

  io.engine.on("connection_error", (err) => logger.debug({ code: err.code, message: err.message }, "socket connection error"));
  setIo(io);
  return io;
}
