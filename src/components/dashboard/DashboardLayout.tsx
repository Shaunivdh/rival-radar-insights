import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";

interface DashboardLayoutProps {
  children: ReactNode;
  /** When false, removes the inner rounded canvas wrapper (use if your page provides its own). */
  inset?: boolean;
}

const DashboardLayout = ({ children, inset = true }: DashboardLayoutProps) => {
  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full bg-gradient-canvas">
        <DashboardSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <DashboardTopbar />

          <main className="flex-1 px-4 lg:px-8 pb-8">
            {inset ? (
              <div
                className="relative rounded-[2rem] bg-card/70 backdrop-blur-sm p-5 lg:p-7 overflow-hidden"
                style={{ boxShadow: "var(--neu-shadow)" }}
              >
                {/* Decorative blurs */}
                <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-accent/10 blur-3xl pointer-events-none" />

                <div className="relative">{children}</div>
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default DashboardLayout;
