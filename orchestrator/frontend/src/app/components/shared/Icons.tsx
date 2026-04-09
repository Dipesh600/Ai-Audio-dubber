// ── SVG Icons ─────────────────────────────────────────
// Extracted from page.tsx inline icon definitions

export const Ico = {
  Target: () => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="0.5" opacity="0.2"/>
      <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="0.7" opacity="0.45"/>
      <circle cx="24" cy="24" r="3" fill="currentColor" opacity="0.8"/>
      <line x1="24" y1="2" x2="24" y2="13" stroke="currentColor" strokeWidth="0.8"/>
      <line x1="24" y1="35" x2="24" y2="46" stroke="currentColor" strokeWidth="0.8"/>
      <line x1="2" y1="24" x2="13" y2="24" stroke="currentColor" strokeWidth="0.8"/>
      <line x1="35" y1="24" x2="46" y2="24" stroke="currentColor" strokeWidth="0.8"/>
    </svg>
  ),
  Download: () => (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <path d="M22 10v20M22 30l-7-7M22 30l7-7M10 36h24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
    </svg>
  ),
  Wave: () => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <path d="M2 24h7l4-14 6 28 4-18 4 12 3-8 4 8 4-12h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Upload: () => (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <path d="M22 32V8M22 8l-8 8M22 8l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
      <path d="M6 28v8a4 4 0 004 4h24a4 4 0 004-4v-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
    </svg>
  ),
  Align: () => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      {[10, 18, 26, 34, 42].map((y, i) => (
        <g key={y}>
          <rect x="2" y={y - 1.5} width="3" height="3" fill="currentColor" opacity={0.35 + i * 0.13}/>
          <line x1="8" y1={y} x2={32 + (i % 3) * 6} y2={y} stroke="currentColor" strokeWidth={i === 2 ? 1.8 : 0.9} opacity={0.35 + i * 0.13}/>
        </g>
      ))}
    </svg>
  ),
  Check: () => (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
      <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="0.7" opacity="0.2"/>
      <path d="M16 29l8 8 16-16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"/>
    </svg>
  ),
  Error: () => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <path d="M24 4L46 44H2L24 4z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <line x1="24" y1="18" x2="24" y2="30" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
      <rect x="22.5" y="34" width="3" height="3" fill="currentColor"/>
    </svg>
  ),
  Film: () => (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <rect x="2" y="8" width="40" height="28" stroke="currentColor" strokeWidth="1"/>
      <line x1="10" y1="8" x2="10" y2="36" stroke="currentColor" strokeWidth="0.7" opacity="0.5"/>
      <line x1="34" y1="8" x2="34" y2="36" stroke="currentColor" strokeWidth="0.7" opacity="0.5"/>
      <path d="M18 18l10 4-10 4z" fill="currentColor" opacity="0.7"/>
    </svg>
  ),
  Book: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 4h14v13H3z" stroke="currentColor" strokeWidth="1" fill="none"/>
      <line x1="7" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="0.8"/>
      <line x1="7" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="0.8"/>
    </svg>
  ),
  Copy: () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="4" y="1" width="9" height="11" rx="0" stroke="currentColor" strokeWidth="1"/>
      <rect x="1" y="4" width="9" height="11" rx="0" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.05"/>
    </svg>
  ),
};
