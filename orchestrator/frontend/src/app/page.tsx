"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────────────
type JobState = 'IDLE'|'PENDING'|'DOWNLOADING'|'TRANSCRIBING'|'AWAITING_TTS'|'ALIGNING'|'REVIEW'|'APPROVED'|'ERROR';
type ViewPanel = JobState | 'LIBRARY';

interface Seg { start: number; end: number; text: string; emotion?: string; }
interface Job {
  id: string; url: string; status: JobState; base_name: string; title: string;
  video_size_mb: number; audio_size_mb: number;
  eng_preview: Seg[]; nepali_preview: Seg[];
  lang_previews: Record<string, Seg[]>;
  output_paths: Record<string, string>;
  final_paths: Record<string, string>;
  languages: string;
  bgm_path: string;
  output_path: string; error: string;
}
interface LibItem {
  id: string; title: string; base_name: string; created_at: string;
  video_url: string; video_urls: Record<string,string>; size_mb: number;
}

// API URL: use NEXT_PUBLIC_API_URL env var (set in Vercel), fallback to localhost for dev
const API   = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
const mUrl  = (type: string, id: string) => `${API}/api/media?type=${type}&id=${id}`;
const fmt   = (s: number) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
const ts    = (s: number) => `${s.toFixed(1)}s`;

const STEP_ORDER: JobState[] = ['DOWNLOADING','TRANSCRIBING','AWAITING_TTS','ALIGNING','REVIEW','APPROVED'];
const LANG_OPTIONS = [
  { key: 'nepali',  label: 'NEPALI',  flag: 'नेपाली' },
  { key: 'hindi',   label: 'HINDI',   flag: 'हिंदी'  },
  { key: 'english', label: 'ENGLISH', flag: 'English'},
];
const LANG_ACCENT: Record<string, string> = {
  nepali:  'var(--primary)',
  hindi:   '#FF8C42',
  english: '#9B59F5',
};

// ── SVG Icons ─────────────────────────────────────────
const Ico = {
  Target:   () => (<svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="0.5" opacity="0.2"/><circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="0.7" opacity="0.45"/><circle cx="24" cy="24" r="3" fill="currentColor" opacity="0.8"/><line x1="24" y1="2" x2="24" y2="13" stroke="currentColor" strokeWidth="0.8"/><line x1="24" y1="35" x2="24" y2="46" stroke="currentColor" strokeWidth="0.8"/><line x1="2" y1="24" x2="13" y2="24" stroke="currentColor" strokeWidth="0.8"/><line x1="35" y1="24" x2="46" y2="24" stroke="currentColor" strokeWidth="0.8"/></svg>),
  Download: () => (<svg width="44" height="44" viewBox="0 0 44 44" fill="none"><path d="M22 10v20M22 30l-7-7M22 30l7-7M10 36h24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/></svg>),
  Wave:     () => (<svg width="48" height="48" viewBox="0 0 48 48" fill="none"><path d="M2 24h7l4-14 6 28 4-18 4 12 3-8 4 8 4-12h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  Upload:   () => (<svg width="44" height="44" viewBox="0 0 44 44" fill="none"><path d="M22 32V8M22 8l-8 8M22 8l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/><path d="M6 28v8a4 4 0 004 4h24a4 4 0 004-4v-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/></svg>),
  Align:    () => (<svg width="48" height="48" viewBox="0 0 48 48" fill="none">{[10,18,26,34,42].map((y,i)=>(<g key={y}><rect x="2" y={y-1.5} width="3" height="3" fill="currentColor" opacity={0.35+i*.13}/><line x1="8" y1={y} x2={32+(i%3)*6} y2={y} stroke="currentColor" strokeWidth={i===2?1.8:0.9} opacity={0.35+i*.13}/></g>))}</svg>),
  Check:    () => (<svg width="56" height="56" viewBox="0 0 56 56" fill="none"><circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="0.7" opacity="0.2"/><path d="M16 29l8 8 16-16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"/></svg>),
  Error:    () => (<svg width="48" height="48" viewBox="0 0 48 48" fill="none"><path d="M24 4L46 44H2L24 4z" stroke="currentColor" strokeWidth="1.2" fill="none"/><line x1="24" y1="18" x2="24" y2="30" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/><rect x="22.5" y="34" width="3" height="3" fill="currentColor"/></svg>),
  Film:     () => (<svg width="44" height="44" viewBox="0 0 44 44" fill="none"><rect x="2" y="8" width="40" height="28" stroke="currentColor" strokeWidth="1"/><line x1="10" y1="8" x2="10" y2="36" stroke="currentColor" strokeWidth="0.7" opacity="0.5"/><line x1="34" y1="8" x2="34" y2="36" stroke="currentColor" strokeWidth="0.7" opacity="0.5"/><path d="M18 18l10 4-10 4z" fill="currentColor" opacity="0.7"/></svg>),
  Book:     () => (<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 4h14v13H3z" stroke="currentColor" strokeWidth="1" fill="none"/><line x1="7" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="0.8"/><line x1="7" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="0.8"/></svg>),
  Copy:     () => (<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="4" y="1" width="9" height="11" rx="0" stroke="currentColor" strokeWidth="1"/><rect x="1" y="4" width="9" height="11" rx="0" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.05"/></svg>),
};

// ── Stat chip ──────────────────────────────────────────
const Stat = ({ label, val }: { label: string; val: string }) => (
  <div className="px-4 py-3" style={{ background:'var(--bg-mid)', border:'1px solid var(--border-dim)' }}>
    <div className="text-[9px] tracking-[0.2em] mb-1" style={{ fontFamily:'var(--font-mono)', color:'var(--text-muted)' }}>{label}</div>
    <div className="text-sm font-semibold" style={{ color:'var(--primary)', fontFamily:'var(--font-mono)' }}>{val}</div>
  </div>
);

// ── Segment row ────────────────────────────────────────
const SegRow = ({ s, accent }: { s: Seg; accent: string }) => (
  <div className="flex gap-3 py-2 border-b" style={{ borderColor:'rgba(255,255,255,0.04)' }}>
    <span className="text-[10px] w-12 flex-shrink-0 pt-0.5 tabular-nums" style={{ fontFamily:'var(--font-mono)', color:'var(--text-muted)' }}>{ts(s.start)}</span>
    <p className="text-xs flex-1 leading-relaxed" style={{ color:'var(--text-primary)' }}>{s.text}</p>
    {s.emotion && (
      <span className="text-[8px] px-1.5 py-0.5 h-fit flex-shrink-0 tracking-widest uppercase" style={{ border:`1px solid ${accent}44`, color:accent, fontFamily:'var(--font-mono)' }}>
        {s.emotion}
      </span>
    )}
  </div>
);

// ── Transcript panel with COPY button ──────────────────
const TranscriptPanel = ({
  segs, label, accent, copyKey
}: { segs: Seg[]; label: string; accent: string; copyKey: string }) => {
  const [copied, setCopied] = useState(false);

  const copyForElevenLabs = () => {
    if (!segs.length) return;
    const text = segs.map(s => `[${s.emotion || 'Neutral'}] ${s.text}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ border:`1px solid ${accent}18`, background:'var(--bg-low)', display:'flex', flexDirection:'column' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor:`${accent}12` }}>
        <div className="w-1.5 h-1.5" style={{ background:accent }}/>
        <span className="text-[9px] tracking-[0.3em] uppercase flex-1" style={{ fontFamily:'var(--font-mono)', color:accent }}>{label}</span>
        <span className="text-[8px] mr-2" style={{ fontFamily:'var(--font-mono)', color:'var(--text-muted)' }}>{segs.length} segs</span>
        {/* COPY button */}
        <button
          onClick={copyForElevenLabs}
          disabled={!segs.length}
          title="Copy all for ElevenLabs: [Emotion] text"
          className="flex items-center gap-1.5 px-2.5 py-1 text-[8px] tracking-widest uppercase transition-all hover:opacity-100"
          style={{
            border: `1px solid ${copied ? accent : accent + '44'}`,
            color: copied ? accent : `${accent}99`,
            background: copied ? `${accent}15` : 'transparent',
            fontFamily: 'var(--font-mono)',
            opacity: segs.length ? 1 : 0.3,
          }}
        >
          <Ico.Copy/>
          {copied ? 'COPIED!' : 'COPY ALL'}
        </button>
      </div>
      {/* Segments */}
      <div className="overflow-y-auto px-4 py-2" style={{ maxHeight:'240px' }}>
        {segs.length > 0 ? (
          segs.map((s, i) => <SegRow key={i} s={s} accent={accent}/>)
        ) : (
          <p className="text-xs py-4 text-center" style={{ color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>Loading...</p>
        )}
      </div>
      {/* Format hint */}
      {segs.length > 0 && (
        <div className="px-4 py-2 border-t text-[8px]" style={{ borderColor:`${accent}12`, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
          ↑ Copies as: <span style={{color:accent}}>[Emotion] line...</span> — paste directly into ElevenLabs
        </div>
      )}
    </div>
  );
};

// ── Video player ───────────────────────────────────────
const VideoPlayer = ({ src, label='PLAYBACK' }: { src: string; label?: string }) => (
  <div className="w-full" style={{ border:'1px solid var(--border-mid)', background:'#000', boxShadow:'0 0 30px rgba(0,255,204,0.07)', position:'relative' }}>
    <div className="flex items-center gap-2 px-3 py-1.5 border-b" style={{ borderColor:'var(--border-dim)', background:'var(--bg-low)' }}>
      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-slow-pulse"/>
      <span className="text-[9px] tracking-[0.3em]" style={{ fontFamily:'var(--font-mono)', color:'var(--text-muted)' }}>{label}</span>
    </div>
    <video src={src} controls style={{ width:'100%', display:'block', maxHeight:'340px', background:'#000' }}/>
  </div>
);

const AudioPlayer = ({ src, label='AUDIO STREAM' }: { src: string; label?: string }) => (
  <div className="w-full p-4" style={{ border:'1px solid var(--border-dim)', background:'var(--bg-low)' }}>
    <div className="text-[9px] tracking-[0.3em] mb-3" style={{ fontFamily:'var(--font-mono)', color:'var(--text-muted)' }}>{label}</div>
    <audio src={src} controls style={{ width:'100%', height:'36px' }}/>
  </div>
);

// ── Language toggle button ─────────────────────────────
const LangToggle = ({ lang, selected, onToggle }: { lang: typeof LANG_OPTIONS[0]; selected: boolean; onToggle: () => void }) => {
  const accent = LANG_ACCENT[lang.key];
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 px-4 py-2 text-[10px] tracking-[0.15em] uppercase transition-all"
      style={{
        border: `1px solid ${selected ? accent : accent + '33'}`,
        background: selected ? `${accent}12` : 'transparent',
        color: selected ? accent : `${accent}77`,
        fontFamily: 'var(--font-display)',
        boxShadow: selected ? `0 0 12px ${accent}22` : 'none',
      }}
    >
      <div className="w-2 h-2 transition-all" style={{
        background: selected ? accent : 'transparent',
        border: `1px solid ${selected ? accent : accent + '55'}`,
        boxShadow: selected ? `0 0 6px ${accent}` : 'none',
      }}/>
      {lang.label}
      <span className="text-[8px] opacity-60">{lang.flag}</span>
    </button>
  );
};

// ── Main ───────────────────────────────────────────────
export default function Home() {
  const [url, setUrl]             = useState('');
  const [jobId, setJobId]         = useState<string|null>(null);
  const [job, setJob]             = useState<Partial<Job>>({});
  const [jobState, setJobState]   = useState<JobState>('IDLE');
  const [viewPanel, setViewPanel] = useState<ViewPanel>('IDLE');
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['nepali']);
  const [activeLangTab, setActiveLangTab] = useState<string>('nepali');
  const [isDragging, setIsDragging] = useState<string|null>(null); // lang key being dragged over
  const [elapsed, setElapsed]     = useState(0);
  const [startTime, setStartTime] = useState<number|null>(null);
  const [langTtsStatus, setLangTtsStatus] = useState<Record<string,'pending'|'uploading'|'aligning'|'done'>>({});
  const [dubVer, setDubVer]       = useState(0); // cache-bust counter
  const [reviewLang, setReviewLang] = useState<string>(''); // active lang in review panel
  const [library, setLibrary]     = useState<LibItem[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [expandedLib, setExpandedLib] = useState<string|null>(null);
  const [isBgmUploading, setIsBgmUploading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const bgmRef = useRef<HTMLInputElement>(null);
  const activeLangUpload = useRef<string>('nepali'); // which lang the file input is for
  const isManualView = useRef(false);

  // Auto-sync viewPanel
  useEffect(() => {
    if (!isManualView.current) setViewPanel(jobState);
  }, [jobState]);

  const goToPanel = (panel: ViewPanel) => {
    isManualView.current = panel !== jobState;
    setViewPanel(panel);
  };

  // When job lands on AWAITING_TTS, set active lang tab to first selected
  useEffect(() => {
    if (jobState === 'AWAITING_TTS') {
      const preview = (job.lang_previews || {});
      const available = selectedLangs.filter(l => preview[l]?.length > 0);
      if (available.length) setActiveLangTab(available[0]);
    }
  }, [jobState, job.lang_previews]);

  // Unified polling — covers all active states including ALIGNING
  useEffect(() => {
    if (!jobId) return;
    if (['IDLE','APPROVED','ERROR'].includes(jobState)) return;
    // Poll faster during DOWNLOADING (when video is being acquired) to catch status transitions quickly
    const interval = jobState === 'DOWNLOADING' ? 500 : jobState === 'TRANSCRIBING' ? 1000 : 2000;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/job-status/${jobId}`);
        const d: Job = await r.json();
        const newStatus = d.status;
        if (newStatus && newStatus !== jobState) {
          if (jobState === 'ALIGNING' && newStatus === 'REVIEW') {
            setDubVer(v => v + 1);
            setLangTtsStatus(prev => {
              const upd = { ...prev };
              Object.keys(upd).forEach(l => { if (upd[l] === 'aligning') upd[l] = 'done'; });
              return upd;
            });
            const stagingPaths = d.output_paths || {};
            const finPaths     = d.final_paths  || {};
            const allDoneLangs = [...Object.keys(stagingPaths), ...Object.keys(finPaths)];
            const jLangs = d.languages ? d.languages.split(',').map((l:string)=>l.trim()) : [];
            const pendingLangs = jLangs.filter((l:string) => !allDoneLangs.includes(l));

            if (pendingLangs.length > 0) {
              // Still have languages to upload — stay on TTS Upload so user can continue
              setJob(d);
              setJobState(newStatus);
              isManualView.current = true;  // prevent auto-navigation away
              setViewPanel('AWAITING_TTS');
            } else {
              // All langs done — auto-navigate to REVIEW
              const first = Object.keys(stagingPaths)[0] || Object.keys(finPaths)[0];
              if (first) setReviewLang(first);
              setJobState(newStatus); setJob(d); isManualView.current = false;
            }
            return; // skip generic handler below
          }
          setJobState(newStatus); setJob(d); isManualView.current = false;
        } else {
          setJob(prev => ({ ...prev, ...d }));
        }
      } catch {}
    }, interval);
    return () => clearInterval(iv);
  }, [jobId, jobState]);

  // Timer
  useEffect(() => {
    if (!startTime || ['IDLE','APPROVED','ERROR','AWAITING_TTS','REVIEW'].includes(jobState)) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now()-startTime!)/1000)), 1000);
    return () => clearInterval(t);
  }, [startTime, jobState]);

  // Library
  const fetchLibrary = useCallback(async () => {
    setLibLoading(true);
    try { const r = await fetch(`${API}/api/library`); setLibrary(await r.json()); } catch {}
    setLibLoading(false);
  }, []);
  useEffect(() => { fetchLibrary(); }, []);

  // Actions
  const initiate = async () => {
    if (!url.trim()) return;
    setJobState('PENDING'); setStartTime(Date.now()); setElapsed(0); setJob({});
    isManualView.current = false;
    try {
      const r = await fetch(`${API}/api/start-job`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ url, languages: selectedLangs })
      });
      const d = await r.json();
      setJobId(d.id); setJobState(d.status);
    } catch { setJobState('ERROR'); setJob({ error:'Cannot reach backend.' }); }
  };

  const uploadTTS = async (file: File, lang: string = 'nepali') => {
    if (!jobId) return;
    setLangTtsStatus(prev => ({ ...prev, [lang]: 'uploading' }));
    const form = new FormData();
    form.append('audio', file);
    form.append('lang', lang);
    try {
      await fetch(`${API}/api/upload-tts/${jobId}`, { method:'POST', body:form });
      setLangTtsStatus(prev => ({ ...prev, [lang]: 'aligning' }));
      setJobState('ALIGNING'); isManualView.current = false;
    } catch {
      setLangTtsStatus(prev => ({ ...prev, [lang]: 'pending' }));
      setJobState('ERROR'); setJob({ error:'Upload failed.' });
    }
  };

  const uploadBGM = async (file: File) => {
    if (!jobId) return;
    setIsBgmUploading(true);
    const form = new FormData();
    form.append('bgm', file);
    try {
      const res = await fetch(`${API}/api/upload-bgm/${jobId}`, { method: 'POST', body: form });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setJob(prev => ({ ...prev, bgm_path: data.bgm_path }));
    } catch {
      setJobState('ERROR'); setJob({ error: 'BGM Upload failed.' });
    } finally {
      setIsBgmUploading(false);
    }
  };

  const approve = async () => {
    if (!jobId) return;
    await fetch(`${API}/api/approve/${jobId}`, { method:'POST' });
    setJobState('APPROVED'); isManualView.current = false; fetchLibrary();
  };

  const reject = async (lang?: string) => {
    if (!jobId) return;
    const target = lang || reviewLang || jobLangs[0] || 'nepali';
    const r = await fetch(`${API}/api/reject/${jobId}?lang=${target}`, { method:'POST' });
    const d: Job = await r.json();
    setLangTtsStatus(prev => ({ ...prev, [target]: 'pending' }));
    setDubVer(v => v + 1);
    setJob(d); setJobState(d.status as JobState); isManualView.current = false;
    // Clear reviewLang if the rejected lang is no longer in the available set
    const newOutputPaths = d.output_paths || {};
    const newFinalPaths  = d.final_paths  || {};
    const newAllReadyLangs = [...new Set([...Object.keys(newOutputPaths), ...Object.keys(newFinalPaths)])];
    if (!newAllReadyLangs.includes(reviewLang)) setReviewLang('');
  };

  const reset = () => {
    setJobState('IDLE'); setJobId(null); setUrl(''); setJob({});
    setStartTime(null); setElapsed(0); setSelectedLangs(['nepali']);
    isManualView.current = false;
  };

  const toggleLang = (key: string) => {
    setSelectedLangs(prev =>
      prev.includes(key)
        ? (prev.length > 1 ? prev.filter(l => l !== key) : prev) // keep at least 1
        : [...prev, key]
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadTTS(f, activeLangUpload.current);
    e.target.value = ''; // reset so same file can be re-selected
  };

  const handleBgmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadBGM(f);
    e.target.value = '';
  };

  // canUploadTTS: true whenever job has started and origin files still exist
  // (backend blocks upload for langs already in final_paths)
  const canUploadTTS = !!jobId && !['IDLE','PENDING','DOWNLOADING','TRANSCRIBING','APPROVED'].includes(jobState);

  // Derived data
  const langPreviews = (job.lang_previews || {}) as Record<string, Seg[]>;
  const jobLangs     = job.languages ? job.languages.split(',').map(l=>l.trim()).filter(Boolean) : selectedLangs;
  const outputPaths  = (job.output_paths || {}) as Record<string, string>;
  const finalPaths   = (job.final_paths  || {}) as Record<string, string>;
  const savedLangs   = Object.keys(finalPaths);          // already committed to finals
  const alignedLangs = Object.keys(outputPaths);         // staged (ready for review, not yet saved)
  const allReadyLangs = [...new Set([...savedLangs, ...alignedLangs])]; // union
  // effectiveReviewLang: prefer staged (richer actions), then saved
  const effectiveReviewLang = (
    (reviewLang && allReadyLangs.includes(reviewLang)) ? reviewLang :
    alignedLangs[0] || savedLangs[0] || jobLangs[0] || 'nepali'
  );

  const STEPS: { key: JobState; label: string }[] = [
    { key:'DOWNLOADING',  label:'ACQUIRE'     },
    { key:'TRANSCRIBING', label:'TRANSCRIBE'  },
    { key:'AWAITING_TTS', label:'TTS UPLOAD'  },
    { key:'ALIGNING',     label:'SYNCHRONIZE' },
    { key:'REVIEW',       label:'REVIEW'      },
    { key:'APPROVED',     label:'ARCHIVED'    },
  ];
  const curIdx = STEP_ORDER.indexOf(jobState);

  return (
    <>
      <main className="relative z-10 h-screen flex flex-col overflow-hidden bg-[#111827]">

        {/* ── HEADER ── */}
        <header className="flex-shrink-0 flex items-center justify-between px-4 md:px-7 py-4 border-b border-gray-800 bg-[#0F172A]">
          <div className="flex items-center gap-3">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect x="2" y="2" width="28" height="28" rx="6" fill="#00B8FF" fillOpacity="0.1" stroke="#00B8FF" strokeWidth="1.5"/>
              <path d="M10 16h5l2-6 3 12 2-6h5" stroke="#00B8FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div>
              <h1 className="text-base md:text-lg font-semibold tracking-wide text-gray-100">
                Setu<span className="text-[#00B8FF]">Dub</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {startTime && !['IDLE','APPROVED'].includes(jobState) && (
              <div className="hidden md:block px-3 py-1.5 text-xs font-mono text-[#00B8FF] bg-[#1E293B] border border-gray-700 rounded-md">
                T+ {fmt(elapsed)}
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1E293B] border border-gray-700 rounded-md">
              <div className={`w-2 h-2 rounded-full ${jobState==='ERROR'?'bg-red-500':jobState==='IDLE'?'bg-emerald-500 animate-pulse':'bg-amber-400 animate-pulse'}`}/>
              <span className="text-[10px] md:text-xs font-medium tracking-wider text-gray-300">
                {jobState==='IDLE'?'STANDBY':jobState==='ERROR'?'FAULT':jobState==='APPROVED'?'ARCHIVED':'ACTIVE'}
              </span>
            </div>
          </div>
        </header>

        {/* ── URL + LANGUAGE BAR ── */}
        <div className="flex-shrink-0 border-b border-gray-800 bg-[#0F172A]">
          {/* URL row */}
          <div className="flex flex-col md:flex-row md:items-center gap-3 px-4 md:px-7 py-3 md:py-4 border-b border-gray-800">
            <span className="text-[10px] md:text-xs font-semibold tracking-widest text-gray-500 flex-shrink-0">TARGET URL</span>
            <div className="flex flex-1 gap-2">
              <input type="text" placeholder="Paste YouTube URL..." value={url}
                onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&initiate()}
                className="input-terminal flex-1 px-4 py-2.5 text-sm w-full"
              />
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <button onClick={initiate} disabled={!['IDLE','ERROR','APPROVED'].includes(jobState)}
                className="btn-primary flex-1 md:flex-none px-6 py-2.5 text-sm min-w-[120px]">
                INITIATE
              </button>
              {['ERROR','APPROVED'].includes(jobState) && (
                <button onClick={reset}
                  className="px-6 py-2.5 text-sm font-semibold text-gray-300 border border-gray-600 rounded-lg transition-all hover:bg-white/5 disabled:opacity-50 flex-shrink-0">
                  RESET
                </button>
              )}
            </div>
          </div>
          {/* Language selector row */}
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 px-4 md:px-7 py-3 overflow-x-auto scrollbar-hide">
            <span className="text-[10px] md:text-xs font-semibold tracking-widest text-gray-500 flex-shrink-0">LANGUAGES</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              {LANG_OPTIONS.map(lang => (
                <LangToggle
                  key={lang.key}
                  lang={lang}
                  selected={selectedLangs.includes(lang.key)}
                  onToggle={() => !['DOWNLOADING','TRANSCRIBING','ALIGNING'].includes(jobState) && toggleLang(lang.key)}
                />
              ))}
            </div>
            {selectedLangs.length > 1 && (
              <div className="flex items-center gap-2 ml-auto text-xs text-gray-400">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00B8FF] animate-pulse"/>
                <span>{selectedLangs.length} selected</span>
              </div>
            )}
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          
          {/* ─ SIDEBAR / MOBILE NAV ─ */}
          <aside className="w-full md:w-56 flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-800 flex md:flex-col bg-[#0F172A] z-20">
            <div className="hidden md:block px-5 py-4 border-b border-gray-800">
              <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">WORKFLOW</span>
            </div>
            
            <div className="flex-1 flex md:flex-col overflow-x-auto md:overflow-y-auto px-2 md:px-5 py-2 md:py-6 relative scrollbar-hide">
              <div className="hidden md:block absolute left-[27px] top-9 bottom-9 w-[2px] bg-gray-800"/>
              {STEPS.map((step, idx) => {
                const isActive    = step.key === jobState;
                const isCompleted = curIdx > idx;
                const isViewing   = viewPanel === step.key;
                const clickable   = isCompleted || isActive;
                return (
                  <div key={step.key}
                    className={`relative z-10 flex md:flex-row items-center gap-2 md:gap-4 px-3 md:px-0 py-2 md:py-3 min-w-max md:min-w-0 ${clickable?'cursor-pointer hover:bg-white/5 md:hover:bg-transparent rounded-lg md:rounded-none':''}`}
                    onClick={() => clickable && goToPanel(step.key)}
                  >
                    <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full flex-shrink-0 transition-all border-2" style={{
                      background: isActive?'#00B8FF':isCompleted?'#10B981':'#1E293B',
                      borderColor: isActive?'rgba(0,184,255,0.3)':isCompleted?'rgba(16,185,129,0.3)':'#334155',
                      boxShadow: isActive?'0 0 12px rgba(0,184,255,0.5)':isCompleted?'0 0 8px rgba(16,185,129,0.2)':'none',
                    }}/>
                    <div className="flex flex-col">
                      <span className="text-[11px] md:text-xs font-semibold tracking-wide" style={{
                        color: isActive?'#00B8FF':isCompleted?'#10B981':'#94A3B8',
                        textDecoration: isViewing&&!isActive?'underline':undefined,
                        textDecorationThickness: '2px',
                        textUnderlineOffset: '4px'
                      }}>{step.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="md:border-t border-l md:border-l-0 border-gray-800 flex-shrink-0">
              <button className="h-full md:w-full flex md:items-center gap-3 px-4 md:px-5 py-3 md:py-4 transition-all hover:bg-white/5" onClick={()=>goToPanel('LIBRARY')}>
                <div style={{color:viewPanel==='LIBRARY'?'#00B8FF':'#94A3B8'}}><Ico.Book/></div>
                <div className="text-left hidden md:block">
                  <div className="text-xs font-bold tracking-wider" style={{color:viewPanel==='LIBRARY'?'#00B8FF':'#94A3B8'}}>LIBRARY</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{library.length} Projects</div>
                </div>
              </button>
            </div>
          </aside>

          {/* ─ CENTER ─ */}
          <section className="flex-1 overflow-y-auto relative bg-[#111827]">

            <div className="flex flex-col min-h-full px-10 py-8">

              {/* ══ IDLE ══ */}
              {viewPanel==='IDLE' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-5 opacity-35" style={{color:'var(--primary)'}}>
                  <div className="animate-float"><Ico.Target/></div>
                  <div className="text-center">
                    <p className="text-xl tracking-[0.5em]" style={{fontFamily:'var(--font-display)',color:'var(--primary)'}}>STANDBY</p>
                    <p className="text-[10px] mt-2 tracking-[0.25em]" style={{fontFamily:'var(--font-mono)',color:'var(--text-muted)'}}>PASTE URL · SELECT LANGUAGE · INITIATE</p>
                  </div>
                </div>
              )}

              {/* ══ IDLE ══ */}
              {viewPanel==='IDLE' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-5 opacity-50 text-[#00B8FF]">
                  <div className="animate-float"><Ico.Target/></div>
                  <div className="text-center">
                    <p className="text-xl font-bold tracking-widest">STANDBY</p>
                    <p className="text-xs mt-2 tracking-[0.2em] text-gray-500">PASTE URL · SELECT LANGUAGE · INITIATE</p>
                  </div>
                </div>
              )}

              {/* ══ DOWNLOADING ══ */}
              {viewPanel==='DOWNLOADING' && (
                <div className="flex flex-col items-center gap-6 max-w-2xl mx-auto w-full">
                  {job.base_name && jobId ? (
                    <>
                      <div className="w-full">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-1.5 h-1.5 bg-[#00B8FF]"/>
                          <span className="text-[10px] font-bold tracking-widest text-[#00B8FF]">ORIGINAL VIDEO</span>
                        </div>
                        <VideoPlayer src={mUrl('video',jobId)} label="ORIGINAL VIDEO STREAM"/>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
                        <Stat label="VIDEO"  val={`${job.video_size_mb} MB`}/>
                        <Stat label="AUDIO"  val={`${job.audio_size_mb} MB`}/>
                        <Stat label="STATUS" val="ACQUIRED"/>
                      </div>
                      {job.title && (
                        <div className="w-full p-4 border border-gray-800 bg-[#1E293B] rounded-lg">
                          <p className="text-[10px] font-bold tracking-wider text-gray-500 mb-1">IDENTIFIER</p>
                          <p className="text-sm font-medium text-gray-200">{job.title}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="relative">
                        <div className="w-20 h-20 spinner-ring" style={{borderTopColor:'#00B8FF'}}/>
                        <div className="absolute inset-0 flex items-center justify-center text-[#00B8FF]"><Ico.Download/></div>
                      </div>
                      <div className="text-center">
                        <h2 className="text-lg font-bold tracking-widest text-[#00B8FF]">ACQUIRING ASSETS</h2>
                        <p className="text-xs mt-2 tracking-wider text-gray-400">yt-dlp → video + audio stream</p>
                      </div>
                      <div className="w-full max-w-sm p-4 border border-gray-800 bg-[#1E293B] rounded-lg mt-4">
                        <p className="text-[10px] font-bold tracking-wider text-gray-500 mb-2">TARGET</p>
                        <p className="text-sm break-all font-mono text-gray-300">{url}</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ══ TRANSCRIBING ══ */}
              {viewPanel==='TRANSCRIBING' && (
                <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className={`text-[#00B8FF] ${jobState==='TRANSCRIBING'?'animate-pulse':''}`}><Ico.Wave/></div>
                    <div>
                      <h2 className="text-lg font-bold tracking-widest text-[#00B8FF]">
                        {jobState==='TRANSCRIBING'?'NEURAL TRANSCRIPTION':'TRANSCRIPTION COMPLETE'}
                      </h2>
                      <p className="text-[10px] md:text-xs mt-1 tracking-wider text-gray-400">
                        Whisper → Gemini 2.5 Flash · {jobLangs.map(l=>l.charAt(0).toUpperCase()+l.slice(1)).join(' + ')}
                      </p>
                    </div>
                    {job.video_size_mb ? (
                      <div className="md:ml-auto flex gap-3"><Stat label="VIDEO" val={`${job.video_size_mb} MB`}/><Stat label="AUDIO" val={`${job.audio_size_mb} MB`}/></div>
                    ) : null}
                  </div>
                  {jobId && job.base_name && <AudioPlayer src={mUrl('audio',jobId)} label="ORIGINAL AUDIO STREAM"/>}
                  {jobState!=='TRANSCRIBING' && Object.keys(langPreviews).length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(langPreviews).map(([lang, segs]) => (
                        <TranscriptPanel key={lang} segs={segs} label={`${lang.toUpperCase()} SCRIPT`} accent={LANG_ACCENT[lang]||'#00B8FF'} copyKey={lang}/>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 items-center mt-8">
                      <div className="flex items-end gap-1 h-12 w-full max-w-md mx-auto">
                        {Array.from({length:32}).map((_,i)=>(
                          <div key={i} className="flex-1 animate-pulse bg-[#00B8FF] rounded-t-sm" style={{height:`${20+Math.sin(i*0.65)*40+Math.random()*40}%`,opacity:0.3+Math.random()*0.4,animationDelay:`${i*0.07}s`}}/>
                        ))}
                      </div>
                      <p className="text-xs font-medium tracking-widest mt-4 text-gray-400 animate-pulse">
                        Translating to {jobLangs.map(l=>l.charAt(0).toUpperCase()+l.slice(1)).join(', ')}...
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ══ TTS UPLOAD ══ */}
              {viewPanel==='AWAITING_TTS' && (
                <div className="flex flex-col gap-5 max-w-4xl mx-auto w-full">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold tracking-widest text-[#10B981]">TTS AUDIO UPLOAD</h2>
                      <p className="text-xs mt-2 tracking-wider text-gray-400">
                        Generate voice-over externally → drop here to synchronize
                      </p>
                    </div>
                    {job.video_size_mb ? (
                      <div className="flex gap-3 flex-shrink-0">
                        <Stat label="VIDEO" val={`${job.video_size_mb} MB`}/>
                        <Stat label="AUDIO" val={`${job.audio_size_mb} MB`}/>
                      </div>
                    ) : null}
                  </div>

                  {/* Language tabs + transcript panels */}
                  {Object.keys(langPreviews).length > 0 && (
                    <div>
                      {/* Tab bar */}
                      {jobLangs.length > 1 && (
                        <div className="flex gap-2 mb-4 border-b border-gray-800 overflow-x-auto scrollbar-hide">
                          {jobLangs.filter(l=>langPreviews[l]).map(lang => {
                             const isActive = activeLangTab === lang;
                             const accent   = LANG_ACCENT[lang] || '#00B8FF';
                             return (
                               <button key={lang} onClick={()=>setActiveLangTab(lang)}
                                 className={`px-5 py-3 text-xs font-bold tracking-widest uppercase transition-all whitespace-nowrap`}
                                 style={{
                                   color: isActive ? accent : '#64748B',
                                   borderBottom: isActive ? `2px solid ${accent}` : '2px solid transparent',
                                   background: isActive ? `${accent}11` : 'transparent',
                                 }}>
                                 {lang}
                               </button>
                             );
                          })}
                        </div>
                      )}
                      {/* Active transcript */}
                      <div className="mt-3">
                        {jobLangs.filter(l=>langPreviews[l]).length === 1 ? (
                          /* Single language — show both original + script side by side */
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <TranscriptPanel
                              segs={(job.eng_preview||[]) as Seg[]}
                              label="ENGLISH (ORIGINAL)"
                              accent="#94A3B8"
                              copyKey="english_orig"
                            />
                            <TranscriptPanel
                              segs={langPreviews[jobLangs[0]] || []}
                              label={`${jobLangs[0].toUpperCase()} SCRIPT`}
                              accent={LANG_ACCENT[jobLangs[0]]||'#00B8FF'}
                              copyKey={jobLangs[0]}
                            />
                          </div>
                        ) : (
                          /* Multi language — show active tab's transcript with original below */
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <TranscriptPanel
                              segs={(job.eng_preview||[]) as Seg[]}
                              label="ENGLISH (ORIGINAL)"
                              accent="#94A3B8"
                              copyKey="english_orig"
                            />
                            <TranscriptPanel
                              segs={langPreviews[activeLangTab] || []}
                              label={`${activeLangTab.toUpperCase()} SCRIPT`}
                              accent={LANG_ACCENT[activeLangTab]||'#00B8FF'}
                              copyKey={activeLangTab}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Reference audio */}
                  {jobId && job.base_name && (
                    <AudioPlayer src={mUrl('audio',jobId)} label="REFERENCE AUDIO (ORIGINAL)"/>
                  )}

                   {/* Per-language upload zones */}
                  <div className={`grid gap-4 ${jobLangs.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                    {jobLangs.map(lang => {
                      const acc     = LANG_ACCENT[lang] || '#00B8FF';
                      const status  = langTtsStatus[lang] || 'pending';
                      const isSaved = savedLangs.includes(lang);   // already in finals, can't redo
                      const isDone  = alignedLangs.includes(lang); // staged, pending review/save
                      const isAli   = status === 'aligning';
                      const isUp    = status === 'uploading';
                      const isDrag  = isDragging === lang;
                      return (
                        <div key={lang} className="rounded-lg overflow-hidden" style={{
                          border:`1px solid ${isSaved ? acc+'66' : isDone ? acc+'44' : acc+'22'}`,
                          background:'#1E293B'
                        }}>
                          {/* Zone header */}
                          <div className="flex items-center gap-2 px-4 py-3 border-b" style={{borderColor:acc+'22'}}>
                            <div className="w-2 h-2 rounded-full" style={{background: (isSaved||isDone) ? acc : 'transparent', border:`1px solid ${acc}`, boxShadow: (isSaved||isDone) ? `0 0 8px ${acc}` : 'none'}}/>
                            <span className="text-[10px] font-bold tracking-widest flex-1 uppercase" style={{color:acc}}>{lang} VOICEOVER</span>
                            {isSaved && <span className="text-[10px] font-bold tracking-widest text-[#00B8FF]">⬡ SAVED</span>}
                            {!isSaved && isDone && <span className="text-[10px] font-bold tracking-widest text-[#10B981]">✓ STAGED</span>}
                            {isAli && <span className="text-[10px] font-bold tracking-widest animate-pulse" style={{color:acc}}>⟳ PROCESSING</span>}
                          </div>
                          {/* Zone body */}
                          {isSaved ? (
                            // Already saved to finals — cannot redo from here
                            <div className="p-5 flex flex-col md:flex-row items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-[#10B981] shadow-[0_0_8px_#10B981]"/>
                              <p className="text-xs flex-1 text-gray-400 font-medium">Saved to finals — go to REVIEW to watch</p>
                              <button onClick={() => goToPanel('REVIEW')}
                                className="w-full md:w-auto px-4 py-2 mt-2 md:mt-0 text-xs font-bold tracking-wider uppercase rounded-md transition-all hover:bg-white/5"
                                style={{border:'1px solid #10B981',color:'#10B981'}}>
                                VIEW →
                              </button>
                            </div>
                          ) : isDone ? (
                            <div className="p-5 flex flex-col items-start gap-4">
                              <p className="text-xs text-gray-400 font-medium">Dubbed video ready — review it</p>
                              <div className="flex gap-3 w-full">
                                <button onClick={() => goToPanel('REVIEW')}
                                  className="flex-1 px-4 py-2.5 text-xs font-bold tracking-wider uppercase rounded-md transition-all"
                                  style={{background:acc,color:'#FFFFFF'}}>
                                  REVIEW
                                </button>
                                <button onClick={() => reject(lang)}
                                  className="flex-1 px-4 py-2.5 text-xs font-bold tracking-wider uppercase rounded-md transition-all hover:bg-red-500/10"
                                  style={{border:`1px solid #EF4444`,color:'#EF4444'}}>
                                  ✗ REDO
                                </button>
                              </div>
                            </div>
                          ) : isAli ? (
                            <div className="p-8 flex flex-col items-center gap-4">
                              <div className="w-10 h-10 spinner-ring border-[#334155]" style={{borderTopColor:acc}}/>
                              <p className="text-[10px] font-bold tracking-widest uppercase" style={{color:acc}}>TRANSCRIBING + ALIGNING...</p>
                            </div>
                          ) : (
                            <div
                              className={`p-8 flex flex-col items-center gap-3 cursor-pointer transition-all ${isDrag?'scale-[1.02]':''}`}
                              style={{background: isDrag ? `${acc}11` : undefined}}
                              onClick={() => { if (!canUploadTTS) return; activeLangUpload.current = lang; fileRef.current?.click(); }}
                              onDrop={e => { e.preventDefault(); setIsDragging(null); const f = e.dataTransfer.files?.[0]; if(f && canUploadTTS) uploadTTS(f, lang); }}
                              onDragOver={e => { e.preventDefault(); setIsDragging(lang); }}
                              onDragLeave={() => setIsDragging(null)}
                            >
                              {isUp ? (
                                <>
                                  <div className="w-10 h-10 spinner-ring border-[#334155]" style={{borderTopColor:acc}}/>
                                  <p className="text-[10px] font-bold tracking-widest uppercase mt-2" style={{color:acc}}>UPLOADING...</p>
                                </>
                              ) : (
                                <>
                                  <div style={{color:acc, opacity:0.8}} className="animate-float"><Ico.Upload/></div>
                                  <p className="text-xs font-bold tracking-widest uppercase mt-2" style={{color:acc}}>DROP {lang} AUDIO</p>
                                  <p className="text-xs text-gray-500 font-medium">mp3 / wav · click to browse</p>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* ══ BGM UPLOAD (OPTIONAL) ══ */}
                  <div 
                    className="p-6 flex flex-col items-center gap-3 border border-dashed border-gray-700 bg-[#0F172A] rounded-lg transition-all hover:border-gray-500"
                    style={{cursor: canUploadTTS ? 'pointer' : 'default'}}
                    onClick={() => { if (canUploadTTS) bgmRef.current?.click() }}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if(f && canUploadTTS) uploadBGM(f); }}
                    onDragOver={e => e.preventDefault()}
                  >
                    {isBgmUploading ? (
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 spinner-ring border-[#334155] border-t-[#00B8FF]"/>
                        <p className="text-xs font-bold tracking-widest text-[#00B8FF]">UPLOADING BGM...</p>
                      </div>
                    ) : job.bgm_path ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center gap-2 bg-[#00B8FF]/10 px-4 py-2 rounded-full border border-[#00B8FF]/30">
                           <div className="w-2 h-2 rounded-full bg-[#00B8FF] shadow-[0_0_8px_#00B8FF]"/>
                           <p className="text-[10px] font-bold tracking-widest text-[#00B8FF]">BGM ATTACHED</p>
                        </div>
                        <p className="text-xs text-gray-400 font-medium">Original background music will be mixed with the generated vocals.</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-center gap-2">
                        <p className="text-xs font-bold tracking-widest text-gray-300">+ ADD BACKGROUND MUSIC (OPTIONAL)</p>
                        <p className="text-xs max-w-sm text-gray-500 font-medium leading-relaxed">
                          Want studio-quality output? Extract the background track using <a href="https://vocalremover.org/" target="_blank" rel="noreferrer" className="underline text-[#00B8FF]" onClick={e=>e.stopPropagation()}>vocalremover.org</a> and upload it here before aligning.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Go to review shortcut when at least one lang is ready (staged or saved) */}
                  {allReadyLangs.length > 0 && (viewPanel as string) !== 'REVIEW' && (
                    <button onClick={() => goToPanel('REVIEW')}
                      className="w-full py-4 mt-2 text-sm font-bold tracking-widest uppercase rounded-lg transition-all hover:bg-[#00B8FF]/10"
                      style={{border:'1px solid #00B8FF',color:'#00B8FF'}}>
                      → REVIEW {allReadyLangs.length} DUBBED VIDEO{allReadyLangs.length>1?'S':''}
                    </button>
                  )}
                  <input ref={fileRef} type="file" className="hidden" accept=".mp3,.wav" onChange={handleFileChange}/>
                  <input ref={bgmRef} type="file" className="hidden" accept=".mp3,.wav" onChange={handleBgmChange}/>
                </div>
              )}

              {/* ══ ALIGNING ══ */}
              {viewPanel==='ALIGNING' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-8 max-w-lg mx-auto w-full">
                  <div className="text-[#00B8FF] animate-pulse"><Ico.Align/></div>
                  <div className="text-center">
                    <h2 className="text-lg font-bold tracking-widest text-[#00B8FF]">TEMPORAL ALIGNMENT</h2>
                    <p className="text-xs mt-2 tracking-wider text-gray-400">Silence padding · Ducking · Muxing</p>
                  </div>
                  <div className="w-full h-1.5 overflow-hidden bg-gray-800 rounded-full mt-4">
                    <div className="h-full bg-[#00B8FF] animate-pulse rounded-full" style={{width:'55%',boxShadow:'0 0 12px 2px #00B8FF'}}/>
                  </div>
                </div>
              )}

              {/* ══ REVIEW ══ */}
              {viewPanel==='REVIEW' && (
                <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="text-[#00B8FF]"><Ico.Film/></div>
                    <div className="flex-1">
                      <h2 className="text-lg font-bold tracking-widest text-[#00B8FF]">OUTPUT READY FOR REVIEW</h2>
                      <p className="text-xs mt-1 text-gray-400 font-medium">
                        {allReadyLangs.length} language{allReadyLangs.length!==1?'s':''} ready
                        {savedLangs.length > 0 ? ` · ${savedLangs.length} saved to finals` : ''}
                        {' · Save each, then Finish to archive'}
                      </p>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                      <Stat label="SOURCE" val={job.title?.slice(0,16)+(job.title&&job.title.length>16?'…':'') || '—'}/>
                    </div>
                  </div>

                  {/* Language tabs — show ALL ready langs (staged + saved) */}
                  {allReadyLangs.length > 1 && (
                    <div className="flex gap-2 border-b border-gray-800 overflow-x-auto scrollbar-hide">
                      {allReadyLangs.map(lang => {
                        const acc    = LANG_ACCENT[lang] || '#00B8FF';
                        const active = effectiveReviewLang === lang;
                        const isSav  = savedLangs.includes(lang);
                        return (
                          <button key={lang} onClick={() => setReviewLang(lang)}
                            className={`px-5 py-3 text-xs font-bold tracking-widest uppercase transition-all flex items-center gap-2 whitespace-nowrap`}
                            style={{color:active?acc:'#64748B',
                              borderBottom:`2px solid ${active?acc:'transparent'}`,background:active?`${acc}11`:'transparent'}}>
                            {lang}
                            {isSav && <span style={{color:'#10B981',fontSize:'8px'}}>⬡</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Video for active lang — cache-busted so REDO always refreshes */}
                  {jobId && allReadyLangs.length > 0 && (
                    <VideoPlayer
                      key={`${effectiveReviewLang}-${dubVer}`}
                      src={`${API}/api/media?type=dubbed&id=${jobId}&lang=${effectiveReviewLang}&v=${dubVer}`}
                      label={`${effectiveReviewLang.toUpperCase()} DUBBED VIDEO${savedLangs.includes(effectiveReviewLang)?' · SAVED':''}`}
                    />
                  )}

                  {/* Pending lang notice */}
                  {jobLangs.some(l => !allReadyLangs.includes(l)) && (
                    <div className="flex flex-col md:flex-row md:items-center gap-3 px-4 py-3 border border-dashed border-gray-700 bg-[#1E293B] rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-[#F59E0B] shadow-[0_0_8px_#F59E0B] animate-pulse"/>
                      <p className="text-xs font-medium text-gray-400">
                        {jobLangs.filter(l=>!allReadyLangs.includes(l)).map(l=>l.toUpperCase()).join(', ')}{' '}still pending —{' '}
                        <button onClick={()=>goToPanel('AWAITING_TTS')} className="underline text-[#00B8FF] font-bold">upload TTS →</button>
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  {jobState==='REVIEW' && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button onClick={approve}
                          className="w-full py-4 text-sm font-bold tracking-widest uppercase transition-all rounded-md hover:bg-[#10B981]/10"
                          style={{color:'#10B981', border:'1px solid #10B981'}}>
                          {jobLangs.every(l => [...savedLangs, ...alignedLangs].includes(l))
                            ? '✓ SAVE ALL & FINISH'
                            : `✓ SAVE ${alignedLangs.map(l=>l.toUpperCase()).join(' + ')}`
                          }
                        </button>
                        <button
                          onClick={() => reject(effectiveReviewLang)}
                          disabled={savedLangs.includes(effectiveReviewLang)}
                          className="w-full py-4 text-sm font-bold tracking-widest uppercase transition-all rounded-md hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{color:'#EF4444', border:'1px solid #EF4444'}}>
                          {savedLangs.includes(effectiveReviewLang)
                            ? `⬡ ${effectiveReviewLang.toUpperCase()} SAVED`
                            : `✗ REDO ${effectiveReviewLang.toUpperCase()}`
                          }
                        </button>
                      </div>
                      <p className="text-center text-[10px] text-gray-500 font-medium md:mt-2">
                        Save → archives staged video{alignedLangs.length>1?'s':''} · Redo → re-upload that language&apos;s voice-over
                        <br className="hidden md:block" />
                        Saved langs (<span style={{color:'#10B981'}}>⬡</span>) cannot be redone
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* ══ APPROVED ══ */}
              {viewPanel==='APPROVED' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-5">
                  <div className="text-[#10B981]"><Ico.Check/></div>
                  <div className="text-center">
                    <h2 className="text-xl font-bold tracking-widest text-[#10B981]">ARCHIVED</h2>
                    <p className="text-sm mt-3 text-gray-300 font-medium">Dubbed video saved to <span className="text-[#00B8FF]">output/finals/</span></p>
                    <p className="text-xs mt-1 text-gray-500">All intermediate files deleted · Storage freed</p>
                    <p className="text-xs mt-4 text-gray-400">
                      View in <button onClick={()=>goToPanel('LIBRARY')} className="underline text-[#00B8FF] font-bold">LIBRARY →</button>
                    </p>
                  </div>
                </div>
              )}

              {/* ══ ERROR ══ */}
              {viewPanel==='ERROR' && (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="flex flex-col items-center gap-4 p-8 max-w-lg border border-red-500/30 bg-red-500/10 rounded-lg">
                    <div className="text-red-500"><Ico.Error/></div>
                    <div className="text-center">
                      <h2 className="text-lg font-bold tracking-widest text-red-500">PIPELINE FAULT</h2>
                      <p className="text-sm mt-3 leading-relaxed text-red-300 font-medium">
                        {job.error || 'An unexpected error occurred.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ══ LIBRARY ══ */}
              {viewPanel==='LIBRARY' && (
                <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold tracking-widest text-[#00B8FF]">DUBBED VIDEO LIBRARY</h2>
                      <p className="text-xs mt-1 tracking-wider text-gray-400">
                        {library.length} archived video{library.length!==1?'s':''}
                      </p>
                    </div>
                    <button onClick={fetchLibrary}
                      className="px-4 py-2 text-xs font-bold tracking-widest uppercase transition-all rounded-md hover:bg-white/5"
                      style={{border:'1px solid #475569',color:'#94A3B8'}}>
                      {libLoading?'LOADING...':'REFRESH'}
                    </button>
                  </div>
                  {library.length===0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 opacity-40">
                      <div className="text-gray-500"><Ico.Film/></div>
                      <p className="text-sm tracking-widest font-bold text-gray-500">NO ARCHIVED VIDEOS YET</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                       {library.map(item => (
                         <div key={item.id} className="border border-gray-800 bg-[#1E293B] rounded-lg overflow-hidden">
                           <div className="flex flex-col md:flex-row md:items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/5 transition-all gap-3"
                             onClick={()=>setExpandedLib(expandedLib===item.id?null:item.id)}>
                             <div className="flex items-center gap-3">
                               <div className="w-2 h-2 rounded-full bg-[#00B8FF]"/>
                               <div>
                                 <p className="text-sm font-medium text-gray-200">
                                   {item.title.slice(0,60)}{item.title.length>60?'…':''}
                                 </p>
                                 <p className="text-xs mt-1 text-gray-500">
                                   {new Date(item.created_at).toLocaleDateString()} · {item.size_mb} MB
                                 </p>
                               </div>
                             </div>
                             <span className="text-[10px] font-bold tracking-widest text-[#00B8FF] self-end md:self-auto">
                               {expandedLib===item.id?'▲ COLLAPSE':'▼ PLAY'}
                             </span>
                           </div>
                           {expandedLib===item.id && (
                             <div className="px-5 pb-5">
                               <VideoPlayer src={`${API}${item.video_url}`} label={`DUBBED · ${item.title.slice(0,40)}`}/>
                             </div>
                           )}
                         </div>
                       ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          </section>
        </div>

        {/* ── FOOTER ── */}
        <footer className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-gray-800 bg-[#111827]">
          <div className="flex items-center gap-5 text-[10px] font-medium tracking-wider text-gray-500 hidden md:flex">
            <span>BACKEND: <span className="text-[#00B8FF]">:5001</span></span>
            <span>DB: SQLITE</span>
            <span>ENGINE: NODE + PYTHON</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-medium tracking-wider text-gray-500">
            <span>GROQ_WHISPER</span><span className="text-[#00B8FF]">|</span>
            <span>GEMINI_FLASH</span><span className="text-[#00B8FF]">|</span>
            <span>FFMPEG</span>
          </div>
        </footer>
      </main>
    </>
  );
}
