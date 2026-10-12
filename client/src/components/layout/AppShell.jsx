import { Outlet, Link } from "react-router";
import ServerStatusBanner from "../common/ServerStatusBanner.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

export default function AppShell() {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <ServerStatusBanner />
      <header className="flex h-14 items-center justify-between border-b border-line bg-white px-4">
        <Link to="/projects" className="font-semibold text-navy">ProofChain</Link>
        <div className="flex items-center gap-3">
          <div id="header-right" />
          <span className="text-sm text-muted">{user?.name}</span>
          <button type="button" className="btn-ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
