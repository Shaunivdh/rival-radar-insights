/** Time-of-day tile for the dashboard greeting: sun, low sun, or crescent moon. */
export type DayPart = 'morning' | 'afternoon' | 'evening';

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

const Morning = () => (
  <g stroke="#ffffff" strokeWidth="7" strokeLinecap="round">
    <circle cx="75" cy="75" r="21" fill="#ffffff" stroke="none" />
    {RAYS.map((a) => (
      <line key={a} x1="75" y1="34" x2="75" y2="43" transform={`rotate(${a} 75 75)`} />
    ))}
  </g>
);

const Afternoon = () => (
  <g stroke="#ffffff" strokeWidth="7" strokeLinecap="round">
    <path d="M47 96 A 28 28 0 0 1 103 96 Z" fill="#ffffff" stroke="none" />
    {[-55, -27.5, 0, 27.5, 55].map((a) => (
      <line key={a} x1="75" y1="33" x2="75" y2="44" transform={`rotate(${a} 75 75)`} />
    ))}
    <line x1="34" y1="104" x2="116" y2="104" />
    <line x1="52" y1="119" x2="98" y2="119" strokeOpacity="0.65" />
  </g>
);

const Evening = () => (
  <g fill="#ffffff">
    <mask id="grmoon">
      <rect width="150" height="150" fill="#000000" />
      <circle cx="76" cy="78" r="35" fill="#ffffff" />
      <circle cx="95" cy="60" r="31" fill="#000000" />
    </mask>
    <rect width="150" height="150" mask="url(#grmoon)" />
    <circle cx="106" cy="98" r="4" />
    <circle cx="116" cy="76" r="2.6" fillOpacity="0.8" />
    <circle cx="96" cy="115" r="2.2" fillOpacity="0.6" />
  </g>
);

export const GreetingIcon = ({
  part,
  className = 'w-12 h-12',
}: {
  part: DayPart;
  className?: string;
}) => (
  <svg viewBox="0 0 150 150" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="grtile" x1="0" y1="0" x2="0.34" y2="0.94">
        <stop offset="0" stopColor="#9A78E8" />
        <stop offset="1" stopColor="#6B3FD4" />
      </linearGradient>
    </defs>
    <rect width="150" height="150" rx="45" ry="45" fill="url(#grtile)" />
    <rect
      x="1"
      y="1"
      width="148"
      height="148"
      rx="44"
      ry="44"
      fill="none"
      stroke="#ffffff"
      strokeOpacity="0.35"
      strokeWidth="2"
    />
    {part === 'morning' ? <Morning /> : part === 'afternoon' ? <Afternoon /> : <Evening />}
  </svg>
);
