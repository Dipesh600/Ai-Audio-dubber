export const Footer = () => (
  <footer className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-gray-800 bg-[#111827]">
    <div className="flex items-center gap-5 text-[10px] font-medium tracking-wider text-gray-500 hidden md:flex">
      <span>BACKEND: <span className="text-[#00B8FF]">:5001</span></span>
      <span>DB: SQLITE</span>
      <span>ENGINE: NODE + PYTHON</span>
    </div>
    <div className="flex items-center gap-3 text-[10px] font-medium tracking-wider text-gray-500">
      <span>GROQ_WHISPER</span><span className="text-[#00B8FF]">|</span>
      <span>GEMINI_FLASH</span><span className="text-[#00B8FF]">|</span>
      <span>FFMPEG</span>
    </div>
  </footer>
);
