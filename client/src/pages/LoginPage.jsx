import { Link } from "react-router";
import ServerStatusBanner from "../components/common/ServerStatusBanner.jsx";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <ServerStatusBanner />
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="card w-full max-w-sm">
          <h1 className="text-xl font-semibold text-navy">Log in to ProofChain</h1>
          <p className="mt-2 text-sm text-muted">
            No account?{" "}
            <Link to="/register" className="text-teal hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
