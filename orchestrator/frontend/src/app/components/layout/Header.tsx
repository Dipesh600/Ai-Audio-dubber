import type { JobState } from "../../lib/types";
import { fmt } from "../../lib/constants";

interface HeaderProps {
  jobState: JobState;
  startTime: number | null;
  elapsed: number;
}

export const Header = ({ jobState, startTime, elapsed }: HeaderProps) => (
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
      {startTime && !['IDLE', 'APPROVED'].includes(jobState) && (
        <div className="hidden md:block px-3 py-1.5 text-xs font-mono text-[#00B8FF] bg-[#1E293B] border border-gray-700 rounded-md">
          T+ {fmt(elapsed)}
        </div>
      )}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1E293B] border border-gray-700 rounded-md">
        <div className={`w-2 h-2 rounded-full ${jobState === 'ERROR' ? 'bg-red-500' : jobState === 'IDLE' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400 animate-pulse'}`}/>
        <span className="text-[10px] md:text-xs font-medium tracking-wider text-gray-300">
          {jobState === 'IDLE' ? 'STANDBY' : jobState === 'ERROR' ? 'FAULT' : jobState === 'APPROVED' ? 'ARCHIVED' : 'ACTIVE'}
        </span>
      </div>
    </div>
  </header>
);
