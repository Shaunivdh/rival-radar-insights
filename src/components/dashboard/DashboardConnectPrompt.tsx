'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles, Search, MapPin, MousePointerClick } from 'lucide-react';

/**
 * Prompt shown on the dashboard inviting the user to connect their Google Business Profile.
 * Educates on what they'll unlock: Search/Maps impressions + Website clicks, month-on-month.
 * UI-only (no connection-status fetch).
 */
const DashboardConnectPrompt = () => {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-greeting p-6">
      <div className="flex flex-col md:flex-row md:items-center gap-5">
        <div className="grid place-items-center w-12 h-12 rounded-xl bg-primary text-primary-foreground shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm md:text-base leading-tight">
            Connect your Google Business Profile to unlock month-on-month tracking
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-primary" /> Search impressions
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-primary" /> Maps impressions
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MousePointerClick className="w-3.5 h-3.5 text-primary" /> Website clicks
            </span>
            <span className="text-muted-foreground/70">
              · Tracked just for your business, every month
            </span>
          </div>
        </div>

        <Link
          href="/google-business"
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-foreground text-background px-5 h-11 text-sm font-semibold hover:opacity-90 transition-opacity shrink-0"
        >
          Connect Google
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
};

export default DashboardConnectPrompt;
