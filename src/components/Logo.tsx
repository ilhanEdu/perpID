/**
 * PerpID logo mark — a neon ID-hexagon with a candlestick core: identity
 * badge meets orderbook. Inline SVG so it needs no asset pipeline.
 */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="pid-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8f7bff" />
          <stop offset="0.55" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#38cfff" />
        </linearGradient>
      </defs>
      <path
        d="M16 1.8 28.3 8.9v14.2L16 30.2 3.7 23.1V8.9L16 1.8Z"
        stroke="url(#pid-grad)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M11 13v6M11 11.2v.8M11 20v.8"
        stroke="#38cfff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M16 10.5v8M16 8.6v.9M16 19.6v.9"
        stroke="#ffc94d"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M21 14.5v5M21 12.6v.9M21 20.6v.9"
        stroke="#8f7bff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LogoWord() {
  return (
    <span className="logo-word">
      Perp<span className="logo-word-id">ID</span>
    </span>
  );
}
