import { Link } from "react-router";
import { timeAgo } from "../../lib/format.js";

export default function ProjectCard({ project }) {
  return (
    <Link to={`/projects/${project.id}`} className="card block h-full transition duration-200 hover:-translate-y-0.5 hover:border-teal hover:shadow-md motion-reduce:hover:translate-y-0">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold leading-snug text-navy">{project.name}</h2>
        <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-xs capitalize text-muted">{project.role}</span>
      </div>
      {project.goal && <p className="mt-1 line-clamp-2 text-sm text-muted">{project.goal}</p>}
      {project.topics?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {project.topics.map((t) => (
            <span key={t} className="rounded-full bg-teal/10 px-2 py-0.5 text-xs text-teal">
              {t}
            </span>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        <span className="capitalize">{project.level}</span> · updated {timeAgo(project.updatedAt)}
      </p>
    </Link>
  );
}
