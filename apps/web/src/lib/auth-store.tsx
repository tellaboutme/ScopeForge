"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { UsagePublic, UserPublic } from "@/types/auth";
import {
  type LoginPayload,
  type RegisterPayload,
  fetchMe,
  fetchUsage,
  loginAccount,
  logoutAccount,
  registerAccount
} from "@/lib/api";
import { analysisStore } from "@/lib/analysis-store";
import { historyStore } from "@/lib/history-store";
import { settingsStore } from "@/lib/settings-store";

// Phase 9 (D037) — a single React context tracking the signed-in account
// (or null for anonymous, which is still a fully supported first-class
// state per D004/D037, not an error). Anything that needs to know "is
// someone signed in" (UserMenu, /billing, /analyze's usage-limit upsell)
// reads from here instead of each independently calling fetchMe().
//
// D039: also tracks the current usage-vs-limit snapshot (GET /v1/usage),
// which works for anonymous callers too (installation-id-scoped) — this is
// what powers the sidebar usage plaque restored above UserMenu. Kept in the
// same context as `user` rather than a separate provider since both need to
// refresh together on login/logout and both are read from the same places
// (sidebar, billing, settings).
interface AuthContextValue {
  user: UserPublic | null;
  usage: UsagePublic | null;
  status: "loading" | "ready";
  login(payload: LoginPayload): Promise<UserPublic>;
  register(payload: RegisterPayload): Promise<UserPublic>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  refreshUsage(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [usage, setUsage] = useState<UsagePublic | null>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  const refreshUsage = useCallback(async () => {
    try {
      const result = await fetchUsage();
      setUsage(result);
    } catch {
      // Usage is a nice-to-have display, not a gate on anything — a failed
      // fetch (e.g. API briefly unreachable) just leaves the plaque showing
      // its last-known value rather than breaking the rest of the app.
    }
  }, []);

  const refresh = useCallback(async () => {
    const me = await fetchMe();
    setUser(me);
    await refreshUsage();
  }, [refreshUsage]);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        // Network/server error resolving the session — treat as anonymous
        // rather than blocking the whole app on an auth check that isn't
        // required to use the product (D004/D037).
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setStatus("ready");
      });
    void refreshUsage();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const me = await loginAccount(payload);
      setUser(me);
      await refreshUsage();
      return me;
    },
    [refreshUsage]
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const me = await registerAccount(payload);
      setUser(me);
      await refreshUsage();
      return me;
    },
    [refreshUsage]
  );

  const logout = useCallback(async () => {
    await logoutAccount();

    // D043 — logout must feel instant and total, not just swap the account
    // badge while every other page keeps showing the old account's data.
    // history/settings/analyses are plain localStorage shared by anonymous
    // and signed-in use alike (D016) — nothing scopes them per-account — so
    // whatever the signed-out account saved has to be wiped here, or the
    // next person on this browser (or the same person back in anonymous
    // mode) would still see it.
    //
    // Deliberately NOT touched: installation.ts's scopeforge.installation-id.
    // That id is the anonymous usage-quota key (D004/D039); wiping it on
    // logout would hand back a full free quota just by signing out — exactly
    // the abuse path D039's IP-hash secondary tracking exists to close.
    // Logout signs the account out, it does not reset usage limits.
    historyStore.clear();
    settingsStore.reset();
    analysisStore.clear();

    setUser(null);
    await refreshUsage();

    // Several pages (/history, /settings) seed their state once at mount
    // (historyStore.list()/settingsStore.load() read once into
    // useState/useRef, never again) — a plain setUser(null) leaves stale
    // account data on screen if one of them is open when logout fires. A
    // soft router.push() wouldn't reliably fix that either: pushing to a
    // route the user is already on doesn't force a remount, so logging out
    // from directly on /analyze could still leave stale settings-derived
    // form defaults in place. A hard navigation is the only thing that
    // guarantees every page — the one the user was just on and the whole
    // AuthProvider tree itself — mounts fresh from the now-cleared state,
    // regardless of which route logout was triggered from.
    window.location.assign("/analyze");
  }, [refreshUsage]);

  const value: AuthContextValue = { user, usage, status, login, register, logout, refresh, refreshUsage };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() must be used within an AuthProvider");
  return ctx;
}
