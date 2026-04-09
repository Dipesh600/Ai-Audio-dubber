import type { ViewPanel } from "../../lib/types";
import { Ico } from "../shared/Icons";

interface ApprovedViewProps {
  goToPanel: (panel: ViewPanel) => void;
}

export const ApprovedView = ({ goToPanel }: ApprovedViewProps) => (
  <div className="flex-1 flex flex-col items-center justify-center gap-5">
    <div className="text-[#10B981]"><Ico.Check/></div>
    <div className="text-center">
      <h2 className="text-xl font-bold tracking-widest text-[#10B981]">ARCHIVED</h2>
      <p className="text-sm mt-3 text-gray-300 font-medium">Dubbed video saved to <span className="text-[#00B8FF]">output/finals/</span></p>
      <p className="text-xs mt-1 text-gray-500">All intermediate files deleted · Storage freed</p>
      <p className="text-xs mt-4 text-gray-400">
        View in <button onClick={() => goToPanel('LIBRARY')} className="underline text-[#00B8FF] font-bold">LIBRARY →</button>
      </p>
    </div>
  </div>
);
