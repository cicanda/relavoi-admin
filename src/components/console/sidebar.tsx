"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAdminAuth, clearPersistedAdminToken } from "@/lib/auth-store";
import { getOverview, listTenants } from "@/lib/api";
import { BrandMark } from "@/components/brand-mark";
import { useSidebar } from "@/lib/sidebar-store";
import { useEffect, useState } from "react";
import { RolePill } from "@/components/state-pill";
import {
  LayoutDashboard,
  Building2,
  Hash,
  Activity,
  Radio,
  Server,
  AlertTriangle,
  Tags,
  ScrollText,
  Users,
  Cpu,
  LogOut,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Pull the badge count from the matching field in the cached query data. */
  badge?: "tenants" | "dlq";
  /** Show badge in red when the underlying value is > 0. */
  badgeDanger?: boolean;
}

interface NavGroup { label: string; items: NavItem[]; }

const NAV: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { label: "Overview", href: "/console/overview", icon: LayoutDashboard },
      { label: "Tenants", href: "/console/tenants", icon: Building2, badge: "tenants" },
      { label: "Number Pool", href: "/console/numbers", icon: Hash },
      { label: "Sessions", href: "/console/sessions", icon: Activity },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { label: "CPaaS", href: "/console/cpaas", icon: Radio },
      { label: "Fleet", href: "/console/fleet", icon: Server },
      { label: "DLQ & Retries", href: "/console/dlq", icon: AlertTriangle, badge: "dlq", badgeDanger: true },
    ],
  },
  {
    label: "Commerce",
    items: [
      { label: "Pricing & Plans", href: "/console/pricing", icon: Tags },
      { label: "Audit Log", href: "/console/audit", icon: ScrollText },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Operators", href: "/console/operators", icon: Users },
      { label: "System", href: "/console/system", icon: Cpu },
    ],
  },
];

export function Sidebar() {
  const { open, collapsed, closeSidebar } = useSidebar();
  const isDesktop = useIsDesktop();

  // Escape closes the overlay; lock the page behind it while it is covered.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeSidebar();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, closeSidebar]);

  const path = usePathname();
  const { operator } = useAdminAuth();
  const envLabel = process.env.NEXT_PUBLIC_ENV_LABEL ?? "ng-prod";

  // Cheap counts for sidebar badges — refresh every 30s, share with other pages.
  const overview = useQuery({
    queryKey: ["console", "overview-badge"],
    queryFn: getOverview,
    refetchInterval: 30_000,
  });
  const tenants = useQuery({
    queryKey: ["console", "tenants-count"],
    queryFn: () => listTenants({ limit: 1 }),
    refetchInterval: 60_000,
  });

  function badgeFor(key: NavItem["badge"]): number | null {
    if (key === "tenants") {
      const data = tenants.data;
      if (!data) return null;
      return data.pagination?.count ?? data.data?.length ?? null;
    }
    if (key === "dlq") return overview.data?.dlqDepth ?? null;
    return null;
  }

  function isActive(href: string): boolean {
    if (href === "/console/overview") return path === "/console/overview" || path === "/console";
    return path.startsWith(href);
  }

  function onLogout(): void {
    clearPersistedAdminToken();
    useAdminAuth.getState().clearSession();
    window.location.assign("/login");
  }

  return (
    <>
      {open && (
        <div
          onClick={closeSidebar}
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-ink-950/60 lg:hidden"
        />
      )}

      <aside
        data-open={open ? "true" : "false"}
        // Below lg the panel slides over the content; from lg it is an in-flow
        // column and must carry no transform at all.
        style={isDesktop ? undefined : { transform: open ? "translateX(0)" : "translateX(-100%)" }}
        className={[
          "sidebar-panel",
          "fixed inset-y-0 left-0 z-50 w-[17rem] flex flex-col bg-ink-800 border-r border-ink-700",
          "lg:static lg:z-auto lg:h-screen lg:flex-shrink-0",
          collapsed ? "lg:w-16" : "lg:w-60",
        ].join(" ")}
      >
      {/* Brand */}
      <div className="px-4 py-4 border-b border-ink-700 flex items-center gap-3">
        <BrandMark size={36} />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-paper leading-tight">Relavoi</div>
          <div className="text-[11px] font-mono text-ink-500 uppercase tracking-wider truncate">{envLabel}</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {NAV.map((group) => (
          <div key={group.label}>
            <div className="px-2 pb-1 text-[11px] font-mono uppercase tracking-wider text-ink-500">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                const count = item.badge ? badgeFor(item.badge) : null;
                const showCount = count != null && count > 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeSidebar}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-2.5 rounded-md text-[13px] transition-colors relative min-h-[44px] lg:min-h-0 px-2 py-2.5 lg:py-1.5 ${
                      collapsed ? "lg:justify-center lg:px-0" : ""
                    } ${
                      active
                        ? "bg-ink-900/70 text-paper font-medium"
                        : "text-ink-300 hover:bg-ink-900/40 hover:text-paper"
                    }`}
                  >
                    {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-signal-500 rounded-r-full" />}
                    <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-paper" : "text-ink-500"}`} />
                    <span className={`flex-1 ${collapsed ? "lg:hidden" : ""}`}>{item.label}</span>
                    {showCount && (
                      <span
                        className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-md ${
                          item.badgeDanger
                            ? "bg-rose-500/20 text-rose-400"
                            : "bg-ink-700 text-ink-300"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Operator footer */}
      <div className="border-t border-ink-700 px-3 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-ink-700 text-paper flex items-center justify-center text-xs font-medium">
          {initials(operator?.name ?? operator?.email ?? "?")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-paper truncate font-medium">{operator?.name ?? operator?.email ?? "—"}</div>
          {operator?.role && <div className="mt-0.5"><RolePill role={operator.role} /></div>}
        </div>
        <button
          onClick={onLogout}
          className="p-1.5 text-ink-400 hover:text-paper hover:bg-ink-900/60 rounded-md transition-colors"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
      </aside>
    </>
  );
}

function initials(s: string): string {
  return s.split(/[\s@]/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

/**
 * True at the lg breakpoint and above. Starts false so the server-rendered
 * markup is the mobile, closed state.
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return isDesktop;
}
