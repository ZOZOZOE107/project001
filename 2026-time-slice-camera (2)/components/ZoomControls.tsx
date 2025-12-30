import React from 'react';

interface ZoomControlsProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  min?: number;
  max?: number;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({ zoom, onZoomChange, min = 0.5, max = 2 }) => {
  return (
    <div className="flex items-center gap-2 pointer-events-auto">
        {/* Font size reduced to text-[7px] to match footer scale */}
        <span className="text-[7px] text-black/60 font-bold w-6 text-center">{min}x</span>
        
        <div className="relative w-24 h-6 flex items-center">
            <input 
                type="range" 
                min={min} 
                max={max} 
                step="0.1" 
                value={zoom} 
                onChange={(e) => onZoomChange(parseFloat(e.target.value))}
                className="
                    w-full h-1 bg-black/10 rounded-lg appearance-none cursor-pointer outline-none
                    
                    [&::-webkit-slider-thumb]:appearance-none 
                    [&::-webkit-slider-thumb]:w-3.5 
                    [&::-webkit-slider-thumb]:h-3.5 
                    [&::-webkit-slider-thumb]:bg-black 
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:shadow-sm
                    [&::-webkit-slider-thumb]:transition-transform
                    
                    hover:[&::-webkit-slider-thumb]:scale-110
                    active:[&::-webkit-slider-thumb]:scale-125
                "
            />
        </div>
        
        {/* Font size reduced to text-[7px] to match footer scale */}
        <span className="text-[7px] text-black/60 font-bold w-6 text-center">{(zoom).toFixed(1)}x</span>
    </div>
  );
};

export default ZoomControls;