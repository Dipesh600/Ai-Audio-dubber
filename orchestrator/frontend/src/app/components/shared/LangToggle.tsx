import { LANG_ACCENT } from "../../lib/constants";
import type { LANG_OPTIONS } from "../../lib/constants";

type LangOption = (typeof LANG_OPTIONS)[number];

export const LangToggle = ({ lang, selected, onToggle }: { lang: LangOption; selected: boolean; onToggle: () => void }) => {
  const accent = LANG_ACCENT[lang.key];
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 px-4 py-2 text-[10px] tracking-[0.15em] uppercase transition-all"
      style={{
        border: `1px solid ${selected ? accent : accent + '33'}`,
        background: selected ? `${accent}12` : 'transparent',
        color: selected ? accent : `${accent}77`,
        fontFamily: 'var(--font-display)',
        boxShadow: selected ? `0 0 12px ${accent}22` : 'none',
      }}
    >
      <div className="w-2 h-2 transition-all" style={{
        background: selected ? accent : 'transparent',
        border: `1px solid ${selected ? accent : accent + '55'}`,
        boxShadow: selected ? `0 0 6px ${accent}` : 'none',
      }}/>
      {lang.label}
      <span className="text-[8px] opacity-60">{lang.flag}</span>
    </button>
  );
};
