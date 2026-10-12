// Demo setup: ALLOW_SEED=true npm run seed:demo   (add --reset-password to issue a new demo password)
// Creates the demo account and an empty project. It never fabricates sources, papers or claims:
// the presenter adds real sources through the UI, exactly as in the walkthrough.
import "dotenv/config"; // so ALLOW_SEED can also come from server/.env
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

if (process.env.ALLOW_SEED !== "true") {
  console.error("Refusing to seed: set ALLOW_SEED=true to confirm you want demo data in this database.");
  process.exit(1);
}

const { env } = await import("../src/config/env.js");
const { connectDb, disconnectDb } = await import("../src/config/db.js");
const { User } = await import("../src/models/User.js");
const { Project } = await import("../src/models/Project.js");
const { register } = await import("../src/services/auth/authService.js");
const { createProject } = await import("../src/services/projects/projectService.js");
const { drain } = await import("../src/jobs/runner.js");

const EMAIL = "demo@proofchain.dev";
const PROJECT = {
  name: "Seminar: Graph Databases",
  topics: ["graph databases", "query languages", "performance"],
  level: "intermediate",
  goal: "Prepare a seminar talk on when graph databases are worth it",
};
const newPassword = () => crypto.randomBytes(12).toString("base64url"); // 16 chars

try {
  await connectDb();
  const host = env.MONGODB_URI.replace(/\/\/[^@]*@/, "//***@").split("?")[0];
  console.log(`Database: ${host}`);

  let user = await User.findOne({ email: EMAIL });
  let password = null;
  if (!user) {
    password = newPassword();
    ({ user } = await register({ name: "Demo Researcher", email: EMAIL, password }));
    console.log(`Created the demo user ${EMAIL}`);
  } else if (process.argv.includes("--reset-password")) {
    password = newPassword();
    user.passwordHash = await bcrypt.hash(password, 12);
    await user.save();
    console.log(`Reset the password of ${EMAIL}`);
  } else {
    console.log(`The demo user ${EMAIL} already exists; its password is unchanged (use --reset-password for a new one).`);
  }

  const existing = await Project.findOne({ name: PROJECT.name, "members.userId": user._id });
  if (existing) console.log(`The project "${PROJECT.name}" already exists (${existing.id}).`);
  else console.log(`Created the project "${PROJECT.name}" (${(await createProject(user, PROJECT)).id}).`);
  await drain(); // the initial interest-profile job

  if (password) {
    console.log(`\n  Email:    ${EMAIL}\n  Password: ${password}\n\n  This password is shown once. Store it in your password manager.`);
  }
  console.log(`
Presenter setup (do this before the demo, in the web app):
  1. Log in as ${EMAIL} and open "${PROJECT.name}".
  2. Sources → Add source → Web page: a vendor blog post that claims their graph database beats SQL
     (a real post you have chosen and read). Wait until it shows "ready" and its claims appear.
  3. Sources → Add source → PDF: a survey paper on graph databases that you own or that is open access.
  4. Check the Recommendations panel shows the first batch (five role-labelled, verified cards).
  5. Rehearse the walkthrough: ask in the chat "are graph databases actually faster than SQL?",
     review a link from a second browser, open the Graph tab, then Export → BibTeX.
`);
} catch (err) {
  console.error("Seeding failed:", err.message);
  process.exitCode = 1;
} finally {
  await disconnectDb().catch(() => {});
}
