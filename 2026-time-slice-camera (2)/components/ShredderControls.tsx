import React from 'react';

interface ShredderControlsProps {
  count: number;
  onChange: (val: number) => void;
}

const ShredderControls: React.FC<ShredderControlsProps> = ({ count, onChange }) => {
  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Container - Transparent, no borders/shadows */}
      <div className="flex items-center gap-5 px-6 py-3">
        
        {/* Label - White text, lighter weight */}
        <span className="text-[10px] font-medium text-white uppercase tracking-widest select-none drop-shadow-md opacity-90">
          Density
        </span>

        {/* Slider - White styling */}
        <div className="relative w-32 h-6 flex items-center">
            <input
            type="range"
            min="0"
            max="50"
            step="1"
            value={count}
            onChange={(e) => onChange(parseInt(e.target.value))}
            className="
                w-full h-[1px] bg-white/40 rounded-none appearance-none cursor-pointer outline-none
                
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

        {/* Value Display - White text, lighter weight */}
        <span className="text-xs font-normal text-white w-6 text-right select-none tabular-nums drop-shadow-md">
          {count < 10 ? `0${count}` : count}
        </span>
      </div>
    </div>
  );
};

export default ShredderControls;