"use client";

import { Bell, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSystemHealth } from "@/lib/api";

export function Topbar() {
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

  const pg = health.data?.checks?.postgres ?? "ok";
  const rd = health.data?.checks?.redis ?? "ok";
  const isHealthy = pg === "ok" && rd === "ok";
  const pillClass = isHealthy
    ? "bg-signal-500/15 text-signal-500"
    : "bg-rose-500/15 text-rose-400";
  const dotClass = isHealthy ? "bg-signal-500 animate-pulse-dot" : "bg-rose-500";
  const label = isHealthy ? "Live" : "Degraded";

  return (
    <header className="h-[52px] bg-ink-800 border-b border-ink-700 px-4 flex items-center gap-4 flex-shrink-0">
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
