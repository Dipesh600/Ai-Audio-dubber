"use client";

import { useState } from "react";
import type { Seg } from "../../lib/types";
import { Ico } from "./Icons";
import { ts } from "../../lib/constants";

const SegRow = ({ s, accent }: { s: Seg; accent: string }) => (
  <div className="flex gap-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
    <span className="text-[10px] w-12 flex-shrink-0 pt-0.5 tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{ts(s.start)}</span>
    <p className="text-xs flex-1 leading-relaxed" style={{ color: 'var(--text-primary)' }}>{s.text}</p>
    {s.emotion && (
      <span className="text-[8px] px-1.5 py-0.5 h-fit flex-shrink-0 tracking-widest uppercase" style={{ border: `1px solid ${accent}44`, color: accent, fontFamily: 'var(--font-mono)' }}>
        {s.emotion}
      </span>
    )}
  </div>
);

export const TranscriptPanel = ({
  segs, label, accent, copyKey
}: { segs: Seg[]; label: string; accent: string; copyKey: string }) => {
  const [copied, setCopied] = useState(false);

  const copyForElevenLabs = () => {
    if (!segs.length) return;
    const text = segs.map(s => `[${s.emotion || 'Neutral'}] ${s.text}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ border: `1px solid ${accent}18`, background: 'var(--bg-low)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: `${accent}12` }}>
        <div className="w-1.5 h-1.5" style={{ background: accent }}/>
        <span className="text-[9px] tracking-[0.3em] uppercase flex-1" style={{ fontFamily: 'var(--font-mono)', color: accent }}>{label}</span>
        <span className="text-[8px] mr-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{segs.length} segs</span>
        <button
          onClick={copyForElevenLabs}
          disabled={!segs.length}
          title="Copy all for ElevenLabs: [Emotion] text"
          className="flex items-center gap-1.5 px-2.5 py-1 text-[8px] tracking-widest uppercase transition-all hover:opacity-100"
          style={{
            border: `1px solid ${copied ? accent : accent + '44'}`,
            color: copied ? accent : `${accent}99`,
            background: copied ? `${accent}15` : 'transparent',
            fontFamily: 'var(--font-mono)',
            opacity: segs.length ? 1 : 0.3,
          }}
        >
          <Ico.Copy/>
          {copied ? 'COPIED!' : 'COPY ALL'}
        </button>
      </div>
      {/* Segments */}
      <div className="overflow-y-auto px-4 py-2" style={{ maxHeight: '240px' }}>
        {segs.length > 0 ? (
          segs.map((s, i) => <SegRow key={i} s={s} accent={accent}/>)
        ) : (
          <p className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Loading...</p>
        )}
      </div>
      {/* Format hint */}
      {segs.length > 0 && (
        <div className="px-4 py-2 border-t text-[8px]" style={{ borderColor: `${accent}12`, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          ↑ Copies as: <span style={{ color: accent }}>[Emotion] line...</span> — paste directly into ElevenLabs
        </div>
      )}
    </div>
  );
};
