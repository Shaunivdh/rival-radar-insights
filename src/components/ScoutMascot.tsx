const Art = () => (
  <>
    <defs>
      <radialGradient id="scface" cx="0.36" cy="0.28" r="0.8">
        <stop offset="0" stopColor="#FFB27E"></stop>
        <stop offset="0.45" stopColor="#F57D42"></stop>
        <stop offset="1" stopColor="#D8551F"></stop>
      </radialGradient>
      <radialGradient id="scear" cx="0.35" cy="0.3" r="0.9">
        <stop offset="0" stopColor="#FFA46E"></stop>
        <stop offset="1" stopColor="#DE5E27"></stop>
      </radialGradient>
      <linearGradient id="scmuz" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFFFFF"></stop>
        <stop offset="1" stopColor="#F6DCCB"></stop>
      </linearGradient>
      <radialGradient id="sceye" cx="0.35" cy="0.3" r="0.75">
        <stop offset="0" stopColor="#6A3C8E"></stop>
        <stop offset="0.6" stopColor="#2B0B45"></stop>
        <stop offset="1" stopColor="#1A0530"></stop>
      </radialGradient>
      <radialGradient id="scinner" cx="0.5" cy="0.8" r="0.9">
        <stop offset="0" stopColor="#FF9FB8"></stop>
        <stop offset="1" stopColor="#E8507A"></stop>
      </radialGradient>
      <radialGradient id="scblush">
        <stop offset="0" stopColor="#FF6FA3" stopOpacity="0.75"></stop>
        <stop offset="1" stopColor="#FF6FA3" stopOpacity="0"></stop>
      </radialGradient>
      <radialGradient id="scshine">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.85"></stop>
        <stop offset="1" stopColor="#ffffff" stopOpacity="0"></stop>
      </radialGradient>
      <radialGradient id="scshadow">
        <stop offset="0" stopColor="#5B2A7A" stopOpacity="0.28"></stop>
        <stop offset="1" stopColor="#5B2A7A" stopOpacity="0"></stop>
      </radialGradient>
    </defs>
    <ellipse cx="100" cy="192" rx="78" ry="12" fill="url(#scshadow)"></ellipse>
    <g transform="rotate(-8 100 120)">
      <g strokeLinejoin="round" strokeWidth="10">
        <g className="scoutly-ear">
          <path
            d="M116 78 C 124 44 142 14 166 0 C 182 30 182 70 168 104 Z"
            transform="translate(0 7)"
            fill="#B8441A"
            stroke="#B8441A"
          ></path>
          <path
            d="M116 78 C 124 44 142 14 166 0 C 182 30 182 70 168 104 Z"
            fill="url(#scear)"
            stroke="url(#scear)"
          ></path>
          <path
            d="M132 74 C 138 52 150 32 162 20 C 170 42 168 68 160 92 Z"
            fill="url(#scinner)"
            stroke="url(#scinner)"
            strokeWidth="4"
          ></path>
        </g>
        <path
          d="M84 70 C 74 46 56 36 40 40 C 24 44 16 60 18 78 C 30 72 44 76 54 88 Z"
          transform="translate(0 7)"
          fill="#B8441A"
          stroke="#B8441A"
        ></path>
        <path
          d="M84 70 C 74 46 56 36 40 40 C 24 44 16 60 18 78 C 30 72 44 76 54 88 Z"
          fill="url(#scear)"
          stroke="url(#scear)"
        ></path>
        <path
          d="M100 62 C 140 62 164 82 170 110 C 178 116 184 122 188 130 C 180 134 174 136 168 136 C 158 160 132 174 100 174 C 68 174 42 160 32 136 C 26 136 20 134 12 130 C 16 122 22 116 30 110 C 36 82 60 62 100 62 Z"
          transform="translate(0 10)"
          fill="#B8441A"
          stroke="#B8441A"
        ></path>
        <path
          d="M100 62 C 140 62 164 82 170 110 C 178 116 184 122 188 130 C 180 134 174 136 168 136 C 158 160 132 174 100 174 C 68 174 42 160 32 136 C 26 136 20 134 12 130 C 16 122 22 116 30 110 C 36 82 60 62 100 62 Z"
          fill="url(#scface)"
          stroke="url(#scface)"
        ></path>
      </g>
      <path
        d="M30 134 C 56 130 84 138 100 154 C 116 138 144 130 170 134 C 160 160 132 174 100 174 C 68 174 40 160 30 134 Z"
        transform="translate(0 4)"
        fill="#E2BBA6"
        stroke="#E2BBA6"
        strokeWidth="6"
        strokeLinejoin="round"
      ></path>
      <path
        d="M30 134 C 56 130 84 138 100 154 C 116 138 144 130 170 134 C 160 160 132 174 100 174 C 68 174 40 160 30 134 Z"
        fill="url(#scmuz)"
        stroke="url(#scmuz)"
        strokeWidth="6"
        strokeLinejoin="round"
      ></path>
      <ellipse
        cx="70"
        cy="84"
        rx="26"
        ry="13"
        transform="rotate(-18 70 84)"
        fill="url(#scshine)"
      ></ellipse>
      <ellipse
        cx="46"
        cy="54"
        rx="9"
        ry="6"
        transform="rotate(-30 46 54)"
        fill="url(#scshine)"
      ></ellipse>
      <ellipse cx="56" cy="134" rx="16" ry="10" fill="url(#scblush)"></ellipse>
      <ellipse cx="144" cy="134" rx="16" ry="10" fill="url(#scblush)"></ellipse>
      <ellipse cx="72" cy="114" rx="11" ry="12.5" fill="url(#sceye)"></ellipse>
      <ellipse cx="128" cy="114" rx="11" ry="12.5" fill="url(#sceye)"></ellipse>
      <circle cx="77" cy="108" r="4" fill="#ffffff"></circle>
      <circle cx="133" cy="108" r="4" fill="#ffffff"></circle>
      <circle cx="70" cy="119" r="1.6" fill="#ffffff" opacity="0.7"></circle>
      <circle cx="126" cy="119" r="1.6" fill="#ffffff" opacity="0.7"></circle>
      <path
        d="M118 92 Q 128 84 140 90"
        fill="none"
        stroke="#9E3A12"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.8"
      ></path>
      <ellipse cx="100" cy="128" rx="7.5" ry="5.5" fill="url(#sceye)"></ellipse>
      <ellipse cx="98" cy="126.5" rx="2.5" ry="1.4" fill="#ffffff" opacity="0.8"></ellipse>
      <ellipse cx="101" cy="140" rx="4" ry="4.8" fill="#6B1F3A"></ellipse>
    </g>
  </>
);

/** The Scoutly mascot. `tile` draws it on the violet squircle from the brand sheet. */
export const ScoutMascot = ({
  className = 'w-9 h-9',
  tile = false,
}: {
  className?: string;
  tile?: boolean;
}) =>
  tile ? (
    <svg viewBox="0 0 150 150" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="sctile" x1="0" y1="0" x2="0.34" y2="0.94">
          <stop offset="0" stopColor="#9A78E8" />
          <stop offset="1" stopColor="#6B3FD4" />
        </linearGradient>
      </defs>
      <rect width="150" height="150" rx="45" ry="45" fill="url(#sctile)" />
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
      <g transform="translate(11 11) scale(0.59259259) translate(8 14)">
        <Art />
      </g>
    </svg>
  ) : (
    <svg viewBox="-8 -14 216 216" className={className} aria-hidden="true">
      <Art />
    </svg>
  );
