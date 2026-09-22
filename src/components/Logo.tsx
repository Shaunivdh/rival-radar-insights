import { ScoutMascot } from '@/components/ScoutMascot';

export const Logo = () => (
  <div className="flex items-center gap-2.5">
    <ScoutMascot />
    <span className="text-lg font-semibold tracking-tight text-foreground">Scoutly</span>
  </div>
);
