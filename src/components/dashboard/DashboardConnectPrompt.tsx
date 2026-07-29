'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Sparkles, Search, MapPin, MousePointerClick, X } from 'lucide-react';

/**
 * Prompt shown on the dashboard inviting the user to connect their Google Business Profile.
 * Educates on what they'll unlock: Search/Maps impressions + Website clicks, month-on-month.
 * UI-only + dismissible for the session (no connection-status fetch).
 */
const DashboardConnectPrompt = () => {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/[0.07] via-primary/[0.04] to-accent/[0.07] p-5">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 grid place-items-center w-7 h-7 rounded-full text-muted-foreground hover:bg-background/60"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>

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
