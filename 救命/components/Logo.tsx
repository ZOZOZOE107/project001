
import React from 'react';

interface LogoProps {
  isCameraOn: boolean;
  onRewind?: () => void;
}

const Logo: React.FC<LogoProps> = ({ isCameraOn, onRewind }) => {
  return (
    <div className="fixed md:absolute z-[100] pointer-events-auto 
        md:bottom-6 md:left-6 
        bottom-0 left-4 h-[60px] flex items-center">
      <button 
        onClick={onRewind}
        className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity active:scale-95 bg-transparent border-none outline-none p-0 focus:outline-none text-black"
        aria-label="Rewind"
      >
        <span className="font-bold text-3xl md:text-4xl leading-none select-none">O</span>
      </button>
    </div>
  );
};

export default Logo;
