"use client";

import type { Job, JobState, ViewPanel } from "../../lib/types";
import { API, LANG_ACCENT } from "../../lib/constants";
import { Ico } from "../shared/Icons";
import { Stat } from "../shared/Stat";
import { VideoPlayer } from "../shared/VideoPlayer";

interface ReviewViewProps {
  job: Partial<Job>;
  jobId: string | null;
  jobState: JobState;
  jobLangs: string[];
  savedLangs: string[];
  alignedLangs: string[];
  allReadyLangs: string[];
  effectiveReviewLang: string;
  reviewLang: string;
  setReviewLang: (lang: string) => void;
  dubVer: number;
  approve: () => void;
  reject: (lang?: string) => void;
  goToPanel: (panel: ViewPanel) => void;
}

export const ReviewView = ({
  job, jobId, jobState, jobLangs,
  savedLangs, alignedLangs, allReadyLangs,
  effectiveReviewLang, reviewLang, setReviewLang,
  dubVer, approve, reject, goToPanel
}: ReviewViewProps) => (
  <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
    <div className="flex flex-col md:flex-row md:items-center gap-4">
      <div className="text-[#00B8FF]"><Ico.Film/></div>
      <div className="flex-1">
        <h2 className="text-lg font-bold tracking-widest text-[#00B8FF]">OUTPUT READY FOR REVIEW</h2>
        <p className="text-xs mt-1 text-gray-400 font-medium">
          {allReadyLangs.length} language{allReadyLangs.length !== 1 ? 's' : ''} ready
          {savedLangs.length > 0 ? ` · ${savedLangs.length} saved to finals` : ''}
          {' · Save each, then Finish to archive'}
        </p>
      </div>
      <div className="flex gap-2 w-full md:w-auto">
        <Stat label="SOURCE" val={job.title?.slice(0, 16) + (job.title && job.title.length > 16 ? '…' : '') || '—'}/>
      </div>
    </div>

    {/* Language tabs */}
    {allReadyLangs.length > 1 && (
      <div className="flex gap-2 border-b border-gray-800 overflow-x-auto scrollbar-hide">
        {allReadyLangs.map(lang => {
          const acc    = LANG_ACCENT[lang] || '#00B8FF';
          const active = effectiveReviewLang === lang;
          const isSav  = savedLangs.includes(lang);
          return (
            <button key={lang} onClick={() => setReviewLang(lang)}
              className="px-5 py-3 text-xs font-bold tracking-widest uppercase transition-all flex items-center gap-2 whitespace-nowrap"
              style={{ color: active ? acc : '#64748B',
                borderBottom: `2px solid ${active ? acc : 'transparent'}`, background: active ? `${acc}11` : 'transparent' }}>
              {lang}
              {isSav && <span style={{ color: '#10B981', fontSize: '8px' }}>⬡</span>}
            </button>
          );
        })}
      </div>
    )}

    {/* Video for active lang */}
    {jobId && allReadyLangs.length > 0 && (
      <VideoPlayer
        key={`${effectiveReviewLang}-${dubVer}`}
        src={`${API}/api/media?type=dubbed&id=${jobId}&lang=${effectiveReviewLang}&v=${dubVer}`}
        label={`${effectiveReviewLang.toUpperCase()} DUBBED VIDEO${savedLangs.includes(effectiveReviewLang) ? ' · SAVED' : ''}`}
      />
    )}

    {/* Pending lang notice */}
    {jobLangs.some(l => !allReadyLangs.includes(l)) && (
      <div className="flex flex-col md:flex-row md:items-center gap-3 px-4 py-3 border border-dashed border-gray-700 bg-[#1E293B] rounded-lg">
        <div className="w-2 h-2 rounded-full bg-[#F59E0B] shadow-[0_0_8px_#F59E0B] animate-pulse"/>
        <p className="text-xs font-medium text-gray-400">
          {jobLangs.filter(l => !allReadyLangs.includes(l)).map(l => l.toUpperCase()).join(', ')}{' '}still pending —{' '}
          <button onClick={() => goToPanel('AWAITING_TTS')} className="underline text-[#00B8FF] font-bold">upload TTS →</button>
        </p>
      </div>
    )}

    {/* Actions */}
    {jobState === 'REVIEW' && (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button onClick={approve}
            className="w-full py-4 text-sm font-bold tracking-widest uppercase transition-all rounded-md hover:bg-[#10B981]/10"
            style={{ color: '#10B981', border: '1px solid #10B981' }}>
            {jobLangs.every(l => [...savedLangs, ...alignedLangs].includes(l))
              ? '✓ SAVE ALL & FINISH'
              : `✓ SAVE ${alignedLangs.map(l => l.toUpperCase()).join(' + ')}`
            }
          </button>
          <button
            onClick={() => reject(effectiveReviewLang)}
            disabled={savedLangs.includes(effectiveReviewLang)}
            className="w-full py-4 text-sm font-bold tracking-widest uppercase transition-all rounded-md hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ color: '#EF4444', border: '1px solid #EF4444' }}>
            {savedLangs.includes(effectiveReviewLang)
              ? `⬡ ${effectiveReviewLang.toUpperCase()} SAVED`
              : `✗ REDO ${effectiveReviewLang.toUpperCase()}`
            }
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-500 font-medium md:mt-2">
          Save → archives staged video{alignedLangs.length > 1 ? 's' : ''} · Redo → re-upload that language&apos;s voice-over
          <br className="hidden md:block" />
          Saved langs (<span style={{ color: '#10B981' }}>⬡</span>) cannot be redone
        </p>
      </>
    )}
  </div>
);
