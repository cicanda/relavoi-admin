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
        <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-10 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-rose-500/15 flex items-center justify-center mb-3">
            <Lock className="w-6 h-6 text-rose-400" />
          </div>
          <h2 className="text-lg font-semibold text-paper">Access denied</h2>
          <p className="text-sm text-ink-400 mt-1 max-w-sm">
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
            className="bg-signal-500 text-ink-900 px-4 h-10 rounded-md font-medium hover:bg-signal-600 text-sm transition-colors flex items-center gap-2"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Operator
          </button>
        }
      />

      <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
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
                    className="px-4 py-8 border-t border-ink-700 text-center text-sm text-ink-500"
                  >
                    No operators yet.
                  </td>
                </tr>
              ) : (
                operators.map((op) => {
                  const isSelf = op.id === currentId;
                  return (
                    <tr
                      key={op.id}
                      className="hover:bg-ink-900/60 transition-colors"
                    >
                      <Td>
                        <div className="flex items-center gap-2">
                          {op.name || "—"}
                          {isSelf && (
                            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-500 border border-ink-700 rounded px-1.5 py-0.5">
                              you
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td className="font-mono text-ink-300">{op.email}</Td>
                      <td className="px-4 py-3 border-t border-ink-700">
                        <RolePill role={op.role} />
                      </td>
                      <Td className="text-ink-400">
                        {fmtRelative(op.lastLoginAt)}
                      </Td>
                      <td className="px-4 py-3 border-t border-ink-700">
                        <StatePill
                          state={op.isActive === false ? "EXPIRED" : "ACTIVE"}
                          size="sm"
                        />
                      </td>
                      <td className="px-4 py-3 border-t border-ink-700">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditTarget(op)}
                            className="bg-ink-800 border border-ink-700 text-paper px-2 h-7 rounded-md hover:bg-ink-700 text-[11px] transition-colors flex items-center gap-1"
                          >
                            <Edit className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => askDeactivate(op)}
                            disabled={isSelf || deactivateM.isPending}
                            title={isSelf ? "Cannot deactivate yourself" : undefined}
                            className="bg-ink-800 border border-ink-700 text-paper px-2 h-7 rounded-md hover:bg-ink-700 text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Deactivate
                          </button>
                          <button
                            type="button"
                            onClick={() => askDelete(op)}
                            disabled={isSelf || deleteM.isPending}
                            title={isSelf ? "Cannot delete yourself" : undefined}
                            className="bg-rose-500/15 text-rose-400 border border-rose-500/30 px-2 h-7 rounded-md hover:bg-rose-500/25 text-[11px] transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
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
  return (
    <th className="bg-ink-900 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200 ${className}`}
    >
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
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 w-full"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] font-mono focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 w-full"
          />
        </Field>
        <Field label="Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as OperatorRole)}
            className="h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 w-full"
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
            className="h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] font-mono focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 w-full"
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="bg-ink-800 border border-ink-700 text-paper px-3 h-9 rounded-md hover:bg-ink-700 text-sm transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="bg-signal-500 text-ink-900 px-4 h-10 rounded-md font-medium hover:bg-signal-600 text-sm transition-colors disabled:opacity-50"
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
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input
            type="text"
            defaultValue={operator.name}
            disabled
            className="h-9 px-3 bg-ink-900 border border-ink-700 text-ink-400 rounded-md text-[13px] w-full"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            defaultValue={operator.email}
            disabled
            className="h-9 px-3 bg-ink-900 border border-ink-700 text-ink-400 rounded-md text-[13px] font-mono w-full"
          />
        </Field>
        <Field label="Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as OperatorRole)}
            className="h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 w-full"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="bg-ink-800 border border-ink-700 text-paper px-3 h-9 rounded-md hover:bg-ink-700 text-sm transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="bg-signal-500 text-ink-900 px-4 h-10 rounded-md font-medium hover:bg-signal-600 text-sm transition-colors disabled:opacity-50"
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
    <div className="fixed inset-0 z-40 bg-ink-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-6 max-w-md w-full">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-base font-semibold text-paper">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-500 hover:text-paper transition-colors"
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
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-mono uppercase tracking-wider text-ink-500">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-ink-500">{hint}</span>}
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
      <p className="text-sm text-ink-300 mb-5">{action.description}</p>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="bg-ink-800 border border-ink-700 text-paper px-3 h-9 rounded-md hover:bg-ink-700 text-sm transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={go}
          disabled={busy}
          className={
            action.danger
              ? "bg-rose-500/15 text-rose-400 border border-rose-500/30 px-4 h-10 rounded-md hover:bg-rose-500/25 text-sm transition-colors disabled:opacity-50"
              : "bg-signal-500 text-ink-900 px-4 h-10 rounded-md font-medium hover:bg-signal-600 text-sm transition-colors disabled:opacity-50"
          }
        >
          {busy ? "Working…" : action.confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
