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
  // Revealed only once the server has said it wants one, so an operator who
  // has not enrolled never sees a field they cannot fill in.
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");

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
      const res = await adminLogin(email.trim(), password, code.trim() || undefined);
      setSession({ token: res.accessToken, operator: res.operator });
      // A token issued before enrolment is finished can do nothing else, so
      // there is no point sending them to a console that would refuse them.
      router.push(res.mfa?.enrolmentRequired ? "/console/security" : "/console/overview");
    } catch (err: unknown) {
      let msg = "Sign in failed. Check your credentials and try again.";
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const data = err.response?.data as
          | { message?: string; detail?: string; type?: string; retryAfterSeconds?: number }
          | undefined;
        const slug = data?.type ?? "";

        if (slug.includes("totp-required")) {
          // First time round the password was right and the code was missing.
          // Reveal the field and say so, rather than reporting a failure.
          setNeedsCode(true);
          msg = "Enter the six digit code from your authenticator.";
        } else if (slug.includes("totp-invalid")) {
          setNeedsCode(true);
          msg = "That code is not valid. Wait for the next one and try again.";
          setCode("");
        } else if (slug.includes("account-locked")) {
          const seconds = data?.retryAfterSeconds ?? 0;
          const minutes = Math.ceil(seconds / 60);
          msg = `Too many failed attempts. This account is locked for about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
        } else if (status === 401 || status === 403) {
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

  // On the ink panel the inputs are translucent; 16px text below desktop so
  // iOS does not zoom on focus.
  const inputCls =
    "w-full min-h-[var(--control-h)] bg-white/[0.06] border border-white/10 text-white rounded-[14px] text-[length:var(--field-size)] placeholder:text-ink-500 hover:border-white/20 focus:outline-none focus:border-signal-500 focus:bg-white/[0.08] focus:ring-[3px] focus:ring-signal-500/25 transition-colors disabled:opacity-60";

  return (
    <div className="min-h-screen w-full bg-canvas flex items-center justify-center px-4 py-10">
      <div className="panel-dark relative w-full max-w-[440px] rounded-[var(--radius-panel)] shadow-[var(--shadow-pop)] p-[clamp(1.5rem,1rem+2.5vw,2.5rem)] animate-rise overflow-hidden">
        <div className="flex flex-col items-center text-center mb-8">
          <h1 className="sr-only">Relavoi</h1>
          <BrandLogo height={44} />
          <p className="eyebrow text-ink-400 mt-4">Operator Console</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          {error && (
            <div
              role="alert"
              className="bg-rose-500/15 border border-rose-500/30 text-rose-200 text-sm rounded-[14px] px-3.5 py-2.5"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block eyebrow text-ink-400 mb-2"
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
              className={`${inputCls} px-4`}
              placeholder="operator@relavoi.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block eyebrow text-ink-400 mb-2"
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
                className={`${inputCls} pl-4 pr-12`}
                placeholder="••••••••"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-ink-400 hover:text-white rounded-full transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {needsCode && (
            <div>
              <label htmlFor="totp" className="block eyebrow text-ink-400 mb-2">
                Authenticator code
              </label>
              <input
                id="totp"
                name="totp"
                // One-time-code tells a phone keyboard to offer the code it has
                // just seen, and inputMode numeric keeps it to a keypad.
                autoComplete="one-time-code"
                inputMode="numeric"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={submitting}
                className={`${inputCls} px-4 tracking-[0.3em] font-mono`}
                placeholder="000000"
              />
              <p className="text-[12px] text-ink-400 mt-2">
                Or enter one of your recovery codes.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !email || !password || (needsCode && !code.trim())}
            className="btn btn-accent w-full min-h-12 text-sm"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
