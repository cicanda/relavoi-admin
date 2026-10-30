import { formatDistanceToNow, format } from "date-fns";

export function truncId(id?: string | null, n = 8): string {
  if (!id) return "None";
  return id.length <= n + 2 ? id : `${id.slice(0, n)}…`;
}

export function fmtRelative(iso?: string | null): string {
  if (!iso) return "Not set";
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); }
  catch { return iso; }
}

export function fmtAbsolute(iso?: string | null): string {
  if (!iso) return "Not set";
  try { return format(new Date(iso), "MMM d, yyyy HH:mm"); }
  catch { return iso; }
}

export function fmtNumber(n?: number | null): string {
  if (n == null) return "None";
  return new Intl.NumberFormat("en-US").format(n);
}

export function fmtCurrency(value?: number | null, currency = "NGN"): string {
  if (value == null) return "None";
  try { return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}

export function fmtPercent(value?: number | null, digits = 0): string {
  if (value == null) return "None";
  return `${value.toFixed(digits)}%`;
}
