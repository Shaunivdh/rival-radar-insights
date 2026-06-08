const RadarIcon = ({ className = 'w-9 h-9' }: { className?: string }) => (
  <svg viewBox="0 0 36 36" fill="none" className={className}>
    <circle cx="18" cy="18" r="16" stroke="hsl(245, 78%, 60%)" strokeWidth="1.5" opacity="0.3" />
    <circle cx="18" cy="18" r="11" stroke="hsl(245, 78%, 60%)" strokeWidth="1.5" opacity="0.5" />
    <circle cx="18" cy="18" r="6" stroke="hsl(245, 78%, 60%)" strokeWidth="1.5" opacity="0.7" />
    <line
      x1="18"
      y1="18"
      x2="18"
      y2="2"
      stroke="hsl(245, 78%, 60%)"
      strokeWidth="2"
      strokeLinecap="round"
      className="origin-center animate-radar-sweep"
    />
    <circle cx="24" cy="10" r="2" fill="hsl(245, 78%, 60%)" opacity="0.8" />
    <circle cx="10" cy="14" r="1.5" fill="hsl(245, 78%, 60%)" opacity="0.6" />
    <circle cx="26" cy="22" r="1.5" fill="hsl(245, 78%, 60%)" opacity="0.5" />
    <circle cx="14" cy="26" r="1.8" fill="hsl(245, 78%, 60%)" opacity="0.7" />
  </svg>
);

export const Logo = () => (
  <div className="flex items-center gap-2.5">
    <RadarIcon />
    <span className="text-lg font-semibold tracking-tight text-foreground">Scoutly</span>
  </div>
);
