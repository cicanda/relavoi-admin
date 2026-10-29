"use client";

import { Bell, Menu, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSystemHealth } from "@/lib/api";
import { useSidebar } from "@/lib/sidebar-store";
import { MENU_BUTTON_ID, NAV_ID } from "@/components/console/sidebar";

export function Topbar() {
  const { open, collapsed, openSidebar, toggleCollapsed } = useSidebar();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const health = useQuery({
    queryKey: ["console", "health-pill"],
    queryFn: getSystemHealth,
    refetchInterval: 30_000,
  });

  // Only show green when both datastores are explicitly confirmed ok — missing
  // data means "unknown", which must NOT read as healthy.
  const pg = health.data?.checks?.postgres ?? "unknown";
  const rd = health.data?.checks?.redis ?? "unknown";
  const isHealthy = pg === "ok" && rd === "ok";
  const pillClass = isHealthy
    ? "bg-signal-500/15 text-signal-800"
    : "bg-rose-500/10 text-rose-700";
  const dotClass = isHealthy ? "bg-signal-500 animate-pulse-dot" : "bg-rose-500";
  const label = isHealthy ? "Live" : "Degraded";

  return (
    // A flat, full-width bar: dashboards keep their chrome square to the page.
    <header className="sticky top-0 z-30 bg-canvas/85 backdrop-blur-md border-b border-line flex-shrink-0">
      <div className="min-h-16 py-2.5 sm:py-0 lg:h-[68px] max-w-[1440px] mx-auto px-[var(--gutter)] flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-2 sm:gap-3">
        {/* Two buttons rather than one branching on viewport width: the breakpoint
            is a CSS concern and window.innerWidth is not safe to read in render. */}
        <button
          id={MENU_BUTTON_ID}
          type="button"
          onClick={openSidebar}
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls={NAV_ID}
          className="icon-btn lg:hidden -ml-2"
        >
          <Menu className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="icon-btn hidden lg:inline-flex -ml-2"
        >
          {collapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
        </button>
        {/* Below sm the search takes its own full-width row so it stays usable. */}
        <div className="relative order-last w-full sm:order-none sm:w-auto sm:flex-1 min-w-0 sm:max-w-lg">
          <Search className="w-4 h-4 text-fg-3 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search tenants, sessions, operators…"
            className="field w-full pl-10 pr-14 rounded-full bg-surface"
          />
          <kbd className="hidden md:inline-flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-0.5 px-1.5 py-0.5 bg-sunken border border-line rounded-md text-[10px] font-mono text-fg-3 select-none">
            ⌘K
          </kbd>
        </div>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <span className={`badge ${pillClass}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
            {label}
          </span>

          <button
            className="icon-btn"
            aria-label="Notifications"
          >
            <Bell className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    </header>
  );
}
