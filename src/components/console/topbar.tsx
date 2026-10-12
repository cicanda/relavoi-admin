"use client";

import { Bell, Menu, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSystemHealth } from "@/lib/api";
import { useSidebar } from "@/lib/sidebar-store";

export function Topbar() {
  const { collapsed, openSidebar, toggleCollapsed } = useSidebar();
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
    ? "bg-signal-500/15 text-signal-500"
    : "bg-rose-500/15 text-rose-400";
  const dotClass = isHealthy ? "bg-signal-500 animate-pulse-dot" : "bg-rose-500";
  const label = isHealthy ? "Live" : "Degraded";

  return (
    <header className="h-[52px] bg-ink-800 border-b border-ink-700 px-3 sm:px-4 flex items-center gap-2 sm:gap-4 flex-shrink-0">
      {/* Two buttons rather than one branching on viewport width: the breakpoint
          is a CSS concern and window.innerWidth is not safe to read in render. */}
      <button
        type="button"
        onClick={openSidebar}
        aria-label="Open navigation"
        className="lg:hidden -ml-1 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-300 hover:text-paper hover:bg-ink-900/50 rounded-md transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="hidden lg:flex -ml-1 p-2 items-center justify-center text-ink-300 hover:text-paper hover:bg-ink-900/50 rounded-md transition-colors"
      >
        {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
      </button>
      <div className="relative flex-1 max-w-md">
        <Search className="w-3.5 h-3.5 text-ink-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search tenants, sessions, operators…"
          className="w-full h-9 pl-8 pr-12 bg-ink-900 border border-ink-700 rounded-md font-mono text-[12px] text-paper placeholder:text-ink-500 focus:outline-none focus:border-signal-500 transition-colors"
        />
        <kbd className="hidden md:inline-flex absolute right-2 top-1/2 -translate-y-1/2 items-center gap-0.5 px-1.5 py-0.5 bg-ink-800 border border-ink-700 rounded text-[10px] font-mono text-ink-500 select-none">
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 ${pillClass} rounded-md font-mono text-[11px] uppercase tracking-wider`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
          {label}
        </span>

        <button
          className="p-2 text-ink-400 hover:text-paper hover:bg-ink-700 rounded-md transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
