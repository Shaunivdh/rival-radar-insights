import { Star } from 'lucide-react';

export const StarRating = ({ rating }: { rating: number }) => {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.3;
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i < full ? 'fill-warning text-warning' : i === full && hasHalf ? 'fill-warning/50 text-warning' : 'text-border'}`}
        />
      ))}
      <span className="ml-1 text-sm font-semibold text-foreground">{rating}</span>
    </span>
  );
};
