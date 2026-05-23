import { Sidebar } from "@/components/console/sidebar";
import { Topbar } from "@/components/console/topbar";
import { AuthGuard } from "@/components/console/auth-guard";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen w-full">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="flex-1 px-6 py-6 max-w-[1500px] mx-auto w-full">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
