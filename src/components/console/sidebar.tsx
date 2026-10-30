"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAdminAuth, clearPersistedAdminToken } from "@/lib/auth-store";
import { getOverview, listTenants } from "@/lib/api";
import { BrandLogo, BrandMark } from "@/components/brand-mark";
import { useSidebar } from "@/lib/sidebar-store";
import { useEffect, useRef, useState } from "react";
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
  ShieldCheck,
  LogOut,
  X,
} from "lucide-react";

/** Shared with the topbar's menu button for aria-controls and focus return. */
export const NAV_ID = "console-nav";
export const MENU_BUTTON_ID = "console-menu-button";

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
      { label: "Verification", href: "/console/verification", icon: ShieldCheck },
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
  const closeRef = useRef<HTMLButtonElement>(null);

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

  // Focus moves into the sheet when it opens and back to the menu button when
  // it closes, so keyboard users are never left behind the overlay.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isDesktop) return;
    if (open) closeRef.current?.focus();
    else if (wasOpen.current) document.getElementById(MENU_BUTTON_ID)?.focus();
    wasOpen.current = open;
  }, [open, isDesktop]);

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

  // Below lg the panel is an off-canvas sheet. While it is hidden it must not
  // be reachable by keyboard or screen reader; while open it is a modal sheet.
  const hiddenSheet = !isDesktop && !open;
  const sheetProps = !isDesktop && open ? { role: "dialog" as const, "aria-modal": true } : {};

  return (
    <>
      {open && (
        <div
          onClick={closeSidebar}
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-ink-950/50 backdrop-blur-[3px] animate-fade lg:hidden"
        />
      )}

      <aside
        id={NAV_ID}
        aria-label="Console navigation"
        data-open={open ? "true" : "false"}
        inert={hiddenSheet}
        {...sheetProps}
        // Below lg the panel slides over the content; from lg it is an in-flow
        // column and must carry no transform at all.
        style={isDesktop ? undefined : { transform: open ? "translateX(0)" : "translateX(calc(-100% - 1rem))" }}
        className={[
          "sidebar-panel panel-dark",
          "fixed top-2 bottom-2 left-2 z-50 w-[min(18rem,calc(100vw-1rem))] flex flex-col rounded-[24px] shadow-[var(--shadow-pop)] overflow-hidden",
          "lg:sticky lg:top-3 lg:bottom-auto lg:left-auto lg:z-auto lg:m-3 lg:mr-0 lg:h-[calc(100vh-1.5rem)] lg:self-start lg:flex-shrink-0 lg:shadow-none",
          collapsed ? "lg:w-[4.5rem]" : "lg:w-64",
        ].join(" ")}
      >
      {/* Brand */}
      <div className={`px-5 pt-5 pb-4 flex items-start justify-between gap-2 ${collapsed ? "lg:px-0 lg:justify-center" : ""}`}>
        <div className={collapsed ? "hidden lg:block" : "hidden"}>
          <BrandMark size={36} />
        </div>
        <div className={`min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
          <BrandLogo height={30} />
          <div className="mt-2 eyebrow text-ink-400 truncate">{envLabel}</div>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={closeSidebar}
          aria-label="Close navigation"
          className="lg:hidden -mr-2 -mt-1 w-11 h-11 flex items-center justify-center rounded-full text-ink-300 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav aria-label="Console" className={`flex-1 overflow-y-auto px-3 pb-3 space-y-5 ${collapsed ? "lg:px-2" : ""}`}>
        {NAV.map((group) => (
          <div key={group.label}>
            <div className={`px-3 pb-1.5 eyebrow text-ink-500 ${collapsed ? "lg:sr-only" : ""}`}>
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
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={`group flex items-center gap-3 rounded-[12px] text-[14px] tracking-[-0.01em] transition-colors relative min-h-[44px] lg:min-h-[38px] px-3 ${
                      collapsed ? "lg:justify-center lg:px-0" : ""
                    } ${
                      active
                        ? "bg-white/[0.09] text-white"
                        : "text-ink-300 hover:bg-white/[0.05] hover:text-white"
                    }`}
                  >
                    {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-signal-500 rounded-r-full" />}
                    <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${active ? "text-signal-500" : "text-ink-400 group-hover:text-ink-200"}`} />
                    <span className={`flex-1 ${collapsed ? "lg:hidden" : ""}`}>{item.label}</span>
                    {showCount && (
                      <span
                        className={`font-mono text-[10px] min-w-[1.375rem] h-[1.375rem] px-1.5 inline-flex items-center justify-center rounded-full ${
                          item.badgeDanger
                            ? "bg-rose-500/20 text-rose-300"
                            : "bg-white/10 text-ink-200"
                        } ${collapsed ? "lg:absolute lg:top-0.5 lg:right-1 lg:min-w-4 lg:h-4 lg:px-1 lg:text-[9px]" : ""}`}
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
      <div className={`m-3 mt-0 p-2.5 rounded-[18px] bg-white/[0.06] border border-white/[0.07] flex items-center gap-3 ${collapsed ? "lg:flex-col lg:m-2 lg:mt-0 lg:px-1 lg:gap-2" : ""}`}>
        <div className="w-9 h-9 rounded-full bg-signal-500 text-ink-900 flex items-center justify-center text-xs font-semibold flex-shrink-0">
          {initials(operator?.name ?? operator?.email ?? "?")}
        </div>
        <div className={`flex-1 min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
          <div className="text-sm text-white truncate font-medium">{operator?.name ?? operator?.email ?? "Not set"}</div>
          {operator?.role && <div className="mt-1"><RolePill role={operator.role} onDark /></div>}
        </div>
        <button
          onClick={onLogout}
          className="w-11 h-11 lg:w-9 lg:h-9 flex items-center justify-center flex-shrink-0 text-ink-300 hover:text-white hover:bg-white/10 rounded-full transition-colors"
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
