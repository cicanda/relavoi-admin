"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/lib/auth-store";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, operator, hasHydrated } = useAdminAuth();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!token) router.replace("/login");
  }, [hasHydrated, token, router]);

  if (!hasHydrated) {
    return <div className="min-h-screen flex items-center justify-center text-fg-3 text-sm">Loading…</div>;
  }
  if (!token || !operator) return null;

  return <>{children}</>;
}
