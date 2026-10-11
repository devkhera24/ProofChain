import { Outlet, Link } from "react-router";
import ServerStatusBanner from "../common/ServerStatusBanner.jsx";

export default function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <ServerStatusBanner />
      <header className="flex h-14 items-center justify-between border-b border-line bg-white px-4">
        <Link to="/projects" className="font-semibold text-navy">ProofChain</Link>
        <div id="header-right" />
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
