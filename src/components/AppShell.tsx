'use client';

import { AppSidebar } from '@/components/AppSidebar';
import DashboardTopbar from '@/components/dashboard/DashboardTopbar';

/** Sidebar + topbar chrome shared by every signed-in page. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gradient-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg"
      >
        Skip to main content
      </a>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopbar />
        <main id="main-content" className="flex-1 p-6 pt-2 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
