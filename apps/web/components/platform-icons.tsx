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
