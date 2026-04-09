export const VideoPlayer = ({ src, label = 'PLAYBACK' }: { src: string; label?: string }) => (
  <div className="w-full" style={{ border: '1px solid var(--border-mid)', background: '#000', boxShadow: '0 0 30px rgba(0,255,204,0.07)', position: 'relative' }}>
    <div className="flex items-center gap-2 px-3 py-1.5 border-b" style={{ borderColor: 'var(--border-dim)', background: 'var(--bg-low)' }}>
      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-slow-pulse"/>
      <span className="text-[9px] tracking-[0.3em]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{label}</span>
    </div>
    <video src={src} controls style={{ width: '100%', display: 'block', maxHeight: '340px', background: '#000' }}/>
  </div>
);
