import { Sidebar } from "@/components/console/sidebar";
import { Topbar } from "@/components/console/topbar";
import { AuthGuard } from "@/components/console/auth-guard";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      {/* overflow-x-clip, not hidden: hidden would make this the scroll container
          and stop the sticky sidebar and topbar from sticking. */}
      <div className="flex min-h-screen w-full overflow-x-clip">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="page-enter flex-1 w-full min-w-0 max-w-[1440px] mx-auto px-[var(--gutter)] pt-[var(--section-gap)] pb-16">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
