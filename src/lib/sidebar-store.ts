"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Sidebar state, shared because the toggle lives in the topbar and the panel it
 * controls is a sibling.
 *
 * Two independent things, deliberately not one:
 *
 * - `open` is the mobile overlay. It is transient and always starts closed, so
 *   a small screen never loads with the nav covering the page.
 * - `collapsed` is the desktop icon rail. It is a preference, so it persists.
 *
 * Keeping them separate means collapsing the rail on a laptop does not leave a
 * phone stuck with a hidden-but-"open" sidebar, or vice versa.
 */
interface SidebarState {
  open: boolean;
  collapsed: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleCollapsed: () => void;
}

export const useSidebar = create<SidebarState>()(
  persist(
    (set) => ({
      open: false,
      collapsed: false,
      openSidebar: () => set({ open: true }),
      closeSidebar: () => set({ open: false }),
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
    }),
    {
      name: "relavoi.admin.sidebar.v1",
      // Only the desktop preference survives a reload.
      partialize: (s) => ({ collapsed: s.collapsed }) as SidebarState,
    },
  ),
);
