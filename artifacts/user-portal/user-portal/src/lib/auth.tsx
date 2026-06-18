import { createContext, useContext, useEffect, useState } from "react";
import { get, post } from "./api";

type User = {
  id: number;
  email: string;
  fullName: string;
  name?: string;
  phone?: string | null;
  role: string;
  kycLevel?: number;
  vipTier?: number;
  referralCode?: string;
  referredBy?: number | null;
  status?: string;
  twoFaEnabled?: boolean;
  loginEmailOtpEnabled?: boolean;
  loginPhoneOtpEnabled?: boolean;
  uid?: string;
  avatarUrl?: string | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
};

// Returned by /auth/login or /auth/register when admin policy / user prefs
// require additional verification (email OTP, phone OTP, 2FA). The caller
// must complete the matching /auth/{login|register}/verify endpoint to
// actually receive a session cookie.
export type AuthChallenge = {
  token: string;
  purpose: "login" | "signup";
  requires: { email: boolean; phone: boolean; twofa: boolean };
  maskedEmail: string | null;
  maskedPhone: string | null;
  email?: string;     // present for signup so the OTP /send call can use it
  phone?: string | null;
};

export type AuthResult =
  | { kind: "ok"; user: User }
  | { kind: "challenge"; challenge: AuthChallenge };

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (data: any) => Promise<AuthResult>;
  signup: (data: any) => Promise<AuthResult>;
  logout: () => Promise<void>;
  setUser: (u: User | null) => void;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Roles that belong to the admin panel — they MUST NOT be allowed to use
// the user-portal. If such a session is detected we silently log them out.
const STAFF_ROLES = new Set(["admin", "superadmin", "support"]);
const isStaff = (u: { role?: string } | null | undefined) =>
  !!u?.role && STAFF_ROLES.has(String(u.role).toLowerCase());

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get("/auth/me")
      .then(async (data: any) => {
        if (isStaff(data?.user)) {
          // Admin/staff session leaked into the user-portal tab. Kill it.
          try { await post("/auth/logout"); } catch { /* noop */ }
          setUser(null);
          return;
        }
        setUser(data.user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = async (data: any): Promise<AuthResult> => {
    const res: any = await post("/auth/login", data);
    if (res?.challenge) {
      return { kind: "challenge", challenge: res.challenge as AuthChallenge };
    }
    if (isStaff(res?.user)) {
      // Don't keep the staff session alive in the user-portal cookie jar.
      try { await post("/auth/logout"); } catch { /* noop */ }
      setUser(null);
      throw new Error("Admin accounts cannot sign in here. Please use the admin panel.");
    }
    setUser(res.user);
    return { kind: "ok", user: res.user };
  };

  const signup = async (data: any): Promise<AuthResult> => {
    const res: any = await post("/auth/register", data);
    if (res?.challenge) {
      return { kind: "challenge", challenge: res.challenge as AuthChallenge };
    }
    setUser(res.user);
    return { kind: "ok", user: res.user };
  };

  const logout = async () => {
    try { await post("/auth/logout"); } catch { /* noop */ }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

import { useLocation } from "wouter";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      setLocation("/login");
    }
  }, [user, loading, setLocation]);

  if (loading) return null;
  if (!user) return null;

  return <>{children}</>;
}
