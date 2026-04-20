'use client';

import { useRouter, usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Bell, Settings, Zap, LogOut, Building2, Lightbulb, HelpCircle } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { useRivalRadarStore } from '@/store/rivalradar';

const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Action Plan', path: '/action-plan', icon: Lightbulb },
  { label: 'My Business', path: '/my-business', icon: Building2 },
  { label: 'Competitors', path: '/competitors', icon: Users },
  { label: 'Changes', path: '/changes', icon: Bell },
  { label: 'Settings', path: '/settings', icon: Settings },
  { label: 'Help center', path: '/help', icon: HelpCircle },
];

export const AppSidebar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isDemoMode, logout } = useRivalRadarStore();

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <aside className="w-60 shrink-0 bg-card border-r border-border flex flex-col h-screen sticky top-0">
      <div className="p-5 border-b border-border">
        <Logo />
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const active = pathname?.startsWith(item.path);
          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="w-4.5 h-4.5" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border space-y-3">
        {user && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground truncate">
              <span className="font-medium text-foreground">{user.email?.split('@')[0]}</span>
            </p>
            <button
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive transition-colors"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="card-surface bg-primary/5 border-primary/10 flex items-start gap-3 p-3">
          <Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-foreground">Pro Tip</p>
            <p className="text-xs text-muted-foreground mt-0.5">Add API keys in Settings to enable live scanning.</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
