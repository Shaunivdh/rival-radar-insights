import { cn } from '@/lib/utils';

interface ScoreChipProps {
  label: string;
  score: number;
  size?: 'sm' | 'md';
}

export const ScoreChip = ({ label, score, size = 'sm' }: ScoreChipProps) => {
  const getColor = (s: number) => {
    if (s >= 70) return 'bg-success/10 text-[hsl(142,71%,35%)]';
    if (s >= 40) return 'bg-warning/10 text-[hsl(38,92%,40%)]';
    return 'bg-destructive/10 text-destructive';
  };

  return (
    <span className={cn('score-chip', getColor(score), size === 'md' && 'px-4 py-1.5 text-sm')}>
      {label} <span className="font-bold">{score}</span>
    </span>
  );
};
