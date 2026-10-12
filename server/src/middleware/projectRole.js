import mongoose from "mongoose";
import { Project, ROLES } from "../models/Project.js";
import { AppError, notFoundError } from "../utils/errors.js";

export const requireProjectRole = (minRole = "viewer") => async (req, _res, next) => {
  const { projectId } = req.params;
  if (!mongoose.isValidObjectId(projectId)) throw notFoundError("Project");
  const project = await Project.findById(projectId);
  if (!project) throw notFoundError("Project");
  const member = project.members.find((m) => m.userId.equals(req.user._id));
  if (!member) throw notFoundError("Project"); // don't reveal existence
  if (ROLES.indexOf(member.role) < ROLES.indexOf(minRole)) throw new AppError(403, `Requires ${minRole} role`);
  req.project = project;
  req.role = member.role;
  next();
};
