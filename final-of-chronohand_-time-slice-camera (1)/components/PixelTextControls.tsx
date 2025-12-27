import React from 'react';

interface PixelTextControlsProps {
  text: string;
  onTextChange: (text: string) => void;
  scale: number;
  onScaleChange: (scale: number) => void;
}

const PixelTextControls: React.FC<PixelTextControlsProps> = ({ text, onTextChange, scale, onScaleChange }) => {
  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Text Input */}
      <div className="relative group">
        <input
          type="text"
          value={text}
          onChange={(e) => onTextChange(e.target.value.toUpperCase())}
          className="bg-transparent border-b border-white/30 text-white font-sans font-light text-xl text-center outline-none focus:border-white transition-colors w-64 uppercase tracking-widest py-1"
          placeholder="ENTER TEXT"
        />
        <div className="absolute -bottom-4 left-0 w-full text-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <span className="text-[9px] text-white/50 uppercase tracking-widest">Type to change</span>
        </div>
      </div>
      
      {/* Size Slider */}
      <div className="flex items-center gap-4 mt-2">
         <span className="text-[10px] text-white/70 font-sans font-medium tracking-widest">SIZE</span>
         <div className="relative w-32 h-6 flex items-center">
            <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.1"
                value={scale}
                onChange={(e) => onScaleChange(parseFloat(e.target.value))}
                className="
                    w-full h-[1px] bg-white/30 rounded-none appearance-none cursor-pointer outline-none
                    
                    [&::-webkit-slider-thumb]:appearance-none 
                    [&::-webkit-slider-thumb]:w-2.5 
                    [&::-webkit-slider-thumb]:h-2.5 
                    [&::-webkit-slider-thumb]:bg-white 
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:border-none
                    [&::-webkit-slider-thumb]:transition-transform
                    
                    hover:[&::-webkit-slider-thumb]:scale-125
                "
            />
         </div>
         <span className="text-[10px] text-white/70 font-sans font-medium tabular-nums w-6">{scale.toFixed(1)}</span>
      </div>
    </div>
  );
};

export default PixelTextControls;