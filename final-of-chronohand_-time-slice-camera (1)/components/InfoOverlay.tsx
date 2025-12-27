import React from 'react';
import { AppState, EffectMode } from '../types';
import ZoomControls from './ZoomControls';

interface InfoOverlayProps {
  state: AppState;
  fps: number;
  handCount: number;
  effectMode?: EffectMode;
  onReset?: () => void;
  showZoom?: boolean;
  zoomLevel?: number;
  onZoomChange?: (zoom: number) => void;
}

const InfoOverlay: React.FC<InfoOverlayProps> = ({ 
  state, 
  fps, 
  handCount, 
  effectMode, 
  showZoom = false, 
  zoomLevel = 1, 
  onZoomChange 
}) => {
  
  const getInstructions = () => {
    if (state === AppState.IDLE) return "Point up to resize";
    if (state === AppState.RESIZING) return "Pinch to freeze";
    if (state === AppState.FROZEN) {
        if (effectMode === EffectMode.SHREDDER) return "Tear with two hands";
        if (effectMode === EffectMode.PIXEL_GRID) return "Touch to disturb";
        if (effectMode === EffectMode.SANTA_WALKER) return "Show hand to control";
        return "Fists to reset";
    }
    return "";
  };

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none z-20 flex flex-col justify-between font-sans text-sm font-light">
      
      {/* Top Bar - Borders removed */}
      <header className="h-14 bg-white flex items-center justify-between px-6 select-none">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-black rounded-full animate-pulse"></div>
          <h1 className="text-black font-bold tracking-tight text-2xl uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>AOE STUDIO</h1>
        </div>
        
        <div className="flex items-center gap-8 text-xs text-black/80">
          <div className="flex flex-col items-end leading-tight">
            <span className="text-[10px] text-black/40 uppercase tracking-wide">Status</span>
            <span className="font-medium">{state}</span>
          </div>
          <div className="flex flex-col items-end leading-tight">
            <span className="text-[10px] text-black/40 uppercase tracking-wide">FPS</span>
            <span className="font-medium">{fps}</span>
          </div>
          <div className="flex flex-col items-end leading-tight min-w-[3rem]">
            <span className="text-[10px] text-black/40 uppercase tracking-wide">Input</span>
            <span className="font-medium">{handCount} Hand{handCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </header>

      {/* Center Region (Transparent for Canvas) */}
      <div className="flex-1 relative">
        {/* Subtle Crosshair in center */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 opacity-20">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1px] h-full bg-white mix-blend-difference"></div>
            <div className="absolute top-1/2 left-0 -translate-y-1/2 h-[1px] w-full bg-white mix-blend-difference"></div>
        </div>
      </div>

      {/* Bottom Bar - Borders removed */}
      <footer className="h-14 bg-white flex items-center justify-between px-6 select-none text-black relative">
        <div className="flex items-center gap-3 min-w-[100px]">
           {/* Font size reduced to text-[9px] (~70% of text-xs/12px) */}
           <span className="text-[9px] font-medium tracking-wide uppercase text-black">
             {getInstructions()}
           </span>
        </div>

        <div className="flex items-center gap-4 min-w-[100px] justify-end">
           {/* Zoom Controls moved here to align right with the mode display */}
           {showZoom && onZoomChange && (
                <ZoomControls zoom={zoomLevel} onZoomChange={onZoomChange} />
           )}

           <div className="text-right leading-tight">
             {/* Font size reduced to text-[7px] (~70% of text-[10px]) */}
             <div className="text-[7px] text-black/40 uppercase tracking-wide">Mode</div>
             {/* Font size reduced to text-[9px] (~70% of text-xs/12px) */}
             <div className="text-[9px] font-medium tracking-wide uppercase">{effectMode?.replace('_', ' ')}</div>
           </div>
        </div>
      </footer>

    </div>
  );
};

export default InfoOverlay;