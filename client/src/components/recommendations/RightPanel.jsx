import { useState } from "react";
import clsx from "clsx";
import RecommendationPanel from "./RecommendationPanel.jsx";
import ProfilePanel from "../profile/ProfilePanel.jsx";

const TABS = [
  ["recommendations", "Recommendations"],
  ["profile", "Profile"],
];

export default function RightPanel() {
  const [tab, setTab] = useState("recommendations");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex border-b border-line" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={clsx("flex-1 py-2 text-sm", tab === key ? "border-b-2 border-navy font-medium text-navy" : "text-muted")}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "recommendations" ? <RecommendationPanel /> : <ProfilePanel />}
    </div>
  );
}
