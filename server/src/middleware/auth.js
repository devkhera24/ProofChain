import { verifyToken } from "../services/auth/authService.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/errors.js";

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) throw new AppError(401, "Authentication required");
  const payload = verifyToken(token);
  const user = await User.findById(payload.sub);
  if (!user) throw new AppError(401, "User no longer exists");
  req.user = user;
  next();
}
