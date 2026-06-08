import { cn } from '@/lib/utils';

interface ScoreChipProps {
  label: string;
  score: number;
  size?: 'sm' | 'md';
  weeklyDelta?: number | null;
}

export const ScoreChip = ({ label, score, size = 'sm', weeklyDelta }: ScoreChipProps) => {
  const getColor = (s: number) => {
    if (s >= 70) return 'bg-success/10 text-[hsl(142,71%,35%)]';
    if (s >= 40) return 'bg-warning/10 text-[hsl(38,92%,40%)]';
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
      {label} <span className="font-bold">{score}</span>
      {delta}
    </span>
  );
};
