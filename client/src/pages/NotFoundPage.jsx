import { Link } from "react-router";
import { motion } from "motion/react";
import { Compass } from "lucide-react";
import { fade } from "../lib/motion.js";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <motion.div {...fade} className="card flex w-full max-w-sm flex-col items-center p-8 text-center">
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-teal/10 text-teal">
          <Compass size={22} aria-hidden="true" />
        </span>
        <h1 className="text-xl font-semibold text-navy">Page not found</h1>
        <p className="mt-1 text-sm text-muted">The link may be old, or the project was deleted.</p>
        <Link to="/projects" className="btn-primary mt-5">
          Back to projects
        </Link>
      </motion.div>
    </div>
  );
}
