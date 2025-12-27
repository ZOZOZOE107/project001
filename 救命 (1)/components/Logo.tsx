
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
        className="w-12 h-12 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity active:scale-95 bg-transparent border-none outline-none p-0 focus:outline-none mix-blend-difference md:mix-blend-normal"
        aria-label="Rewind"
      >
        <img 
          src="logo A.png" 
          alt="logo A.png" 
          className="w-full h-full object-contain block"
          style={{ 
            // Ensures visibility against dark backgrounds if the logo is dark
            // For mobile white bar, mix-blend-difference on parent handles inversion if needed, or simple display.
            filter: isCameraOn ? 'drop-shadow(0 0 1px rgba(255,255,255,0.5))' : 'none'
          }}
          onError={(e) => {
            console.error('Failed to load logo A.png. Please ensure the file exists in the root directory.');
          }}
        />
      </button>
    </div>
  );
};

export default Logo;
