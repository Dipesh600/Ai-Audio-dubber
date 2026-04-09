export const AudioPlayer = ({ src, label = 'AUDIO STREAM' }: { src: string; label?: string }) => (
  <div className="w-full p-4" style={{ border: '1px solid var(--border-dim)', background: 'var(--bg-low)' }}>
    <div className="text-[9px] tracking-[0.3em] mb-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{label}</div>
    <audio src={src} controls style={{ width: '100%', height: '36px' }}/>
  </div>
);
