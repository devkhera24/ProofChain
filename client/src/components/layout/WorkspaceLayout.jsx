import { useState } from "react";
import { NavLink, Routes, Route, Navigate } from "react-router";
import clsx from "clsx";

const TABS = ["graph", "claims", "sources", "review", "log"];
const PANELS = [
  { key: "left", label: "Chat" },
  { key: "center", label: "Workspace" },
  { key: "right", label: "Recommendations" },
];

export default function WorkspaceLayout({ project, role, left, right, views, badges = {} }) {
  const [panel, setPanel] = useState("center"); // which panel is visible below `lg`

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-white px-4 py-2">
        <h1 className="truncate font-semibold text-navy">{project.name}</h1>
        <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-xs capitalize text-muted">{role}</span>
        {/* presence (Step 29) · export (Step 30) */}
      </div>

      <nav className="flex border-b border-line bg-white lg:hidden">
        {PANELS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPanel(p.key)}
            className={clsx(
              "flex-1 py-2 text-sm",
              panel === p.key ? "border-b-2 border-navy font-medium text-navy" : "text-muted",
            )}
          >
            {p.label}
          </button>
        ))}
      </nav>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(280px,28%)_1fr_minmax(300px,28%)]">
        <aside className={clsx("min-h-0 border-r border-line bg-white lg:flex lg:flex-col", panel === "left" ? "flex flex-col" : "hidden")}>
          {left}
        </aside>
        <section className={clsx("min-h-0 flex-col lg:flex", panel === "center" ? "flex" : "hidden")}>
          <nav className="flex gap-1 overflow-x-auto border-b border-line bg-white px-3">
            {TABS.map((t) => (
              <NavLink
                key={t}
                to={`/projects/${project.id}/${t}`}
                className={({ isActive }) =>
                  `px-3 py-2 text-sm capitalize ${isActive ? "border-b-2 border-navy font-medium text-navy" : "text-muted"}`
                }
              >
                {t}
                {badges[t] > 0 && (
                  <span className="ml-1.5 rounded-full bg-disputed px-1.5 py-0.5 text-[10px] font-semibold text-white">{badges[t]}</span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <Routes>
              <Route index element={<Navigate to="claims" replace />} />
              {TABS.map((t) => (
                <Route key={t} path={`${t}/*`} element={views[t]} />
              ))}
              <Route path="*" element={<Navigate to="claims" replace />} />
            </Routes>
          </div>
        </section>
        <aside className={clsx("min-h-0 border-l border-line bg-white lg:flex lg:flex-col", panel === "right" ? "flex flex-col" : "hidden")}>
          {right}
        </aside>
      </div>
    </div>
  );
}
