import { Ico } from "../shared/Icons";

export const IdleView = () => (
  <div className="flex-1 flex flex-col items-center justify-center gap-5 opacity-50 text-[#00B8FF]">
    <div className="animate-float"><Ico.Target/></div>
    <div className="text-center">
      <p className="text-xl font-bold tracking-widest">STANDBY</p>
      <p className="text-xs mt-2 tracking-[0.2em] text-gray-500">PASTE URL · SELECT LANGUAGE · INITIATE</p>
    </div>
  </div>
);
