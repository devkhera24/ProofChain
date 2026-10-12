import { Outlet, Link } from "react-router";
import { LogOut } from "lucide-react";
import ServerStatusBanner from "../common/ServerStatusBanner.jsx";
import Logo from "../common/Logo.jsx";
import Button from "../ui/Button.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

export default function AppShell() {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <ServerStatusBanner />
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur">
        <Link to="/projects" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-teal/40">
          <Logo />
        </Link>
        <div className="flex items-center gap-3">
          <div id="header-right" />
          <span className="flex items-center gap-2 text-sm text-muted">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-navy/10 text-xs font-semibold text-navy" aria-hidden="true">
              {initials(user?.name)}
            </span>
            <span className="hidden sm:inline">{user?.name}</span>
          </span>
          <Button size="sm" icon={LogOut} onClick={logout}>
            Log out
          </Button>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
