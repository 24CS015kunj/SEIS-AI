import React from 'react';

/**
 * The 4-square SEIS AI Copilot glyph, originally built inline in AuthModal
 * and later LoginPage. Extracted here so every page reuses one definition
 * instead of re-declaring the same SVG.
 */
export function BrandGlyph({ size = 18, tone = 'onDark' }) {
  const c = tone === 'onDark' ? '#60A5FA' : '#2563EB';
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="6" height="6" rx="1" fill={c} />
      <rect x="10" y="2" width="6" height="6" rx="1" fill={c} opacity="0.6" />
      <rect x="2" y="10" width="6" height="6" rx="1" fill={c} opacity="0.4" />
      <rect x="10" y="10" width="6" height="6" rx="1" fill={c} opacity="0.8" />
    </svg>
  );
}

export default function BrandMark({ size = 40 }) {
  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{ width: size, height: size, borderRadius: size * 0.25, background: '#0F172A' }}
    >
      <BrandGlyph size={size * 0.48} tone="onDark" />
    </div>
  );
}
