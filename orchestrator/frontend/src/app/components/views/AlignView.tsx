import { Ico } from "../shared/Icons";

export const AlignView = () => (
  <div className="flex-1 flex flex-col items-center justify-center gap-8 max-w-lg mx-auto w-full">
    <div className="text-[#00B8FF] animate-pulse"><Ico.Align/></div>
    <div className="text-center">
      <h2 className="text-lg font-bold tracking-widest text-[#00B8FF]">TEMPORAL ALIGNMENT</h2>
      <p className="text-xs mt-2 tracking-wider text-gray-400">Silence padding · Ducking · Muxing</p>
    </div>
    <div className="w-full h-1.5 overflow-hidden bg-gray-800 rounded-full mt-4">
      <div className="h-full bg-[#00B8FF] animate-pulse rounded-full" style={{ width: '55%', boxShadow: '0 0 12px 2px #00B8FF' }}/>
    </div>
  </div>
);
