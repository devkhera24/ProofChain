import { Project } from "../../models/Project.js";
import { User } from "../../models/User.js";
import { AppError, notFoundError } from "../../utils/errors.js";
import { ensureProfile, scheduleProfileRefresh, scheduleProjectProfiles } from "../profile/profileService.js";

const roleOf = (project, userId) => project.members.find((m) => m.userId.equals(userId))?.role ?? null;

/** Project JSON with members expanded to { userId, role, name, email }. */
async function withMembers(project) {
  const users = await User.find({ _id: { $in: project.members.map((m) => m.userId) } }).lean();
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  const json = project.toJSON();
  json.members = project.members.map((m) => {
    const u = byId.get(m.userId.toString());
    return { userId: m.userId.toString(), role: m.role, name: u?.name ?? null, email: u?.email ?? null };
  });
  return json;
}

export async function listProjects(user) {
  const projects = await Project.find({ "members.userId": user._id }).sort({ updatedAt: -1 });
  return projects.map((p) => ({ ...p.toJSON(), role: roleOf(p, user._id) }));
}

export async function createProject(user, data) {
  const project = await Project.create({ ...data, members: [{ userId: user._id, role: "owner" }] });
  await ensureProfile(project._id, user._id);
  scheduleProfileRefresh(project._id, user._id); // topics → initial profile vector
  return withMembers(project);
}

export async function getProject(project) {
  return withMembers(project);
}

export async function updateProject(project, data) {
  const profileChanged =
    (data.topics && data.topics.join("\n") !== project.topics.join("\n")) || (data.level && data.level !== project.level);
  project.set(data);
  await project.save();
  if (profileChanged) await scheduleProjectProfiles(project._id);
  return withMembers(project);
}

export async function addMember(project, { email, role }) {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) throw new AppError(404, "No user with this email. They need to register first.");
  const existing = project.members.find((m) => m.userId.equals(user._id));
  if (existing) existing.role = role;
  else project.members.push({ userId: user._id, role });
  await project.save();
  if (!existing) {
    await ensureProfile(project._id, user._id);
    scheduleProfileRefresh(project._id, user._id);
  }
  return withMembers(project);
}

export async function removeMember(project, userId) {
  const member = project.members.find((m) => m.userId.toString() === userId);
  if (!member) throw notFoundError("Member");
  const owners = project.members.filter((m) => m.role === "owner");
  if (member.role === "owner" && owners.length === 1) throw new AppError(400, "A project must keep at least one owner");
  project.members = project.members.filter((m) => m !== member);
  await project.save();
  return withMembers(project);
}
