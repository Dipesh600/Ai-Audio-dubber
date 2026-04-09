import type { Job, JobState } from "../../lib/types";
import { mUrl } from "../../lib/constants";
import { Ico } from "../shared/Icons";
import { Stat } from "../shared/Stat";
import { VideoPlayer } from "../shared/VideoPlayer";

interface DownloadViewProps {
  job: Partial<Job>;
  jobId: string | null;
  url: string;
}

export const DownloadView = ({ job, jobId, url }: DownloadViewProps) => (
  <div className="flex flex-col items-center gap-6 max-w-2xl mx-auto w-full">
    {job.base_name && jobId ? (
      <>
        <div className="w-full">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 bg-[#00B8FF]"/>
            <span className="text-[10px] font-bold tracking-widest text-[#00B8FF]">ORIGINAL VIDEO</span>
          </div>
          <VideoPlayer src={mUrl('video', jobId)} label="ORIGINAL VIDEO STREAM"/>
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
          <div className="w-20 h-20 spinner-ring" style={{ borderTopColor: '#00B8FF' }}/>
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
);
