import { Link } from "react-router";
import ServerStatusBanner from "../components/common/ServerStatusBanner.jsx";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <ServerStatusBanner />
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="card w-full max-w-sm">
          <h1 className="text-xl font-semibold text-navy">Create your account</h1>
          <p className="mt-2 text-sm text-muted">
            Already registered?{" "}
            <Link to="/login" className="text-teal hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
