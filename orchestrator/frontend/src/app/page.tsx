"use client";

import { LANG_OPTIONS } from "./lib/constants";
import { useJob } from "./hooks/useJob";
import { useLibrary } from "./hooks/useLibrary";

// Layout
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { Footer } from "./components/layout/Footer";

// Shared
import { LangToggle } from "./components/shared/LangToggle";

// Views
import { IdleView } from "./components/views/IdleView";
import { DownloadView } from "./components/views/DownloadView";
import { TranscribeView } from "./components/views/TranscribeView";
import { TtsUploadView } from "./components/views/TtsUploadView";
import { AlignView } from "./components/views/AlignView";
import { ReviewView } from "./components/views/ReviewView";
import { ApprovedView } from "./components/views/ApprovedView";
import { ErrorView } from "./components/views/ErrorView";
import { LibraryView } from "./components/views/LibraryView";

export default function Home() {
  const jobHook = useJob();
  const libHook = useLibrary();

  const {
    url, setUrl, jobId, job, jobState, viewPanel, selectedLangs,
    activeLangTab, setActiveLangTab, isDragging, setIsDragging,
    elapsed, startTime, langTtsStatus, dubVer, reviewLang, setReviewLang,
    isBgmUploading, fileRef, bgmRef, videoRef, activeLangUpload,
    langPreviews, jobLangs, outputPaths, finalPaths,
    savedLangs, alignedLangs, allReadyLangs, effectiveReviewLang, canUploadTTS,
    initiate, uploadVideo, uploadTTS, uploadBGM, approve, reject, reset,
    toggleLang, handleFileChange, handleBgmChange, handleVideoChange, goToPanel,
  } = jobHook;

  const { library, libLoading, expandedLib, setExpandedLib, fetchLibrary } = libHook;

  // Trigger library refresh on approval
  const handleApprove = async () => {
    await approve();
    fetchLibrary();
  };

  return (
    <main className="relative z-10 h-screen flex flex-col overflow-hidden bg-[#111827]">

      {/* ── HEADER ── */}
      <Header jobState={jobState} startTime={startTime} elapsed={elapsed}/>

      {/* ── URL + LANGUAGE BAR ── */}
      <div className="flex-shrink-0 border-b border-gray-800 bg-[#0F172A]">
        {/* URL row */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 px-4 md:px-7 py-3 md:py-4 border-b border-gray-800">
          <span className="text-[10px] md:text-xs font-semibold tracking-widest text-gray-500 flex-shrink-0">SOURCE</span>
          <div className="flex flex-1 gap-2">
            <input type="text" placeholder="Paste video URL (YouTube, Instagram, TikTok, Twitter...)" value={url}
              onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && initiate()}
              className="input-terminal flex-1 px-4 py-2.5 text-sm w-full"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={initiate} disabled={!['IDLE', 'ERROR', 'APPROVED'].includes(jobState)}
              className="btn-primary flex-1 md:flex-none px-6 py-2.5 text-sm min-w-[120px]">
              INITIATE
            </button>
            <button
              onClick={() => videoRef.current?.click()}
              disabled={!['IDLE', 'ERROR', 'APPROVED'].includes(jobState)}
              className="px-6 py-2.5 text-sm font-semibold text-[#00B8FF] border border-[#00B8FF]/40 rounded-lg transition-all hover:bg-[#00B8FF]/10 disabled:opacity-50 flex-shrink-0"
            >
              ↑ UPLOAD VIDEO
            </button>
            <input type="file" ref={videoRef} accept="video/*" className="hidden" onChange={handleVideoChange}/>
            {['ERROR', 'APPROVED'].includes(jobState) && (
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
                onToggle={() => !['DOWNLOADING', 'TRANSCRIBING', 'ALIGNING'].includes(jobState) && toggleLang(lang.key)}
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

        {/* Sidebar */}
        <Sidebar jobState={jobState} viewPanel={viewPanel} libraryCount={library.length} goToPanel={goToPanel}/>

        {/* Center Panel */}
        <section className="flex-1 overflow-y-auto relative bg-[#111827]">
          <div className="flex flex-col min-h-full px-10 py-8">

            {viewPanel === 'IDLE' && <IdleView/>}

            {viewPanel === 'DOWNLOADING' && (
              <DownloadView job={job} jobId={jobId} url={url}/>
            )}

            {viewPanel === 'TRANSCRIBING' && (
              <TranscribeView job={job} jobId={jobId} jobState={jobState} jobLangs={jobLangs} langPreviews={langPreviews}/>
            )}

            {viewPanel === 'AWAITING_TTS' && (
              <TtsUploadView
                job={job} jobId={jobId} jobLangs={jobLangs} langPreviews={langPreviews}
                activeLangTab={activeLangTab} setActiveLangTab={setActiveLangTab}
                langTtsStatus={langTtsStatus} savedLangs={savedLangs}
                alignedLangs={alignedLangs} allReadyLangs={allReadyLangs}
                isDragging={isDragging} setIsDragging={setIsDragging}
                canUploadTTS={canUploadTTS} isBgmUploading={isBgmUploading}
                fileRef={fileRef} bgmRef={bgmRef} activeLangUpload={activeLangUpload}
                uploadTTS={uploadTTS} uploadBGM={uploadBGM}
                handleFileChange={handleFileChange} handleBgmChange={handleBgmChange}
                reject={reject} goToPanel={goToPanel}
              />
            )}

            {viewPanel === 'ALIGNING' && <AlignView/>}

            {viewPanel === 'REVIEW' && (
              <ReviewView
                job={job} jobId={jobId} jobState={jobState} jobLangs={jobLangs}
                savedLangs={savedLangs} alignedLangs={alignedLangs} allReadyLangs={allReadyLangs}
                effectiveReviewLang={effectiveReviewLang} reviewLang={reviewLang}
                setReviewLang={setReviewLang} dubVer={dubVer}
                approve={handleApprove} reject={reject} goToPanel={goToPanel}
              />
            )}

            {viewPanel === 'APPROVED' && <ApprovedView goToPanel={goToPanel}/>}

            {viewPanel === 'ERROR' && <ErrorView error={job.error || ''}/>}

            {viewPanel === 'LIBRARY' && (
              <LibraryView
                library={library} libLoading={libLoading}
                expandedLib={expandedLib} setExpandedLib={setExpandedLib}
                fetchLibrary={fetchLibrary}
              />
            )}

          </div>
        </section>
      </div>

      {/* ── FOOTER ── */}
      <Footer/>

    </main>
  );
}
