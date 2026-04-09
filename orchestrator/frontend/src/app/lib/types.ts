// ── Shared Types ──────────────────────────────────────

export type JobState =
  | 'IDLE'
  | 'PENDING'
  | 'DOWNLOADING'
  | 'TRANSCRIBING'
  | 'AWAITING_TTS'
  | 'ALIGNING'
  | 'REVIEW'
  | 'APPROVED'
  | 'ERROR';

export type ViewPanel = JobState | 'LIBRARY';

export interface Seg {
  start: number;
  end: number;
  text: string;
  emotion?: string;
}

export interface Job {
  id: string;
  url: string;
  status: JobState;
  base_name: string;
  title: string;
  video_size_mb: number;
  audio_size_mb: number;
  eng_preview: Seg[];
  nepali_preview: Seg[];
  lang_previews: Record<string, Seg[]>;
  output_paths: Record<string, string>;
  final_paths: Record<string, string>;
  languages: string;
  bgm_path: string;
  output_path: string;
  error: string;
}

export interface LibItem {
  id: string;
  title: string;
  base_name: string;
  created_at: string;
  video_url: string;
  video_urls: Record<string, string>;
  size_mb: number;
}
