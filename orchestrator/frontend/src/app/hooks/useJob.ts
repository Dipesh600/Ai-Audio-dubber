"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { Job, JobState, ViewPanel, Seg } from "../lib/types";
import { API } from "../lib/constants";

interface UseJobReturn {
  // State
  url: string;
  setUrl: (url: string) => void;
  jobId: string | null;
  job: Partial<Job>;
  jobState: JobState;
  viewPanel: ViewPanel;
  selectedLangs: string[];
  activeLangTab: string;
  setActiveLangTab: (lang: string) => void;
  isDragging: string | null;
  setIsDragging: (lang: string | null) => void;
  elapsed: number;
  startTime: number | null;
  langTtsStatus: Record<string, 'pending' | 'uploading' | 'aligning' | 'done'>;
  dubVer: number;
  reviewLang: string;
  setReviewLang: (lang: string) => void;
  isBgmUploading: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  bgmRef: React.RefObject<HTMLInputElement | null>;
  videoRef: React.RefObject<HTMLInputElement | null>;
  activeLangUpload: React.MutableRefObject<string>;

  // Derived
  langPreviews: Record<string, Seg[]>;
  jobLangs: string[];
  outputPaths: Record<string, string>;
  finalPaths: Record<string, string>;
  savedLangs: string[];
  alignedLangs: string[];
  allReadyLangs: string[];
  effectiveReviewLang: string;
  canUploadTTS: boolean;

  // Actions
  initiate: () => Promise<void>;
  uploadVideo: (file: File) => Promise<void>;
  uploadTTS: (file: File, lang?: string) => Promise<void>;
  uploadBGM: (file: File) => Promise<void>;
  approve: () => Promise<void>;
  reject: (lang?: string) => Promise<void>;
  reset: () => void;
  toggleLang: (key: string) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleBgmChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleVideoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  goToPanel: (panel: ViewPanel) => void;
}

export function useJob(): UseJobReturn {
  const [url, setUrl]             = useState('');
  const [jobId, setJobId]         = useState<string | null>(null);
  const [job, setJob]             = useState<Partial<Job>>({});
  const [jobState, setJobState]   = useState<JobState>('IDLE');
  const [viewPanel, setViewPanel] = useState<ViewPanel>('IDLE');
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['nepali']);
  const [activeLangTab, setActiveLangTab] = useState<string>('nepali');
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [elapsed, setElapsed]     = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [langTtsStatus, setLangTtsStatus] = useState<Record<string, 'pending' | 'uploading' | 'aligning' | 'done'>>({});
  const [dubVer, setDubVer]       = useState(0);
  const [reviewLang, setReviewLang] = useState<string>('');
  const [isBgmUploading, setIsBgmUploading] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const bgmRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLInputElement | null>(null);
  const activeLangUpload = useRef<string>('nepali');
  const isManualView = useRef(false);

  // Auto-sync viewPanel
  useEffect(() => {
    if (!isManualView.current) setViewPanel(jobState);
  }, [jobState]);

  const goToPanel = useCallback((panel: ViewPanel) => {
    isManualView.current = panel !== jobState;
    setViewPanel(panel);
  }, [jobState]);

  // When job lands on AWAITING_TTS, set active lang tab to first selected
  useEffect(() => {
    if (jobState === 'AWAITING_TTS') {
      const preview = (job.lang_previews || {});
      const available = selectedLangs.filter(l => preview[l]?.length > 0);
      if (available.length) setActiveLangTab(available[0]);
    }
  }, [jobState, job.lang_previews, selectedLangs]);

  // ── WebSocket for real-time updates ──
  const socketRef = useRef<Socket | null>(null);
  const wsConnected = useRef(false);

  useEffect(() => {
    if (!jobId) return;
    const socket = io(API, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      wsConnected.current = true;
      socket.emit('subscribe', jobId);
    });

    socket.on('disconnect', () => {
      wsConnected.current = false;
    });

    socket.on('job:status', (data: any) => {
      if (data.jobId !== jobId) return;
      const newStatus = data.status as JobState;
      if (!newStatus) return;

      // Handle ALIGNING → REVIEW transition
      if (newStatus === 'REVIEW' && data.output_paths) {
        setDubVer(v => v + 1);
        setLangTtsStatus(prev => {
          const upd = { ...prev };
          Object.keys(upd).forEach(l => { if (upd[l] === 'aligning') upd[l] = 'done'; });
          return upd;
        });
      }

      setJob(prev => ({ ...prev, ...data }));
      setJobState(newStatus);
      isManualView.current = false;
    });

    return () => {
      socket.emit('unsubscribe', jobId);
      socket.disconnect();
      socketRef.current = null;
      wsConnected.current = false;
    };
  }, [jobId]);

  // Fallback polling — only when WebSocket is NOT connected
  useEffect(() => {
    if (!jobId) return;
    if (['IDLE', 'APPROVED', 'ERROR'].includes(jobState)) return;
    // Slower polling as fallback (WS handles instant updates)
    const interval = wsConnected.current ? 5000 : (jobState === 'DOWNLOADING' ? 500 : jobState === 'TRANSCRIBING' ? 1000 : 2000);
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
            const jLangs = d.languages ? d.languages.split(',').map((l: string) => l.trim()) : [];
            const pendingLangs = jLangs.filter((l: string) => !allDoneLangs.includes(l));

            if (pendingLangs.length > 0) {
              setJob(d);
              setJobState(newStatus);
              isManualView.current = true;
              setViewPanel('AWAITING_TTS');
            } else {
              const first = Object.keys(stagingPaths)[0] || Object.keys(finPaths)[0];
              if (first) setReviewLang(first);
              setJobState(newStatus); setJob(d); isManualView.current = false;
            }
            return;
          }
          setJobState(newStatus); setJob(d); isManualView.current = false;
        } else {
          setJob(prev => ({ ...prev, ...d }));
        }
      } catch { /* ignore polling errors */ }
    }, interval);
    return () => clearInterval(iv);
  }, [jobId, jobState]);

  // Timer
  useEffect(() => {
    if (!startTime || ['IDLE', 'APPROVED', 'ERROR', 'AWAITING_TTS', 'REVIEW'].includes(jobState)) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startTime, jobState]);

  // ── Derived data ──
  const langPreviews = (job.lang_previews || {}) as Record<string, Seg[]>;
  const jobLangs     = job.languages ? job.languages.split(',').map(l => l.trim()).filter(Boolean) : selectedLangs;
  const outputPaths  = (job.output_paths || {}) as Record<string, string>;
  const finalPaths   = (job.final_paths  || {}) as Record<string, string>;
  const savedLangs   = Object.keys(finalPaths);
  const alignedLangs = Object.keys(outputPaths);
  const allReadyLangs = [...new Set([...savedLangs, ...alignedLangs])];
  const effectiveReviewLang = (
    (reviewLang && allReadyLangs.includes(reviewLang)) ? reviewLang :
    alignedLangs[0] || savedLangs[0] || jobLangs[0] || 'nepali'
  );
  const canUploadTTS = !!jobId && !['IDLE', 'PENDING', 'DOWNLOADING', 'TRANSCRIBING', 'APPROVED'].includes(jobState);

  // ── Actions ──
  const initiate = useCallback(async () => {
    if (!url.trim()) return;
    setJobState('PENDING'); setStartTime(Date.now()); setElapsed(0); setJob({});
    isManualView.current = false;
    try {
      const r = await fetch(`${API}/api/start-job`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, languages: selectedLangs })
      });
      const d = await r.json();
      setJobId(d.id); setJobState(d.status);
    } catch { setJobState('ERROR'); setJob({ error: 'Cannot reach backend.' }); }
  }, [url, selectedLangs]);

  const uploadVideo = useCallback(async (file: File) => {
    setJobState('PENDING'); setStartTime(Date.now()); setElapsed(0); setJob({});
    isManualView.current = false;
    const form = new FormData();
    form.append('video', file);
    form.append('languages', JSON.stringify(selectedLangs));
    try {
      const r = await fetch(`${API}/api/upload-video`, { method: 'POST', body: form });
      const d = await r.json();
      if (d.error) { setJobState('ERROR'); setJob({ error: d.error }); return; }
      setJobId(d.id); setJobState(d.status);
    } catch { setJobState('ERROR'); setJob({ error: 'Cannot reach backend.' }); }
  }, [selectedLangs]);

  const uploadTTS = useCallback(async (file: File, lang: string = 'nepali') => {
    if (!jobId) return;
    setLangTtsStatus(prev => ({ ...prev, [lang]: 'uploading' }));
    const form = new FormData();
    form.append('audio', file);
    form.append('lang', lang);
    try {
      await fetch(`${API}/api/upload-tts/${jobId}`, { method: 'POST', body: form });
      setLangTtsStatus(prev => ({ ...prev, [lang]: 'aligning' }));
      setJobState('ALIGNING'); isManualView.current = false;
    } catch {
      setLangTtsStatus(prev => ({ ...prev, [lang]: 'pending' }));
      setJobState('ERROR'); setJob({ error: 'Upload failed.' });
    }
  }, [jobId]);

  const uploadBGM = useCallback(async (file: File) => {
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
  }, [jobId]);

  const approve = useCallback(async () => {
    if (!jobId) return;
    await fetch(`${API}/api/approve/${jobId}`, { method: 'POST' });
    setJobState('APPROVED'); isManualView.current = false;
  }, [jobId]);

  const reject = useCallback(async (lang?: string) => {
    if (!jobId) return;
    const target = lang || reviewLang || jobLangs[0] || 'nepali';
    const r = await fetch(`${API}/api/reject/${jobId}?lang=${target}`, { method: 'POST' });
    const d: Job = await r.json();
    setLangTtsStatus(prev => ({ ...prev, [target]: 'pending' }));
    setDubVer(v => v + 1);
    setJob(d); setJobState(d.status as JobState); isManualView.current = false;
    const newOutputPaths = d.output_paths || {};
    const newFinalPaths  = d.final_paths  || {};
    const newAllReadyLangs = [...new Set([...Object.keys(newOutputPaths), ...Object.keys(newFinalPaths)])];
    if (!newAllReadyLangs.includes(reviewLang)) setReviewLang('');
  }, [jobId, reviewLang, jobLangs]);

  const reset = useCallback(() => {
    setJobState('IDLE'); setJobId(null); setUrl(''); setJob({});
    setStartTime(null); setElapsed(0); setSelectedLangs(['nepali']);
    isManualView.current = false;
  }, []);

  const toggleLang = useCallback((key: string) => {
    setSelectedLangs(prev =>
      prev.includes(key)
        ? (prev.length > 1 ? prev.filter(l => l !== key) : prev)
        : [...prev, key]
    );
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadTTS(f, activeLangUpload.current);
    e.target.value = '';
  }, [uploadTTS]);

  const handleBgmChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadBGM(f);
    e.target.value = '';
  }, [uploadBGM]);

  const handleVideoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadVideo(f);
    e.target.value = '';
  }, [uploadVideo]);

  return {
    url, setUrl, jobId, job, jobState, viewPanel, selectedLangs,
    activeLangTab, setActiveLangTab, isDragging, setIsDragging,
    elapsed, startTime, langTtsStatus, dubVer, reviewLang, setReviewLang,
    isBgmUploading, fileRef, bgmRef, videoRef, activeLangUpload,
    langPreviews, jobLangs, outputPaths, finalPaths,
    savedLangs, alignedLangs, allReadyLangs, effectiveReviewLang, canUploadTTS,
    initiate, uploadVideo, uploadTTS, uploadBGM, approve, reject, reset,
    toggleLang, handleFileChange, handleBgmChange, handleVideoChange, goToPanel,
  };
}
