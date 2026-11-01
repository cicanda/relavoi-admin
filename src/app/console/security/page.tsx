"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Check, Copy, KeyRound, ShieldCheck, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  confirmTotpEnrolment,
  getMfaStatus,
  startTotpEnrolment,
  type TotpEnrolmentOffer,
} from "@/lib/api";
import { clearPersistedAdminToken } from "@/lib/auth-store";

/**
 * Setting up the second factor on this operator account.
 *
 * Deliberately not a QR code. Rendering one needs an encoder, and the audit of
 * 1 November 2026 counted 35 advisories and four unused packages in the
 * backend tree, so a dependency to draw a square is not a trade worth making
 * for the handful of people who sign in here. Every authenticator app accepts
 * a typed secret, and the otpauth link below opens one directly on a phone.
 */
function groupSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          })
          .catch(() => setCopied(false));
      }}
      className="btn btn-secondary btn-sm shrink-0"
      aria-label={label}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function SecurityPage() {
  const router = useRouter();
  const [offer, setOffer] = useState<TotpEnrolmentOffer | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const status = useQuery({
    queryKey: ["mfa-status"],
    queryFn: getMfaStatus,
    retry: false,
  });

  function readError(err: unknown, fallback: string): string {
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { detail?: string; message?: string } | undefined;
      return data?.detail ?? data?.message ?? fallback;
    }
    return fallback;
  }

  async function onStart() {
    setError(null);
    setBusy(true);
    try {
      setOffer(await startTotpEnrolment());
    } catch (err) {
      setError(readError(err, "Could not start setup. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    setError(null);
    setBusy(true);
    try {
      const result = await confirmTotpEnrolment(code.trim());
      setRecoveryCodes(result.recoveryCodes);
      setCode("");
    } catch (err) {
      setError(readError(err, "That code was not accepted."));
    } finally {
      setBusy(false);
    }
  }

  function onDone() {
    // Confirming revokes the token that was only good for enrolling, so there
    // is nothing to do with the session that is still in the store.
    clearPersistedAdminToken();
    router.replace("/login");
  }

  const enrolled = status.data?.enrolled === true;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        description="The second factor on your own operator account."
      />

      {/* ── Already finished: the codes, shown once, then sign in again ── */}
      {recoveryCodes && (
        <section className="card p-6 space-y-4">
          <div className="flex items-start gap-3">
            <span className="icon-tile w-9 h-9 shrink-0">
              <KeyRound className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[16px] text-fg">Save your recovery codes</h2>
              <p className="text-[13px] text-fg-3 mt-1">
                These are the only way back in if you lose your authenticator. They are stored
                hashed, so this is the one time they can be shown. Each one works once.
              </p>
            </div>
          </div>

          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {recoveryCodes.map((rc) => (
              <li
                key={rc}
                className="font-mono text-[13px] text-fg bg-mute rounded-lg px-3 py-2 text-center tracking-wider"
              >
                {rc}
              </li>
            ))}
          </ul>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <CopyButton value={recoveryCodes.join("\n")} label="Copy all recovery codes" />
            <p className="text-[12px] text-fg-3">
              Keep them somewhere that is not this machine.
            </p>
          </div>

          <div className="pt-2 border-t border-line">
            <button type="button" onClick={onDone} className="btn btn-accent btn-sm">
              I have saved them, sign in again
            </button>
            <p className="text-[12px] text-fg-3 mt-2">
              Setup is complete. Signing in again is required because the session you are using
              now was only good for this page.
            </p>
          </div>
        </section>
      )}

      {/* ── Status ── */}
      {!recoveryCodes && (
        <section className="card p-6 space-y-4">
          <div className="flex items-start gap-3">
            <span className="icon-tile w-9 h-9 shrink-0">
              {enrolled ? (
                <ShieldCheck className="w-4 h-4" />
              ) : (
                <ShieldAlert className="w-4 h-4" />
              )}
            </span>
            <div className="min-w-0">
              <h2 className="text-[16px] text-fg">
                {status.isLoading
                  ? "Checking…"
                  : enrolled
                    ? "Authenticator is set up"
                    : "Authenticator is not set up yet"}
              </h2>
              <p className="text-[13px] text-fg-3 mt-1">
                {enrolled
                  ? `Signing in needs a six digit code. ${status.data?.recoveryCodesRemaining ?? 0} recovery code${(status.data?.recoveryCodesRemaining ?? 0) === 1 ? "" : "s"} left.`
                  : "Until this is done your session can reach this page and nothing else in the console."}
              </p>
            </div>
          </div>

          {enrolled && (
            <p className="text-[12px] text-fg-3">
              To replace it, ask a ROOT operator to reset your second factor. That is deliberate:
              otherwise a stolen session would be a way to swap the factor for one the thief
              controls.
            </p>
          )}

          {!enrolled && !offer && (
            <button
              type="button"
              onClick={() => void onStart()}
              disabled={busy}
              className="btn btn-accent btn-sm"
            >
              {busy ? "Starting…" : "Set up an authenticator"}
            </button>
          )}
        </section>
      )}

      {/* ── Enrolment ── */}
      {!recoveryCodes && offer && (
        <section className="card p-6 space-y-5">
          <div>
            <h2 className="text-[16px] text-fg">1. Add this to your authenticator</h2>
            <p className="text-[13px] text-fg-3 mt-1">
              Open your authenticator app, choose to add an account by entering a key, and type
              this in. On a phone, the link below opens the app directly.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <code className="font-mono text-[14px] text-fg bg-mute rounded-lg px-3 py-2.5 break-all tracking-wider flex-1">
                {groupSecret(offer.secret)}
              </code>
              <CopyButton value={offer.secret} label="Copy the key" />
            </div>
            <p className="text-[12px] text-fg-3">
              Spaces are for reading; type it with or without them. {offer.digits} digits, every{" "}
              {offer.periodSeconds} seconds, {offer.algorithm}.
            </p>
            <a
              href={offer.otpauthUri}
              className="text-[13px] text-signal-700 underline hover:no-underline inline-block"
            >
              Open in an authenticator app
            </a>
          </div>

          <div className="pt-4 border-t border-line space-y-3">
            <div>
              <h2 className="text-[16px] text-fg">2. Confirm the code it shows</h2>
              <p className="text-[13px] text-fg-3 mt-1">
                This proves the key arrived intact before it starts gating your sign-in.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                disabled={busy}
                className="field font-mono tracking-[0.3em] w-full sm:w-44"
                aria-label="Six digit code"
              />
              <button
                type="button"
                onClick={() => void onConfirm()}
                disabled={busy || code.trim().length < 6}
                className="btn btn-accent btn-sm shrink-0"
              >
                {busy ? "Checking…" : "Confirm"}
              </button>
            </div>
          </div>
        </section>
      )}

      {error && (
        <div
          role="alert"
          className="callout border-rose-500/30 bg-rose-500/10 text-rose-900 text-[13px]"
        >
          {error}
        </div>
      )}
    </div>
  );
}
