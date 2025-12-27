import React, { useEffect, useRef, useState } from 'react';
import { EffectMode } from '../types';

interface EffectSwitcherProps {
  currentMode: EffectMode;
  onSwitch: (mode: EffectMode) => void;
}

const EFFECTS = [
  { mode: EffectMode.NORMAL, label: 'RAW' },
  { mode: EffectMode.SHREDDER, label: 'SHRED' },
  { mode: EffectMode.PIXEL_GRID, label: 'GRID' },
  { mode: EffectMode.SANTA_WALKER, label: 'WALKER' },
  { mode: EffectMode.PIXEL_TEXT, label: 'TEXT' },
];

const ITEM_WIDTH = 32; 

const EffectSwitcher: React.FC<EffectSwitcherProps> = ({ currentMode, onSwitch }) => {
  const activeIndex = EFFECTS.findIndex(e => e.mode === currentMode);
  
  const containerWidth = 110; 
  const centerOffset = containerWidth / 2;
  const translateX = centerOffset - (activeIndex * ITEM_WIDTH + ITEM_WIDTH / 2);

  return (
    // Changed: top-20 -> top-16 (moved up)
    // Changed: Added scale-75 (75% size, close to 70% request) and origin-top to keep it anchored near header
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center select-none animate-in fade-in slide-in-from-top-4 duration-500 scale-75 origin-top">
      
      {/* Big Number Display - Changed font to Inter Light (font-light) */}
      <div className="text-white text-base font-light tracking-widest mb-0" style={{ fontFamily: "'Inter', sans-serif" }}>
        {activeIndex < 10 ? `0${activeIndex}` : activeIndex}
      </div>

      {/* Caret */}
      <div className="text-white text-[8px] mb-0.5">▼</div>

      {/* Ruler Container */}
      <div 
        className="relative overflow-hidden" 
        style={{ width: containerWidth, height: 24 }}
      >
        {/* Sliding Track */}
        <div 
          className="absolute top-0 left-0 h-full flex items-end transition-transform duration-500 cubic-bezier(0.2, 0.8, 0.2, 1)"
          style={{ transform: `translateX(${translateX}px)` }}
        >
          {EFFECTS.map((effect, index) => {
            const isActive = index === activeIndex;
            return (
              <div 
                key={effect.mode}
                className="relative flex flex-col items-center justify-end cursor-pointer group"
                style={{ width: ITEM_WIDTH, height: '100%' }}
                onClick={() => onSwitch(effect.mode)}
              >
                {/* Tick Line */}
                <div 
                  className={`w-[1px] bg-white transition-all duration-300 ${isActive ? 'h-3 opacity-100' : 'h-1.5 opacity-30 group-hover:h-2 group-hover:opacity-50'}`}
                ></div>
                
                {/* Small Label */}
                <span className={`absolute -bottom-3 text-[7px] font-sans tracking-widest transition-opacity duration-300 ${isActive ? 'opacity-100 text-white' : 'opacity-0'}`}>
                    {effect.label}
                </span>
                
                {/* Intermediate ticks */}
                <div className="absolute left-0 w-full h-1 bottom-0 flex justify-between px-1.5 opacity-20 pointer-events-none">
                    <div className="w-[1px] h-0.5 bg-white"></div>
                    <div className="w-[1px] h-0.5 bg-white"></div>
                    <div className="w-[1px] h-0.5 bg-white"></div>
                    <div className="w-[1px] h-0.5 bg-white"></div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Baseline */}
        <div className="absolute bottom-0 left-0 w-full h-[1px] bg-white/20"></div>
      </div>
    </div>
  );
};

export default EffectSwitcher;