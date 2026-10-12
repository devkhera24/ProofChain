import { useState } from "react";
import { NavLink, Routes, Route, Navigate, useLocation } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { FileText, Inbox, ListChecks, Network, ScrollText } from "lucide-react";
import clsx from "clsx";
import Tabs from "../ui/Tabs.jsx";
import { page, spring } from "../../lib/motion.js";

const TABS = [
  { key: "graph", icon: Network },
  { key: "claims", icon: ListChecks },
  { key: "sources", icon: FileText },
  { key: "review", icon: Inbox },
  { key: "log", icon: ScrollText },
];
const PANELS = [
  { key: "left", label: "Chat" },
  { key: "center", label: "Workspace" },
  { key: "right", label: "Recommendations" },
];

export default function WorkspaceLayout({ project, role, left, right, views, badges = {} }) {
  const [panel, setPanel] = useState("center"); // which panel is visible below `lg`
  const { pathname } = useLocation();

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-white px-4 py-2">
        <h1 className="truncate font-semibold tracking-tight text-navy">{project.name}</h1>
        <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-xs capitalize text-muted">{role}</span>
        {/* presence (Step 29) · export (Step 30) */}
      </div>

      <Tabs variant="underline" fill className="bg-white lg:hidden" layoutId="mobile-panel" label="Panels" value={panel} onChange={setPanel} items={PANELS} />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(280px,28%)_1fr_minmax(300px,28%)]">
        <aside className={clsx("min-h-0 border-r border-line bg-white lg:flex lg:flex-col", panel === "left" ? "flex flex-col" : "hidden")}>
          {left}
        </aside>
        <section className={clsx("min-h-0 flex-col lg:flex", panel === "center" ? "flex" : "hidden")}>
          <nav className="flex gap-1 overflow-x-auto border-b border-line bg-white px-3" aria-label="Workspace views">
            {TABS.map(({ key, icon: Icon }) => (
              <NavLink
                key={key}
                to={`/projects/${project.id}/${key}`}
                className={({ isActive }) =>
                  clsx(
                    "relative inline-flex items-center gap-1.5 px-3 py-2.5 text-sm capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40",
                    isActive ? "font-medium text-navy" : "text-muted hover:text-ink",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={15} aria-hidden="true" />
                    {key}
                    <AnimatePresence>
                      {badges[key] > 0 && (
                        <motion.span
                          key="badge"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          transition={spring}
                          className="rounded-full bg-disputed px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white"
                        >
                          {badges[key]}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {isActive && <motion.span layoutId="workspace-tab" transition={spring} className="absolute inset-x-0 -bottom-px h-0.5 bg-navy" />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          {/* Keyed by path so each view (and list → detail) fades in; no exit, so routes never render twice */}
          <motion.div key={pathname} {...page} className="min-h-0 flex-1 overflow-auto p-4 lg:p-6">
            <Routes>
              <Route index element={<Navigate to="claims" replace />} />
              {TABS.map(({ key }) => (
                <Route key={key} path={`${key}/*`} element={views[key]} />
              ))}
              <Route path="*" element={<Navigate to="claims" replace />} />
            </Routes>
          </motion.div>
        </section>
        <aside className={clsx("min-h-0 border-l border-line bg-white lg:flex lg:flex-col", panel === "right" ? "flex flex-col" : "hidden")}>
          {right}
        </aside>
      </div>
    </div>
  );
}
