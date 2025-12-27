
import React from 'react';

interface HeaderControlsProps {
  isCameraOn: boolean;
  onToggleCamera: () => void;
  onClear: () => void;
}

const HeaderControls: React.FC<HeaderControlsProps> = ({ isCameraOn, onToggleCamera, onClear }) => {
  return (
    <>
      {/* --- Mobile Layout --- */}
      {/* Full screen pointer-events-none container to manage absolute positions relatively if needed, 
          but here we just use fixed positioning for mobile elements directly. */}
      
      {/* Mobile Clear Button: Bottom Right inside Toolbar */}
      <button
        onClick={onClear}
        // Centered vertically in 60px bar. Button is h-9 (36px). (60-36)/2 = 12px top/bottom.
        className="md:hidden fixed bottom-[12px] right-4 z-50 group w-9 h-9 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all text-black pointer-events-auto"
        title="Click to clear"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Mobile Camera Toggle: Top Right (Inside White Bar) */}
      <button
        onClick={onToggleCamera}
        // Top-[22px] to center in 60px bar (similar to Controls)
        className={`md:hidden fixed top-[22px] right-4 z-50 w-9 h-9 flex items-center justify-center transition-all mix-blend-difference pointer-events-auto ${
          isCameraOn ? 'text-white' : 'text-white'
        }`}
        title="Toggle Camera"
      >
        {isCameraOn ? (
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
             <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
             <circle cx="12" cy="13" r="4"></circle>
           </svg>
        ) : (
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
             <path d="M1 1l22 22"></path>
             <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"></path>
           </svg>
        )}
      </button>


      {/* --- Desktop Layout --- */}
      <div className="hidden md:flex absolute top-6 right-6 flex-row gap-4 z-50 pointer-events-auto mix-blend-difference text-white">
        {/* Clear Button */}
        <button
          onClick={onClear}
          className="group relative w-10 h-10 rounded-full border border-white/50 flex items-center justify-center hover:bg-white hover:text-black transition-all"
          title="Click to clear"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
          <span className="absolute -bottom-6 text-[8px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            CLICK CLEAR
          </span>
        </button>

        {/* Camera Toggle */}
        <button
          onClick={onToggleCamera}
          className={`w-10 h-10 rounded-full border border-white/50 flex items-center justify-center transition-all ${
            isCameraOn ? 'bg-white text-black' : 'bg-transparent text-white hover:bg-white/20'
          }`}
          title="Toggle Camera"
        >
          {isCameraOn ? (
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
               <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
               <circle cx="12" cy="13" r="4"></circle>
             </svg>
          ) : (
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
               <path d="M1 1l22 22"></path>
               <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"></path>
             </svg>
          )}
        </button>
      </div>
    </>
  );
};

export default HeaderControls;
