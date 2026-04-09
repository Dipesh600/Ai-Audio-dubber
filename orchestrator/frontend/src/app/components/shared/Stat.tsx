export const Stat = ({ label, val }: { label: string; val: string }) => (
  <div className="px-4 py-3" style={{ background: 'var(--bg-mid)', border: '1px solid var(--border-dim)' }}>
    <div className="text-[9px] tracking-[0.2em] mb-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{label}</div>
    <div className="text-sm font-semibold" style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>{val}</div>
  </div>
);
