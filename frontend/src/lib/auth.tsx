"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "./api";
import type { Me } from "./types";

interface AuthState {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  me: null, loading: true, refresh: async () => {}, logout: async () => {},
});

const PUBLIC = ["/login", "/register"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const path = usePathname();

  const refresh = useCallback(async () => {
    try {
      setMe(await api.get<Me>("/auth/me"));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Защищённые разделы перенаправляют неавторизованного пользователя на вход.
  useEffect(() => {
    if (!loading && !me && !PUBLIC.includes(path)) {
      router.replace("/login?next=" + encodeURIComponent(path));
    }
  }, [loading, me, path, router]);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => {});
    setMe(null);
    router.replace("/login");
  }, [router]);

  return <AuthContext.Provider value={{ me, loading, refresh, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export const isStaff = (role?: string) => role === "admin" || role === "dispatcher";
