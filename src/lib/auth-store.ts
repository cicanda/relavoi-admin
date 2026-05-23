"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Operator } from "./types";

// IMPORTANT: per spec, the localStorage key is `nmaas_admin_token` (legacy name
// preserved across the NMaaS → Relavoi rename so existing operator sessions
// don't have to re-auth on rollout). All zustand-persist state lives under the
// same root key.
const STORAGE_KEY = "nmaas_admin_token";

interface AuthState {
  token: string | null;
  operator: Operator | null;
  hasHydrated: boolean;
  setHasHydrated: (b: boolean) => void;
  setSession: (args: { token: string; operator: Operator }) => void;
  clearSession: () => void;
}

export const useAdminAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      operator: null,
      hasHydrated: false,
      setHasHydrated: (b) => set({ hasHydrated: b }),
      setSession: ({ token, operator }) => set({ token, operator }),
      clearSession: () => set({ token: null, operator: null }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() =>
        typeof window === "undefined"
          ? { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
          : window.localStorage,
      ),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);

// Side-channel for the axios interceptor (no React context there).
export function readPersistedAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: string } };
    return parsed?.state?.token ?? null;
  } catch {
    return null;
  }
}

export function clearPersistedAdminToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
