
import React, { useState } from 'react';

interface InputOverlayProps {
  onQueueText: (text: string) => void;
  isActive: boolean;
  isCameraOn: boolean;
}

const RANDOM_MESSAGES = [
  "HI！",
  "How are you",
  "你今天真漂亮✨",
  "Aoe studio"
];

const InputOverlay: React.FC<InputOverlayProps> = ({ onQueueText, isActive, isCameraOn }) => {
  const [value, setValue] = useState('');
  const [hasDropped, setHasDropped] = useState(false);

  const handleSend = () => {
    // If input is empty, use a random message
    const textToSend = value.trim() || RANDOM_MESSAGES[Math.floor(Math.random() * RANDOM_MESSAGES.length)];
    
    onQueueText(textToSend);
    setValue('');
    setHasDropped(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  // Determine styles based on camera state
  const textColorClass = isCameraOn ? 'text-white placeholder-white/50' : 'text-black placeholder-black/30';
  const iconClass = isCameraOn ? 'text-white' : 'text-black';

  return (
    // Flex container to hold input and return icon side-by-side
    // Mobile: top-[80px] to clear the 60px toolbar. Desktop: top-6
    <div className={`absolute top-[80px] md:top-6 left-1/2 -translate-x-1/2 z-40 transition-opacity duration-300 flex items-center gap-2 ${hasDropped ? 'opacity-30 hover:opacity-100 focus-within:opacity-100' : 'opacity-100'}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isActive ? "type here" : "loading..."}
        disabled={!isActive}
        autoComplete="off"
        className={`bg-transparent border-none text-center text-base md:text-xl outline-none w-[35vw] min-w-[180px] max-w-[280px] drop-shadow-md font-medium transition-colors duration-300 ${textColorClass}`}
        style={{ textShadow: isCameraOn ? '0 1px 2px rgba(0,0,0,0.5)' : 'none' }}
      />
      
      {/* Send / Mouse Icon */}
      <button 
        onClick={handleSend}
        // Always enabled now to support random message sending
        // Added scale-[0.8] for mobile (80% size) and md:scale-100 for desktop
        className={`transition-all duration-300 opacity-100 cursor-pointer ${iconClass} scale-[0.8] md:scale-100 origin-center`}
        aria-label="Send"
      >
        <svg 
            width="20" 
            height="20" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            style={{ filter: isCameraOn ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' : 'none' }}
        >
            <rect x="5" y="2" width="14" height="20" rx="7" />
            <line x1="12" y1="6" x2="12" y2="10" />
        </svg>
      </button>
    </div>
  );
};

export default InputOverlay;
