import { Routes, Route } from "react-router";
import SourcesList from "./SourcesList.jsx";
import SourceViewer from "./SourceViewer.jsx";

export default function SourcesTab() {
  return (
    <Routes>
      <Route index element={<SourcesList />} />
      <Route path=":sourceId" element={<SourceViewer />} />
    </Routes>
  );
}
