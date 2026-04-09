import { Ico } from "../shared/Icons";

interface ErrorViewProps {
  error: string;
}

export const ErrorView = ({ error }: ErrorViewProps) => (
  <div className="flex-1 flex flex-col items-center justify-center">
    <div className="flex flex-col items-center gap-4 p-8 max-w-lg border border-red-500/30 bg-red-500/10 rounded-lg">
      <div className="text-red-500"><Ico.Error/></div>
      <div className="text-center">
        <h2 className="text-lg font-bold tracking-widest text-red-500">PIPELINE FAULT</h2>
        <p className="text-sm mt-3 leading-relaxed text-red-300 font-medium">
          {error || 'An unexpected error occurred.'}
        </p>
      </div>
    </div>
  </div>
);
