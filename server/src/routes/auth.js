import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimits.js";
import * as auth from "../services/auth/authService.js";

export const authRouter = Router();

const registerBody = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});
const loginBody = z.object({ email: z.string().trim().email(), password: z.string().min(1) });

authRouter.post("/register", authLimiter, validate({ body: registerBody }), async (req, res) => {
  const { user, token } = await auth.register(req.valid.body);
  res.status(201).json({ user, token });
});

authRouter.post("/login", authLimiter, validate({ body: loginBody }), async (req, res) => {
  const { user, token } = await auth.login(req.valid.body);
  res.json({ user, token });
});

authRouter.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));
