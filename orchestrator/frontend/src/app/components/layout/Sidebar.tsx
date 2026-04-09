import type { JobState, ViewPanel } from "../../lib/types";
import { STEPS, STEP_ORDER } from "../../lib/constants";
import { Ico } from "../shared/Icons";

interface SidebarProps {
  jobState: JobState;
  viewPanel: ViewPanel;
  libraryCount: number;
  goToPanel: (panel: ViewPanel) => void;
}

export const Sidebar = ({ jobState, viewPanel, libraryCount, goToPanel }: SidebarProps) => {
  const curIdx = STEP_ORDER.indexOf(jobState);

  return (
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
              className={`relative z-10 flex md:flex-row items-center gap-2 md:gap-4 px-3 md:px-0 py-2 md:py-3 min-w-max md:min-w-0 ${clickable ? 'cursor-pointer hover:bg-white/5 md:hover:bg-transparent rounded-lg md:rounded-none' : ''}`}
              onClick={() => clickable && goToPanel(step.key)}
            >
              <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full flex-shrink-0 transition-all border-2" style={{
                background: isActive ? '#00B8FF' : isCompleted ? '#10B981' : '#1E293B',
                borderColor: isActive ? 'rgba(0,184,255,0.3)' : isCompleted ? 'rgba(16,185,129,0.3)' : '#334155',
                boxShadow: isActive ? '0 0 12px rgba(0,184,255,0.5)' : isCompleted ? '0 0 8px rgba(16,185,129,0.2)' : 'none',
              }}/>
              <div className="flex flex-col">
                <span className="text-[11px] md:text-xs font-semibold tracking-wide" style={{
                  color: isActive ? '#00B8FF' : isCompleted ? '#10B981' : '#94A3B8',
                  textDecoration: isViewing && !isActive ? 'underline' : undefined,
                  textDecorationThickness: '2px',
                  textUnderlineOffset: '4px'
                }}>{step.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="md:border-t border-l md:border-l-0 border-gray-800 flex-shrink-0">
        <button className="h-full md:w-full flex md:items-center gap-3 px-4 md:px-5 py-3 md:py-4 transition-all hover:bg-white/5" onClick={() => goToPanel('LIBRARY')}>
          <div style={{ color: viewPanel === 'LIBRARY' ? '#00B8FF' : '#94A3B8' }}><Ico.Book/></div>
          <div className="text-left hidden md:block">
            <div className="text-xs font-bold tracking-wider" style={{ color: viewPanel === 'LIBRARY' ? '#00B8FF' : '#94A3B8' }}>LIBRARY</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{libraryCount} Projects</div>
          </div>
        </button>
      </div>
    </aside>
  );
};
