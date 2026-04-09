import type { Job, JobState, Seg } from "../../lib/types";
import { mUrl, LANG_ACCENT } from "../../lib/constants";
import { Ico } from "../shared/Icons";
import { Stat } from "../shared/Stat";
import { AudioPlayer } from "../shared/AudioPlayer";
import { TranscriptPanel } from "../shared/TranscriptPanel";

interface TranscribeViewProps {
  job: Partial<Job>;
  jobId: string | null;
  jobState: JobState;
  jobLangs: string[];
  langPreviews: Record<string, Seg[]>;
}

export const TranscribeView = ({ job, jobId, jobState, jobLangs, langPreviews }: TranscribeViewProps) => (
  <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
    <div className="flex flex-col md:flex-row md:items-center gap-4">
      <div className={`text-[#00B8FF] ${jobState === 'TRANSCRIBING' ? 'animate-pulse' : ''}`}><Ico.Wave/></div>
      <div>
        <h2 className="text-lg font-bold tracking-widest text-[#00B8FF]">
          {jobState === 'TRANSCRIBING' ? 'NEURAL TRANSCRIPTION' : 'TRANSCRIPTION COMPLETE'}
        </h2>
        <p className="text-[10px] md:text-xs mt-1 tracking-wider text-gray-400">
          Whisper → Gemini 2.5 Flash · {jobLangs.map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(' + ')}
        </p>
      </div>
      {job.video_size_mb ? (
        <div className="md:ml-auto flex gap-3"><Stat label="VIDEO" val={`${job.video_size_mb} MB`}/><Stat label="AUDIO" val={`${job.audio_size_mb} MB`}/></div>
      ) : null}
    </div>
    {jobId && job.base_name && <AudioPlayer src={mUrl('audio', jobId)} label="ORIGINAL AUDIO STREAM"/>}
    {jobState !== 'TRANSCRIBING' && Object.keys(langPreviews).length > 0 ? (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(langPreviews).map(([lang, segs]) => (
          <TranscriptPanel key={lang} segs={segs} label={`${lang.toUpperCase()} SCRIPT`} accent={LANG_ACCENT[lang] || '#00B8FF'} copyKey={lang}/>
        ))}
      </div>
    ) : (
      <div className="flex flex-col gap-4 items-center mt-8">
        <div className="flex items-end gap-1 h-12 w-full max-w-md mx-auto">
          {Array.from({ length: 32 }).map((_, i) => (
            <div key={i} className="flex-1 animate-pulse bg-[#00B8FF] rounded-t-sm" style={{ height: `${20 + Math.sin(i * 0.65) * 40 + Math.random() * 40}%`, opacity: 0.3 + Math.random() * 0.4, animationDelay: `${i * 0.07}s` }}/>
          ))}
        </div>
        <p className="text-xs font-medium tracking-widest mt-4 text-gray-400 animate-pulse">
          Translating to {jobLangs.map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(', ')}...
        </p>
      </div>
    )}
  </div>
);
