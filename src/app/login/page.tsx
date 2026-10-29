"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import axios from "axios";
import { BrandLogo } from "@/components/brand-mark";
import { useAdminAuth } from "@/lib/auth-store";
import { adminLogin } from "@/lib/api";

export default function OperatorLoginPage() {
  const router = useRouter();
  const { token, hasHydrated, setSession } = useAdminAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If a token is already in the store, bounce straight to the console.
  useEffect(() => {
    if (!hasHydrated) return;
    if (token) router.replace("/console/overview");
  }, [token, hasHydrated, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await adminLogin(email.trim(), password);
      setSession({ token: res.accessToken, operator: res.operator });
      router.push("/console/overview");
    } catch (err: unknown) {
      let msg = "Sign in failed. Check your credentials and try again.";
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const data = err.response?.data as { message?: string; detail?: string } | undefined;
        if (status === 401 || status === 403) {
          msg = data?.message ?? data?.detail ?? "Invalid email or password.";
        } else if (status === 429) {
          msg = "Too many attempts. Please wait a moment and try again.";
        } else if (data?.message || data?.detail) {
          msg = data.message ?? data.detail ?? msg;
        }
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-ink-900 flex items-center justify-center px-4">
      <div className="bg-ink-800 border border-ink-700 max-w-md w-full p-8 rounded-[10px] shadow-card">
        <div className="flex flex-col items-center text-center mb-6">
          <h1 className="sr-only">Relavoi</h1>
          <BrandLogo height={48} />
          <p className="text-sm text-ink-400 mt-3">Operator Console</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="bg-rose-500/15 border border-rose-500/30 text-rose-400 text-sm rounded-md px-3 py-2"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-[11px] font-mono uppercase tracking-wider text-ink-400 mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              className="w-full h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors disabled:opacity-60"
              placeholder="operator@relavoi.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[11px] font-mono uppercase tracking-wider text-ink-400 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="w-full h-9 pl-3 pr-10 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors disabled:opacity-60"
                placeholder="••••••••"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 hover:text-paper p-1 rounded transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="w-full bg-signal-500 text-ink-900 h-10 rounded-md font-medium hover:bg-signal-600 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
