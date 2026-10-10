import React from 'react';

export function BrandGlyph({ size = 18, title, className = '' }) {
  const cyan = 'var(--seis-cyan, #19BED5)';
  const white = '#FFFFFF';
  const dark = '#09090B';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <rect x="5" y="4" width="22" height="17" rx="5" fill={white} stroke={dark} strokeWidth="1.2" />
      <rect x="8" y="9" width="16" height="7" rx="3" fill={cyan} />
      <ellipse cx="12" cy="12.5" rx="1.6" ry="1.8" fill={white} />
      <ellipse cx="20" cy="12.5" rx="1.6" ry="1.8" fill={white} />
      <rect x="14.8" y="0.5" width="2.4" height="4" rx="1.2" fill={cyan} />
      <circle cx="16" cy="0.5" r="1.2" fill={cyan} />
      <rect x="9" y="21" width="14" height="8" rx="3" fill={white} stroke={dark} strokeWidth="1.2" />
      <rect x="4" y="21.5" width="5.5" height="5" rx="2.5" fill={cyan} />
      <rect x="22.5" y="21.5" width="5.5" height="5" rx="2.5" fill={cyan} />
      <circle cx="16" cy="25" r="2" fill={cyan} />
      <circle cx="16" cy="25" r="1" fill={white} />
    </svg>
  );
}

export default function BrandMark({ size = 40, variant = 'framed', className = '' }) {
  const isBare = variant === 'bare';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.25),
        background: isBare ? 'transparent' : 'linear-gradient(145deg, #0B1118 0%, #101820 100%)',
        border: isBare ? '0' : '1.5px solid rgba(25, 190, 213, 0.38)',
        boxShadow: isBare ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.18)',
      }}
    >
      <BrandGlyph size={Math.round(size * (isBare ? 0.92 : 0.72))} title="SEIS AI Copilot" />
    </span>
  );
}
