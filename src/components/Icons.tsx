/**
 * Shared stroke-icon set (24×24, 2px stroke) so the UI never leans on
 * emoji. Keyed lookup keeps achievement definitions serializable.
 */
const paths: Record<string, React.ReactNode> = {
  zap: <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" />,
  trend: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </>
  ),
  flame: (
    <path d="M12 22c4.4 0 7-2.8 7-6.7 0-2.6-1.4-4.9-3.1-6.8C14.2 6.7 13 4.6 13 2c-3.4 1.9-5.2 4.4-5.6 7-.2 1.3 0 2.6.4 3.7-.9-.3-1.7-1-2.2-2C4.6 12 4 13.6 4 15.3 4 19.2 7.6 22 12 22Z" />
  ),
  crown: (
    <path d="M3 7l4.5 4L12 4l4.5 7L21 7l-1.6 11.2a2 2 0 0 1-2 1.8H6.6a2 2 0 0 1-2-1.8L3 7Z" />
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  diamond: (
    <path d="M7 3h10l4 6-9 12L3 9l4-6ZM3 9h18M9.5 9 12 21 14.5 9M7 3l2.5 6L12 3l2.5 6L17 3" />
  ),
  swords: (
    <>
      <path d="M4 4l9 9M4 4h4M4 4v4M20 4l-9 9M20 4h-4M20 4v4" />
      <path d="M7 17l-3 3M17 17l3 3M6 14l4 4M18 14l-4 4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2 4 5.5v5.6c0 5 3.4 8.9 8 10.9 4.6-2 8-5.9 8-10.9V5.5L12 2Z" />
      <path d="m8.7 11.8 2.3 2.4 4.3-4.6" />
    </>
  ),
  star: (
    <path d="m12 2 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2Z" />
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  cross: <path d="M6 6l12 12M18 6 6 18" />,
  share: (
    <>
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="m8.7 10.6 6.6-3.2M8.7 13.4l6.6 3.2" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m0 0 5-5m-5 5-5-5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
  x: (
    <path
      d="M17.2 3H20l-6.6 7.6L21 21h-5.8l-4.6-6-5.2 6H2.6l7.1-8.2L2 3h6l4.1 5.5L17.2 3Zm-1 16.2h1.6L7 4.7H5.2l11 14.5Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  wallet: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M3 9h17M16 14.5h2" />
    </>
  ),
  radar: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12 18 6M12 3v2M21 12h-2M12 21v-2M3 12h2" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {paths[name] ?? paths.star}
    </svg>
  );
}
