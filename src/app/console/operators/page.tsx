"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Edit, Lock, Trash2, UserPlus, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RolePill, StatePill } from "@/components/state-pill";
import { SkeletonRow } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { useAdminAuth } from "@/lib/auth-store";
import {
  createOperator,
  deactivateOperator,
  deleteOperator,
  listOperators,
  updateOperator,
} from "@/lib/api";
import { fmtRelative } from "@/lib/format";
import type { Operator, OperatorRole } from "@/lib/types";

const ROLES: OperatorRole[] = ["ROOT", "SRE", "SUPPORT", "VIEWER"];

interface ConfirmAction {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

export default function OperatorsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const role = useAdminAuth((s) => s.operator?.role);
  const currentId = useAdminAuth((s) => s.operator?.id);

  const operatorsQ = useQuery({
    queryKey: ["operators"],
    queryFn: listOperators,
    enabled: role === "ROOT",
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Operator | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const deactivateM = useMutation({
    mutationFn: (id: string) => deactivateOperator(id),
    onSuccess: () => {
      toast.success("Operator deactivated");
      qc.invalidateQueries({ queryKey: ["operators"] });
    },
    onError: (err) => {
      if (isAxiosError(err) && err.response?.status === 404) {
        toast.info("Endpoint coming soon", "Operator deactivation is not yet wired.");
      } else {
        toast.error(
          "Deactivate failed",
          err instanceof Error ? err.message : "Unknown error",
        );
      }
    },
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteOperator(id),
    onSuccess: () => {
      toast.success("Operator deleted");
      qc.invalidateQueries({ queryKey: ["operators"] });
    },
    onError: (err) => {
      if (isAxiosError(err) && err.response?.status === 404) {
        toast.info("Endpoint coming soon", "Operator deletion is not yet wired.");
      } else {
        toast.error(
          "Delete failed",
          err instanceof Error ? err.message : "Unknown error",
        );
      }
    },
  });

  if (role !== "ROOT") {
    return (
      <>
        <PageHeader
          title="Operators"
          description="Console users and their roles"
        />
        <div className="card card-pad py-14 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-full bg-rose-500/12 flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-rose-700" />
          </div>
          <h2 className="text-[22px] font-normal tracking-[-0.03em] text-fg">Access denied</h2>
          <p className="text-sm text-fg-2 mt-1.5 max-w-sm">
            You need ROOT role to manage operators.
          </p>
        </div>
      </>
    );
  }

  const operators = operatorsQ.data ?? [];

  function askDeactivate(op: Operator) {
    setConfirm({
      title: "Deactivate operator?",
      description: `${op.name || op.email} will lose console access. They can be reactivated later.`,
      confirmLabel: "Deactivate",
      onConfirm: async () => {
        await deactivateM.mutateAsync(op.id);
      },
    });
  }

  function askDelete(op: Operator) {
    setConfirm({
      title: "Delete operator?",
      description: `Permanently remove ${op.name || op.email} from the console. This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        await deleteM.mutateAsync(op.id);
      },
    });
  }

  return (
    <>
      <PageHeader
        title="Operators"
        description="Console users and their roles"
        actions={
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="btn btn-accent"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Operator
          </button>
        }
      />

      <div className="card overflow-hidden">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Last Login</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {operatorsQ.isLoading ? (
                <>
                  <SkeletonRow cols={6} />
                  <SkeletonRow cols={6} />
                  <SkeletonRow cols={6} />
                </>
              ) : operators.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 text-center text-sm text-fg-3"
                  >
                    No operators yet.
                  </td>
                </tr>
              ) : (
                operators.map((op) => {
                  const isSelf = op.id === currentId;
                  return (
                    <tr key={op.id}>
                      <Td className="font-medium text-[14px] tracking-[-0.01em]">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          {op.name || "—"}
                          {isSelf && (
                            <span className="badge badge-sm font-normal bg-ink-900 text-white">
                              you
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td className="font-mono text-fg-2 whitespace-nowrap">{op.email}</Td>
                      <td>
                        <RolePill role={op.role} />
                      </td>
                      <Td className="text-fg-2 whitespace-nowrap">
                        {fmtRelative(op.lastLoginAt)}
                      </Td>
                      <td>
                        <StatePill
                          state={op.isActive === false ? "EXPIRED" : "ACTIVE"}
                          size="sm"
                        />
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditTarget(op)}
                            className="btn btn-secondary btn-sm"
                          >
                            <Edit className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => askDeactivate(op)}
                            disabled={isSelf || deactivateM.isPending}
                            title={isSelf ? "Cannot deactivate yourself" : undefined}
                            className="btn btn-secondary btn-sm"
                          >
                            Deactivate
                          </button>
                          <button
                            type="button"
                            onClick={() => askDelete(op)}
                            disabled={isSelf || deleteM.isPending}
                            title={isSelf ? "Cannot delete yourself" : undefined}
                            className="btn btn-danger-soft btn-sm"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <AddOperatorModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            qc.invalidateQueries({ queryKey: ["operators"] });
          }}
        />
      )}

      {editTarget && (
        <EditOperatorModal
          operator={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}

      {confirm && (
        <ConfirmModal action={confirm} onClose={() => setConfirm(null)} />
      )}
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th>{children}</th>;
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={className}>
      {children}
    </td>
  );
}

function AddOperatorModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OperatorRole>("VIEWER");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const createM = useMutation({
    mutationFn: () => createOperator({ name, email, role, password }),
    onSuccess: () => {
      toast.success("Operator created", `${email} can now sign in.`);
      onCreated();
    },
    onError: (err) => {
      if (isAxiosError(err) && err.response?.status === 404) {
        toast.info("Endpoint coming soon", "Operator creation is not yet wired.");
      } else {
        toast.error(
          "Create failed",
          err instanceof Error ? err.message : "Unknown error",
        );
      }
    },
  });

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!name || !email || !password) {
      toast.error("Missing fields", "Name, email, and password are required.");
      return;
    }
    if (password.length < 12) {
      toast.error("Weak password", "Use at least 12 characters.");
      return;
    }
    setBusy(true);
    try {
      await createM.mutateAsync();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Add Operator" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="field w-full"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field font-mono w-full"
          />
        </Field>
        <Field label="Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as OperatorRole)}
            className="field w-full"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Password"
          hint={
            password.length === 0
              ? "≥12 chars"
              : password.length < 12
                ? `${password.length}/12 chars — too short`
                : "✓ length looks ok"
          }
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field font-mono w-full"
          />
        </Field>

        <div className="modal-actions pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="btn btn-accent"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function EditOperatorModal({
  operator,
  onClose,
}: {
  operator: Operator;
  onClose: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [role, setRole] = useState<OperatorRole>(operator.role);
  const [busy, setBusy] = useState(false);

  const updateM = useMutation({
    mutationFn: () => updateOperator(operator.id, { role }),
    onSuccess: () => {
      toast.success("Operator updated", `Role set to ${role}.`);
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Update failed", msg);
    },
  });

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    try {
      await updateM.mutateAsync();
    } catch {
      // toast handled in onError
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["operators"] });
    }
  }

  return (
    <ModalShell title="Edit Operator" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Name">
          <input
            type="text"
            defaultValue={operator.name}
            disabled
            className="field w-full"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            defaultValue={operator.email}
            disabled
            className="field font-mono w-full"
          />
        </Field>
        <Field label="Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as OperatorRole)}
            className="field w-full"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>

        <div className="modal-actions pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="btn btn-accent"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <div className="flex items-start justify-between gap-3 mb-5">
          <h3 className="modal-title">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn-xs -mr-1"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col min-w-0">
      <span className="field-label eyebrow">
        {label}
      </span>
      {children}
      {hint && <span className="text-[12px] text-fg-3 mt-1.5">{hint}</span>}
    </label>
  );
}

function ConfirmModal({
  action,
  onClose,
}: {
  action: ConfirmAction;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      await action.onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={action.title} onClose={onClose}>
      <p className="text-sm text-fg-2 mb-6 leading-relaxed">{action.description}</p>
      <div className="modal-actions">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="btn btn-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={go}
          disabled={busy}
          className={action.danger ? "btn btn-danger-soft" : "btn btn-accent"}
        >
          {busy ? "Working…" : action.confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
