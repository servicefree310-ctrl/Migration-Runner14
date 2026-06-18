import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { get, post } from "./api";

export type AdminUser = {
  id: number;
  email: string;
  name: string;
  role: string;
  uid: string;
};

type AuthContextValue = {
  user: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await get<{ user: AdminUser }>("/auth/me");
      const ok = ["support", "finance", "compliance", "marketing", "admin", "superadmin"].includes(res.user.role);
      setUser(ok ? res.user : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const login = async (email: string, password: string) => {
    const res = await post<{ user: AdminUser }>("/auth/login", { email, password });
    if (!["admin", "superadmin", "support", "finance", "compliance", "marketing"].includes(res.user.role)) {
      await post("/auth/logout");
      throw new Error("You do not have permission to access the admin panel");
    }
    setUser(res.user);
  };

  const logout = async () => {
    try { await post("/auth/logout"); } catch { /* noop */ }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be inside AuthProvider");
  return v;
}
