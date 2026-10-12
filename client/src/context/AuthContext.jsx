import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authApi } from "../api/auth.js";
import { tokenStore, setUnauthorizedHandler } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    qc.clear();
  }, [qc]);

  useEffect(() => setUnauthorizedHandler(logout), [logout]);

  useEffect(() => {
    if (!tokenStore.get()) return;
    authApi
      .me()
      .then(setUser)
      // Only a 401 means the token is bad; a network error (e.g. server waking up) keeps it for the next try
      .catch((err) => err.response?.status === 401 && logout())
      .finally(() => setLoading(false));
  }, [logout]);

  const handleAuth = ({ user, token }) => {
    tokenStore.set(token);
    setUser(user);
  };

  const value = {
    user,
    loading,
    login: async (data) => handleAuth(await authApi.login(data)),
    register: async (data) => handleAuth(await authApi.register(data)),
    logout,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
