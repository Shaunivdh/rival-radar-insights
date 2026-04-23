import { cn } from '@/lib/utils';
import type { ChangeEvent } from '@/types';

const severityStyles = {
  high: 'severity-high',
  medium: 'severity-medium',
  low: 'severity-low',
};

export const SeverityBadge = ({ severity }: { severity: 'high' | 'medium' | 'low' }) => (
  <span className={cn('score-chip capitalize', severityStyles[severity])}>
    {severity}
  </span>
);

export const TransparencyBadge = ({ level }: { level: 'high' | 'medium' | 'low' | 'none' }) => {
  const styles: Record<string, string> = {
    high: 'bg-success/10 text-[hsl(142,71%,35%)]',
    medium: 'bg-warning/10 text-[hsl(38,92%,40%)]',
    low: 'bg-destructive/10 text-destructive',
    none: 'bg-muted text-muted-foreground',
  };
  return <span className={cn('score-chip capitalize', styles[level])}>{level}</span>;
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export const ChangeEventCard = ({ event, competitorName }: { event: ChangeEvent; competitorName?: string }) => {
  const actionItems = event.changes?.map((c) => c.actionItem).filter(Boolean) ?? [];
  return (
    <div className="card-surface flex gap-4">
      <div className="pt-0.5">
        <SeverityBadge severity={event.severity} />
      </div>
      <div className="flex-1 min-w-0">
        {competitorName && (
          <p className="text-xs font-medium text-primary mb-1">{competitorName}</p>
        )}
        <p className="text-sm text-foreground">{event.summary}</p>
        {actionItems.length > 0 && (
          <div className="mt-2 space-y-1">
            {actionItems.map((item, i) => (
              <p key={i} className="text-xs text-primary/80 flex items-start gap-1.5">
                <span className="shrink-0 mt-0.5">&rarr;</span>
                <span>{item}</span>
              </p>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-1">{timeAgo(event.detectedAt)}</p>
      </div>
    </div>
  );
};
