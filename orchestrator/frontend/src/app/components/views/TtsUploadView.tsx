"use client";

import type { Job, Seg, ViewPanel } from "../../lib/types";
import { mUrl, LANG_ACCENT } from "../../lib/constants";
import { Ico } from "../shared/Icons";
import { Stat } from "../shared/Stat";
import { AudioPlayer } from "../shared/AudioPlayer";
import { TranscriptPanel } from "../shared/TranscriptPanel";

interface TtsUploadViewProps {
  job: Partial<Job>;
  jobId: string | null;
  jobLangs: string[];
  langPreviews: Record<string, Seg[]>;
  activeLangTab: string;
  setActiveLangTab: (lang: string) => void;
  langTtsStatus: Record<string, 'pending' | 'uploading' | 'aligning' | 'done'>;
  savedLangs: string[];
  alignedLangs: string[];
  allReadyLangs: string[];
  isDragging: string | null;
  setIsDragging: (lang: string | null) => void;
  canUploadTTS: boolean;
  isBgmUploading: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  bgmRef: React.RefObject<HTMLInputElement | null>;
  activeLangUpload: React.MutableRefObject<string>;
  uploadTTS: (file: File, lang: string) => void;
  uploadBGM: (file: File) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleBgmChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  reject: (lang: string) => void;
  goToPanel: (panel: ViewPanel) => void;
}

export const TtsUploadView = ({
  job, jobId, jobLangs, langPreviews, activeLangTab, setActiveLangTab,
  langTtsStatus, savedLangs, alignedLangs, allReadyLangs,
  isDragging, setIsDragging, canUploadTTS, isBgmUploading,
  fileRef, bgmRef, activeLangUpload,
  uploadTTS, uploadBGM, handleFileChange, handleBgmChange,
  reject, goToPanel
}: TtsUploadViewProps) => (
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
        {jobLangs.length > 1 && (
          <div className="flex gap-2 mb-4 border-b border-gray-800 overflow-x-auto scrollbar-hide">
            {jobLangs.filter(l => langPreviews[l]).map(lang => {
              const isActive = activeLangTab === lang;
              const accent   = LANG_ACCENT[lang] || '#00B8FF';
              return (
                <button key={lang} onClick={() => setActiveLangTab(lang)}
                  className="px-5 py-3 text-xs font-bold tracking-widest uppercase transition-all whitespace-nowrap"
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
        <div className="mt-3">
          {jobLangs.filter(l => langPreviews[l]).length === 1 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TranscriptPanel segs={(job.eng_preview || []) as Seg[]} label="ENGLISH (ORIGINAL)" accent="#94A3B8" copyKey="english_orig"/>
              <TranscriptPanel segs={langPreviews[jobLangs[0]] || []} label={`${jobLangs[0].toUpperCase()} SCRIPT`} accent={LANG_ACCENT[jobLangs[0]] || '#00B8FF'} copyKey={jobLangs[0]}/>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TranscriptPanel segs={(job.eng_preview || []) as Seg[]} label="ENGLISH (ORIGINAL)" accent="#94A3B8" copyKey="english_orig"/>
              <TranscriptPanel segs={langPreviews[activeLangTab] || []} label={`${activeLangTab.toUpperCase()} SCRIPT`} accent={LANG_ACCENT[activeLangTab] || '#00B8FF'} copyKey={activeLangTab}/>
            </div>
          )}
        </div>
      </div>
    )}

    {/* Reference audio */}
    {jobId && job.base_name && (
      <AudioPlayer src={mUrl('audio', jobId)} label="REFERENCE AUDIO (ORIGINAL)"/>
    )}

    {/* Per-language upload zones */}
    <div className={`grid gap-4 ${jobLangs.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
      {jobLangs.map(lang => {
        const acc     = LANG_ACCENT[lang] || '#00B8FF';
        const status  = langTtsStatus[lang] || 'pending';
        const isSaved = savedLangs.includes(lang);
        const isDone  = alignedLangs.includes(lang);
        const isAli   = status === 'aligning';
        const isUp    = status === 'uploading';
        const isDrag  = isDragging === lang;
        return (
          <div key={lang} className="rounded-lg overflow-hidden" style={{
            border: `1px solid ${isSaved ? acc + '66' : isDone ? acc + '44' : acc + '22'}`,
            background: '#1E293B'
          }}>
            {/* Zone header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: acc + '22' }}>
              <div className="w-2 h-2 rounded-full" style={{ background: (isSaved || isDone) ? acc : 'transparent', border: `1px solid ${acc}`, boxShadow: (isSaved || isDone) ? `0 0 8px ${acc}` : 'none' }}/>
              <span className="text-[10px] font-bold tracking-widest flex-1 uppercase" style={{ color: acc }}>{lang} VOICEOVER</span>
              {isSaved && <span className="text-[10px] font-bold tracking-widest text-[#00B8FF]">⬡ SAVED</span>}
              {!isSaved && isDone && <span className="text-[10px] font-bold tracking-widest text-[#10B981]">✓ STAGED</span>}
              {isAli && <span className="text-[10px] font-bold tracking-widest animate-pulse" style={{ color: acc }}>⟳ PROCESSING</span>}
            </div>
            {/* Zone body */}
            {isSaved ? (
              <div className="p-5 flex flex-col md:flex-row items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[#10B981] shadow-[0_0_8px_#10B981]"/>
                <p className="text-xs flex-1 text-gray-400 font-medium">Saved to finals — go to REVIEW to watch</p>
                <button onClick={() => goToPanel('REVIEW')}
                  className="w-full md:w-auto px-4 py-2 mt-2 md:mt-0 text-xs font-bold tracking-wider uppercase rounded-md transition-all hover:bg-white/5"
                  style={{ border: '1px solid #10B981', color: '#10B981' }}>
                  VIEW →
                </button>
              </div>
            ) : isDone ? (
              <div className="p-5 flex flex-col items-start gap-4">
                <p className="text-xs text-gray-400 font-medium">Dubbed video ready — review it</p>
                <div className="flex gap-3 w-full">
                  <button onClick={() => goToPanel('REVIEW')}
                    className="flex-1 px-4 py-2.5 text-xs font-bold tracking-wider uppercase rounded-md transition-all"
                    style={{ background: acc, color: '#FFFFFF' }}>
                    REVIEW
                  </button>
                  <button onClick={() => reject(lang)}
                    className="flex-1 px-4 py-2.5 text-xs font-bold tracking-wider uppercase rounded-md transition-all hover:bg-red-500/10"
                    style={{ border: '1px solid #EF4444', color: '#EF4444' }}>
                    ✗ REDO
                  </button>
                </div>
              </div>
            ) : isAli ? (
              <div className="p-8 flex flex-col items-center gap-4">
                <div className="w-10 h-10 spinner-ring border-[#334155]" style={{ borderTopColor: acc }}/>
                <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: acc }}>TRANSCRIBING + ALIGNING...</p>
              </div>
            ) : (
              <div
                className={`p-8 flex flex-col items-center gap-3 cursor-pointer transition-all ${isDrag ? 'scale-[1.02]' : ''}`}
                style={{ background: isDrag ? `${acc}11` : undefined }}
                onClick={() => { if (!canUploadTTS) return; activeLangUpload.current = lang; fileRef.current?.click(); }}
                onDrop={e => { e.preventDefault(); setIsDragging(null); const f = e.dataTransfer.files?.[0]; if (f && canUploadTTS) uploadTTS(f, lang); }}
                onDragOver={e => { e.preventDefault(); setIsDragging(lang); }}
                onDragLeave={() => setIsDragging(null)}
              >
                {isUp ? (
                  <>
                    <div className="w-10 h-10 spinner-ring border-[#334155]" style={{ borderTopColor: acc }}/>
                    <p className="text-[10px] font-bold tracking-widest uppercase mt-2" style={{ color: acc }}>UPLOADING...</p>
                  </>
                ) : (
                  <>
                    <div style={{ color: acc, opacity: 0.8 }} className="animate-float"><Ico.Upload/></div>
                    <p className="text-xs font-bold tracking-widest uppercase mt-2" style={{ color: acc }}>DROP {lang} AUDIO</p>
                    <p className="text-xs text-gray-500 font-medium">mp3 / wav · click to browse</p>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>

    {/* BGM Upload */}
    <div
      className="p-6 flex flex-col items-center gap-3 border border-dashed border-gray-700 bg-[#0F172A] rounded-lg transition-all hover:border-gray-500"
      style={{ cursor: canUploadTTS ? 'pointer' : 'default' }}
      onClick={() => { if (canUploadTTS) bgmRef.current?.click(); }}
      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && canUploadTTS) uploadBGM(f); }}
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
            Want studio-quality output? Extract the background track using <a href="https://vocalremover.org/" target="_blank" rel="noreferrer" className="underline text-[#00B8FF]" onClick={e => e.stopPropagation()}>vocalremover.org</a> and upload it here before aligning.
          </p>
        </div>
      )}
    </div>

    {/* Go to review shortcut */}
    {allReadyLangs.length > 0 && (
      <button onClick={() => goToPanel('REVIEW')}
        className="w-full py-4 mt-2 text-sm font-bold tracking-widest uppercase rounded-lg transition-all hover:bg-[#00B8FF]/10"
        style={{ border: '1px solid #00B8FF', color: '#00B8FF' }}>
        → REVIEW {allReadyLangs.length} DUBBED VIDEO{allReadyLangs.length > 1 ? 'S' : ''}
      </button>
    )}
    <input ref={fileRef} type="file" className="hidden" accept=".mp3,.wav" onChange={handleFileChange}/>
    <input ref={bgmRef} type="file" className="hidden" accept=".mp3,.wav" onChange={handleBgmChange}/>
  </div>
);
