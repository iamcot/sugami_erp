import type { ReactNode } from 'react';

/** Small brand marks for the link badges (drawn here so no image files are needed). */
export function ShopeeIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Shopee" role="img">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#EE4D2D" />
      <path d="M8 9h8l-.7 8H8.7L8 9Z" fill="#fff" />
      <path d="M10 9a2 2 0 0 1 4 0" stroke="#fff" strokeWidth="1.4" fill="none" />
      <path
        d="M11.2 13.1c.2-.5 1.6-.6 1.7.1.1.6-1.7.7-1.6 1.4.1.7 1.5.6 1.7.1"
        stroke="#EE4D2D"
        strokeWidth=".9"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TikTokIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="TikTok" role="img">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#000" />
      <path
        d="M13.2 6.5v7.2a2.2 2.2 0 1 1-2.2-2.2m2.2-5c.2 1.6 1.2 2.6 2.8 2.8"
        stroke="#25F4EE"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        transform="translate(-.5 .3)"
      />
      <path
        d="M13.2 6.5v7.2a2.2 2.2 0 1 1-2.2-2.2m2.2-5c.2 1.6 1.2 2.6 2.8 2.8"
        stroke="#FE2C55"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        transform="translate(.5 -.3)"
      />
      <path
        d="M13.2 6.5v7.2a2.2 2.2 0 1 1-2.2-2.2m2.2-5c.2 1.6 1.2 2.6 2.8 2.8"
        stroke="#fff"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PancakeIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Pancake" role="img">
      <circle cx="12" cy="12" r="10" fill="#7C3AED" />
      <ellipse cx="12" cy="10.5" rx="5.5" ry="2.2" fill="#FBBF24" />
      <rect x="6.5" y="11.5" width="11" height="2.2" rx="1.1" fill="#F59E0B" />
      <rect x="6.5" y="14.2" width="11" height="2.2" rx="1.1" fill="#FBBF24" />
    </svg>
  );
}

const TIKTOK_NOTE = 'M13.2 6.5v7.2a2.2 2.2 0 1 1-2.2-2.2m2.2-5c.2 1.6 1.2 2.6 2.8 2.8';

const DIAMOND: Record<string, { fill: string; label: string; mark: ReactNode }> = {
  shopee: {
    fill: '#EE4D2D',
    label: 'Shopee',
    mark: (
      <>
        <path d="M8 9h8l-.7 8H8.7L8 9Z" fill="#fff" />
        <path d="M10 9a2 2 0 0 1 4 0" stroke="#fff" strokeWidth="1.4" fill="none" />
      </>
    ),
  },
  tiktok: {
    fill: '#000',
    label: 'TikTok Shop',
    mark: (
      <g fill="none" strokeWidth="1.8" strokeLinecap="round">
        <path d={TIKTOK_NOTE} stroke="#25F4EE" transform="translate(-.5 .3)" />
        <path d={TIKTOK_NOTE} stroke="#FE2C55" transform="translate(.5 -.3)" />
        <path d={TIKTOK_NOTE} stroke="#fff" />
      </g>
    ),
  },
  pancake: {
    fill: '#7C3AED',
    label: 'Pancake',
    mark: (
      <>
        <ellipse cx="12" cy="10.5" rx="5.5" ry="2.2" fill="#FBBF24" />
        <rect x="6.5" y="11.5" width="11" height="2.2" rx="1.1" fill="#F59E0B" />
        <rect x="6.5" y="14.2" width="11" height="2.2" rx="1.1" fill="#FBBF24" />
      </>
    ),
  },
  store: {
    fill: '#10B981',
    label: 'Bán trực tiếp',
    mark: (
      <g stroke="#fff" fill="none" strokeLinejoin="round">
        <path d="M6 10.5 7.2 7h9.6l1.2 3.5M6.8 10.5V17h10.4v-6.5M10.5 17v-3.2h3V17" strokeWidth="1.4" />
        <path
          d="M6 10.5a1.5 1.5 0 0 0 3 0 1.5 1.5 0 0 0 3 0 1.5 1.5 0 0 0 3 0 1.5 1.5 0 0 0 3 0"
          strokeWidth="1.2"
        />
      </g>
    ),
  },
};

/** Platform badge for the glass theme: a diamond in the brand colour with the logo inside. */
export function PlatformDiamond({
  platform,
  className = 'size-5',
}: {
  platform: string;
  className?: string;
}) {
  const d = DIAMOND[platform] ?? DIAMOND.store!;
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} shrink-0 drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.25)]`}
      aria-label={d.label}
      role="img"
    >
      <polygon
        points="12,.8 23.2,12 12,23.2 .8,12"
        fill={d.fill}
        stroke="rgba(255,255,255,.55)"
        strokeWidth=".8"
      />
      <g transform="translate(12 12) scale(.9) translate(-12 -12.3)">{d.mark}</g>
    </svg>
  );
}
