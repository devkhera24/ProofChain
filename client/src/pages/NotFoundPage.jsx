import { Link } from "react-router";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold text-navy">Page not found</h1>
        <Link to="/projects" className="btn-primary mt-4">Back to projects</Link>
      </div>
    </div>
  );
}
