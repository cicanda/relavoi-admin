"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, ExternalLink, FileText, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  approveTenantKyb,
  getKybDocumentUrl,
  getTenantKyb,
  rejectTenantKyb,
  type KybDocument,
  type KybDocumentKind,
  type KybStatus,
} from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { ConfirmDialog } from "@/components/console/confirm-dialog";

const KIND_LABELS: Record<KybDocumentKind, string> = {
  REGISTRATION_CERTIFICATE: "Certificate of registration",
  OWNER_ID: "Director or owner ID",
  STATUS_REPORT: "CAC status report",
  MEMART: "MEMART",
  PROOF_OF_ADDRESS: "Proof of address",
  OTHER: "Other document",
};

const REGISTRATION_LABELS: Record<string, string> = {
  COMPANY: "Limited company (RC)",
  BUSINESS_NAME: "Business name (BN)",
  OTHER: "Other",
};

/** Minimum the server enforces on a rejection reason. */
const MIN_REASON = 10;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function extractError(err: unknown, fallback = "Request failed."): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === "string" && detail ? detail : fallback;
}

function StatusChip({ status }: { status: KybStatus }) {
  const map: Record<KybStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    APPROVED: {
      label: "Approved",
      cls: "bg-emerald-500/10 text-emerald-800 border-emerald-500/30",
      Icon: ShieldCheck,
    },
    PENDING: {
      label: "Pending review",
      cls: "bg-amber-500/10 text-amber-800 border-amber-500/30",
      Icon: Clock,
    },
    REJECTED: {
      label: "Rejected",
      cls: "bg-red-500/10 text-red-700 border-red-500/30",
      Icon: ShieldAlert,
    },
    NOT_SUBMITTED: {
      label: "Not submitted",
      cls: "bg-sunken text-fg-2 border-line",
      Icon: ShieldAlert,
    },
  };
  const { label, cls, Icon } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium whitespace-nowrap ${cls}`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow text-fg-3">{label}</div>
      <div className="text-[14px] text-fg mt-1 break-words">{value ?? "Not set"}</div>
    </div>
  );
}

/** One document, opened through a presigned URL fetched on click. */
function DocumentRow({ doc }: { doc: KybDocument }) {
  const toast = useToast();
  const [opening, setOpening] = useState(false);

  async function open() {
    setOpening(true);
    try {
      const { url } = await getKybDocumentUrl(doc.id);
      // New tab. The URL is short-lived and single-purpose; it is never
      // rendered into the page or kept in component state.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error("Could not open document", extractError(err));
    } finally {
      setOpening(false);
    }
  }

  return (
    <li className="flex items-center gap-3 py-3 border-t border-line first:border-t-0">
      <span className="icon-tile w-9 h-9">
        <FileText className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] text-fg break-words">{KIND_LABELS[doc.kind]}</div>
        <div className="text-[12px] text-fg-3 break-all mt-0.5">
          {doc.filename} · {fmtBytes(doc.sizeBytes)} ·{" "}
          {new Date(doc.uploadedAt).toLocaleDateString()}
        </div>
        <div className="text-[10px] font-mono text-fg-3 break-all mt-0.5">
          sha256 {doc.sha256.slice(0, 16)}…
        </div>
      </div>
      <button
        type="button"
        onClick={() => void open()}
        disabled={opening}
        className="btn btn-secondary btn-sm shrink-0"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        {opening ? "Opening…" : "Open"}
      </button>
    </li>
  );
}

/**
 * The operator's view of one business's verification.
 *
 * Reading a document is an audited access to someone's identity papers, so the
 * presigned URL is fetched per click rather than handed out with the list. The
 * decision buttons appear only while the application is PENDING, which is also
 * the only state the server will act on.
 */
export function KybPanel({ tenantId, canDecide }: { tenantId: string; canDecide: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");

  const q = useQuery({
    queryKey: ["tenant-kyb", tenantId],
    queryFn: () => getTenantKyb(tenantId),
  });

  const approveMut = useMutation({
    mutationFn: () => approveTenantKyb(tenantId),
    onSuccess: () => {
      toast.success("Business approved", "The workspace can now activate live mode.");
      setConfirm(null);
      void qc.invalidateQueries({ queryKey: ["tenant-kyb", tenantId] });
      void qc.invalidateQueries({ queryKey: ["kyb-queue"] });
    },
    onError: (err) => toast.error("Could not approve", extractError(err)),
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectTenantKyb(tenantId, reason.trim()),
    onSuccess: () => {
      toast.success("Business rejected", "They can correct it and resubmit.");
      setConfirm(null);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["tenant-kyb", tenantId] });
      void qc.invalidateQueries({ queryKey: ["kyb-queue"] });
    },
    onError: (err) => toast.error("Could not reject", extractError(err)),
  });

  if (q.isLoading) {
    return (
      <div className="card card-pad mb-[var(--gap)]">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-full mt-3" />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="card card-pad mb-[var(--gap)] text-sm text-fg-2">
        Could not load business verification for this tenant.
      </div>
    );
  }

  const k = q.data;
  const d = k.details;
  const pending = k.status === "PENDING";

  return (
    <section className="card mb-[var(--gap)]">
      <div className="card-head card-head-ruled flex-wrap">
        <div className="min-w-0">
          <h2 className="card-title">Business verification</h2>
          <p className="card-sub">
            {k.submittedAt
              ? `Submitted ${new Date(k.submittedAt).toLocaleString()}`
              : "Never submitted"}
            {k.reviewedAt && ` · reviewed ${new Date(k.reviewedAt).toLocaleString()}`}
            {k.reviewedBy && ` by ${k.reviewedBy.email}`}
          </p>
        </div>
        <StatusChip status={k.status} />
      </div>

      <div className="card-pad space-y-6">
        {k.status === "REJECTED" && k.rejectionReason && (
          <div className="callout border-red-500/30 bg-red-500/[0.07]">
            <div className="text-[12px] font-medium text-red-700">Rejection reason</div>
            <p className="text-[12px] text-red-800/90 mt-1 whitespace-pre-wrap break-words">
              {k.rejectionReason}
            </p>
          </div>
        )}

        {(k.missingDetails.length > 0 || k.missingKinds.length > 0) && k.status !== "APPROVED" && (
          <div className="callout border-amber-500/30 bg-amber-500/10 text-amber-900 space-y-0.5">
            {k.missingDetails.length > 0 && (
              <div>Missing details: {k.missingDetails.join(", ")}</div>
            )}
            {k.missingKinds.length > 0 && (
              <div>
                Missing documents: {k.missingKinds.map((x) => KIND_LABELS[x]).join(", ")}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-5 gap-y-5">
          <Field label="Registered name" value={d.legalName} />
          <Field
            label="Registration"
            value={
              d.registrationNumber
                ? `${d.registrationNumber}${
                    d.registrationType ? ` · ${REGISTRATION_LABELS[d.registrationType]}` : ""
                  }`
                : null
            }
          />
          <Field label="Registered address" value={d.registeredAddress} />
          <Field
            label="City and state"
            value={[d.city, d.state].filter(Boolean).join(", ") || null}
          />
          <Field label="Contact name" value={d.contactName} />
          <Field label="Contact phone" value={d.contactPhone} />
          <Field label="Website" value={d.website} />
          <Field label="Workspace mode" value={k.mode} />
        </div>

        <div>
          <h3 className="eyebrow text-fg-3 mb-2">
            Documents ({k.documents.length})
          </h3>
          {k.documents.length === 0 ? (
            <p className="text-[12px] text-fg-3 py-2">No documents uploaded.</p>
          ) : (
            <ul>
              {k.documents.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} />
              ))}
            </ul>
          )}
        </div>

        {pending && (
          <div className="pt-5 border-t border-line flex flex-col sm:flex-row gap-2 sm:justify-end">
            {!canDecide ? (
              <p className="text-[12px] text-fg-3">
                Viewing only. Approving or rejecting requires SRE or ROOT.
              </p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConfirm("reject")}
                  className="btn btn-danger-soft"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm("approve")}
                  className="btn btn-primary"
                >
                  Approve
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirm === "approve"}
        title="Approve this business?"
        description={
          <>
            <span className="text-fg">{d.legalName ?? k.workspaceName}</span> will be able to
            activate live mode and place real, billable calls carrying real subscriber numbers.
          </>
        }
        confirmLabel="Approve"
        busy={approveMut.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => approveMut.mutate()}
      />

      <ConfirmDialog
        open={confirm === "reject"}
        title="Reject this submission?"
        danger
        description="The reason is shown to the business verbatim. They can correct the application and resubmit."
        confirmLabel="Reject"
        busy={rejectMut.isPending}
        disabled={reason.trim().length < MIN_REASON}
        onCancel={() => {
          setConfirm(null);
          setReason("");
        }}
        onConfirm={() => rejectMut.mutate()}
      >
        <label className="block text-[13px] font-medium text-fg-2 mb-2">
          Reason (at least {MIN_REASON} characters)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="The certificate of registration is illegible. Please upload a clearer scan."
          className="field w-full"
        />
        <div className="mt-1.5 text-[12px] text-fg-3">
          {reason.trim().length < MIN_REASON
            ? `${MIN_REASON - reason.trim().length} more characters needed`
            : `${reason.trim().length} characters`}
        </div>
      </ConfirmDialog>
    </section>
  );
}
