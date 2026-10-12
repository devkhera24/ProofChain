import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../../context/AuthContext.jsx";
import Spinner from "../common/Spinner.jsx";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Loading your account…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
