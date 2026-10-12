import { useState } from "react";
import { Sparkles, UserRound } from "lucide-react";
import Tabs from "../ui/Tabs.jsx";
import RecommendationPanel from "./RecommendationPanel.jsx";
import ProfilePanel from "../profile/ProfilePanel.jsx";

const TABS = [
  { key: "recommendations", label: "Recommendations", icon: Sparkles },
  { key: "profile", label: "Profile", icon: UserRound },
];

export default function RightPanel() {
  const [tab, setTab] = useState("recommendations");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs variant="underline" fill layoutId="right-panel-tab" label="Right panel" value={tab} onChange={setTab} items={TABS} />
      {tab === "recommendations" ? <RecommendationPanel /> : <ProfilePanel />}
    </div>
  );
}
