"use client";

import type { LibItem } from "../../lib/types";
import { API } from "../../lib/constants";
import { Ico } from "../shared/Icons";
import { VideoPlayer } from "../shared/VideoPlayer";

interface LibraryViewProps {
  library: LibItem[];
  libLoading: boolean;
  expandedLib: string | null;
  setExpandedLib: (id: string | null) => void;
  fetchLibrary: () => void;
}

export const LibraryView = ({ library, libLoading, expandedLib, setExpandedLib, fetchLibrary }: LibraryViewProps) => (
  <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-bold tracking-widest text-[#00B8FF]">DUBBED VIDEO LIBRARY</h2>
        <p className="text-xs mt-1 tracking-wider text-gray-400">
          {library.length} archived video{library.length !== 1 ? 's' : ''}
        </p>
      </div>
      <button onClick={fetchLibrary}
        className="px-4 py-2 text-xs font-bold tracking-widest uppercase transition-all rounded-md hover:bg-white/5"
        style={{ border: '1px solid #475569', color: '#94A3B8' }}>
        {libLoading ? 'LOADING...' : 'REFRESH'}
      </button>
    </div>
    {library.length === 0 ? (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 opacity-40">
        <div className="text-gray-500"><Ico.Film/></div>
        <p className="text-sm tracking-widest font-bold text-gray-500">NO ARCHIVED VIDEOS YET</p>
      </div>
    ) : (
      <div className="flex flex-col gap-4">
        {library.map(item => (
          <div key={item.id} className="border border-gray-800 bg-[#1E293B] rounded-lg overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/5 transition-all gap-3"
              onClick={() => setExpandedLib(expandedLib === item.id ? null : item.id)}>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[#00B8FF]"/>
                <div>
                  <p className="text-sm font-medium text-gray-200">
                    {item.title.slice(0, 60)}{item.title.length > 60 ? '…' : ''}
                  </p>
                  <p className="text-xs mt-1 text-gray-500">
                    {new Date(item.created_at).toLocaleDateString()} · {item.size_mb} MB
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-bold tracking-widest text-[#00B8FF] self-end md:self-auto">
                {expandedLib === item.id ? '▲ COLLAPSE' : '▼ PLAY'}
              </span>
            </div>
            {expandedLib === item.id && (
              <div className="px-5 pb-5">
                <VideoPlayer src={`${API}${item.video_url}`} label={`DUBBED · ${item.title.slice(0, 40)}`}/>
              </div>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);
