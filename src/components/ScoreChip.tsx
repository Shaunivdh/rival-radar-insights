import { cn } from '@/lib/utils';

interface ScoreChipProps {
  label: string;
  score: number | null;
  size?: 'sm' | 'md';
  weeklyDelta?: number | null;
}

export const ScoreChip = ({ label, score, size = 'sm', weeklyDelta }: ScoreChipProps) => {
  const getColor = (s: number | null) => {
    if (s === null) return 'bg-muted text-muted-foreground';
    if (s >= 70) return 'bg-success/10 text-success-strong';
    if (s >= 40) return 'bg-warning/10 text-warning-strong';
    return 'bg-destructive/10 text-destructive';
  };

  const delta =
    weeklyDelta != null ? (
      weeklyDelta > 0 ? (
        <span className="text-xs text-green-600 ml-1">↑+{weeklyDelta}</span>
      ) : weeklyDelta < 0 ? (
        <span className="text-xs text-red-500 ml-1">↓{weeklyDelta}</span>
      ) : (
        <span className="text-xs text-gray-400 ml-1">±0</span>
      )
    ) : null;

  return (
    <span className={cn('score-chip', getColor(score), size === 'md' && 'px-4 py-1.5 text-sm')}>
      {label} <span className="font-bold">{score === null ? '—' : score}</span>
      {delta}
    </span>
  );
};
