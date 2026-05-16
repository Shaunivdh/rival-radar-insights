'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Settings, Lightbulb, Building2, Eye, HelpCircle, Zap } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { useRivalRadarStore } from '@/store/rivalradar';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

const mainNavItems = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Action Plan', path: '/action-plan', icon: Lightbulb, badge: true },
  { label: 'What We Track', path: '/what-we-track', icon: Eye },
  { label: 'My Business', path: '/my-business', icon: Building2 },
];

const workspaceNavItems = [
  { label: 'Competitors', path: '/competitors', icon: Users },
  { label: 'Settings', path: '/settings', icon: Settings },
  { label: 'Help center', path: '/help', icon: HelpCircle },
];

const DashboardSidebar = () => {
  const pathname = usePathname();
  const { priorityActions } = useRivalRadarStore();

  return (
    <Sidebar>
      <SidebarHeader className="p-5 border-b border-border">
        <Logo />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => {
                const active = pathname?.startsWith(item.path);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={item.path}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                        {item.badge && priorityActions.length > 0 && (
                          <span className={cn(
                            'ml-auto text-xs font-semibold rounded-full px-2 py-0.5',
                            active
                              ? 'bg-primary-foreground/20 text-primary-foreground'
                              : 'bg-primary/10 text-primary'
                          )}>
                            +{priorityActions.length}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceNavItems.map((item) => {
                const active = pathname?.startsWith(item.path);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={item.path}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border">
        <div className="card-surface bg-primary/5 border-primary/10 flex items-start gap-3 p-3">
          <Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-foreground">Add a competitor</p>
            <p className="text-xs text-muted-foreground mt-0.5">Track up to 5 rival locals.</p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

export default DashboardSidebar;
