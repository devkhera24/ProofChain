import { Routes, Route } from "react-router";
import ClaimsList from "./ClaimsList.jsx";
import ClaimDetail from "./ClaimDetail.jsx";

export default function ClaimsTab() {
  return (
    <Routes>
      <Route index element={<ClaimsList />} />
      <Route path=":claimId" element={<ClaimDetail />} />
    </Routes>
  );
}
