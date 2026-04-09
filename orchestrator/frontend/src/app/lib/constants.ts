import type { JobState } from './types';

// ── API Base URL ──────────────────────────────────────
export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// ── Language Configuration ────────────────────────────
export const LANG_OPTIONS = [
  { key: 'nepali',  label: 'NEPALI',  flag: 'नेपाली' },
  { key: 'hindi',   label: 'HINDI',   flag: 'हिंदी'  },
  { key: 'english', label: 'ENGLISH', flag: 'English' },
] as const;

export const LANG_ACCENT: Record<string, string> = {
  nepali:  'var(--primary)',
  hindi:   '#FF8C42',
  english: '#9B59F5',
};

// ── Workflow Steps ────────────────────────────────────
export const STEP_ORDER: JobState[] = [
  'DOWNLOADING',
  'TRANSCRIBING',
  'AWAITING_TTS',
  'ALIGNING',
  'REVIEW',
  'APPROVED',
];

export const STEPS: { key: JobState; label: string }[] = [
  { key: 'DOWNLOADING',  label: 'ACQUIRE'     },
  { key: 'TRANSCRIBING', label: 'TRANSCRIBE'  },
  { key: 'AWAITING_TTS', label: 'TTS UPLOAD'  },
  { key: 'ALIGNING',     label: 'SYNCHRONIZE' },
  { key: 'REVIEW',       label: 'REVIEW'      },
  { key: 'APPROVED',     label: 'ARCHIVED'    },
];

// ── Formatters ────────────────────────────────────────
export const fmt = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

export const ts = (s: number) => `${s.toFixed(1)}s`;

export const mUrl = (type: string, id: string) =>
  `${API}/api/media?type=${type}&id=${id}`;
