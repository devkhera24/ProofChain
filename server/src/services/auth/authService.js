import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../../models/User.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";

export const signToken = (user) =>
  jwt.sign({ sub: user.id ?? user._id.toString() }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

export async function register({ name, email, password }) {
  const exists = await User.exists({ email: email.toLowerCase() });
  if (exists) throw new AppError(409, "An account with this email already exists");
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, passwordHash });
  return { user, token: signToken(user) };
}

export async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new AppError(401, "Invalid email or password");
  return { user, token: signToken(user) };
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new AppError(401, "Invalid or expired token");
  }
}
