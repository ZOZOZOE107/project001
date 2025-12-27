
import React, { useState, useCallback, useRef } from 'react';
import ARCanvas from './components/ARCanvas';
import Controls from './components/Controls';
import HeaderControls from './components/HeaderControls';
import InputOverlay from './components/InputOverlay';
import Logo from './components/Logo';
import { AppSettings } from './types';

const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>({
    size: 14,
    speed: 0.8,
    bounce: 0.2
  });

  const [textQueue, setTextQueue] = useState<string[]>([]);
  
  // Camera State
  const [isCameraOn, setIsCameraOn] = useState(true);
  
  // Zoom State (Default 1)
  const [zoomLevel, setZoomLevel] = useState(1);
  
  // Clear Trigger (increment to trigger)
  const [clearTrigger, setClearTrigger] = useState(0);
  
  // Rewind Trigger (increment to trigger)
  const [rewindTrigger, setRewindTrigger] = useState(0);

  // Sliding / Panning State
  const [panY, setPanY] = useState(0);
  const lastTouchY = useRef<number | null>(null);

  // Add characters to queue
  const handleQueueText = useCallback((text: string) => {
    setTextQueue(prev => [...prev, ...text.split('')]);
  }, []);

  // Remove first character from queue
  const handleTextConsumed = useCallback(() => {
    setTextQueue(prev => prev.slice(1));
  }, []);

  const handleToggleCamera = useCallback(() => {
    setIsCameraOn(prev => !prev);
  }, []);

  const handleClear = useCallback(() => {
    setClearTrigger(prev => prev + 1);
  }, []);

  const handleRewind = useCallback(() => {
    setRewindTrigger(prev => prev + 1);
  }, []);

  // --- Touch Handling for Global Slide ---
  const handleTouchStart = (e: React.TouchEvent) => {
    lastTouchY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (lastTouchY.current === null) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - lastTouchY.current;
    
    setPanY(prev => prev + deltaY);
    lastTouchY.current = currentY;
  };

  const handleTouchEnd = () => {
    lastTouchY.current = null;
  };

  return (
    <div 
        className={`relative w-full h-[100dvh] overflow-hidden transition-colors duration-500 bg-white md:${isCameraOn ? 'bg-black' : 'bg-white'}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
    >
      {/* 
          Global Slide Wrapper 
          Using a CSS transform here makes this div the containing block for all fixed descendants.
          This ensures that 'fixed' elements inside (like toolbars) move with the drag.
      */}
      <div 
        className="w-full h-full relative will-change-transform"
        style={{ transform: `translateY(${panY}px)` }}
      >
          <ARCanvas 
            settings={settings} 
            onSettingsChange={setSettings}
            textQueue={textQueue}
            onTextConsumed={handleTextConsumed}
            isCameraOn={isCameraOn}
            clearTrigger={clearTrigger}
            rewindTrigger={rewindTrigger}
            zoomLevel={zoomLevel}
          />
          
          {/* Mobile Top White Toolbar Background */}
          <div className="md:hidden fixed top-0 left-0 w-full h-[60px] bg-white z-40" />
          
          {/* Mobile Bottom White Toolbar Background */}
          <div className="md:hidden fixed bottom-0 left-0 w-full h-[60px] bg-white z-40" />

          {/* Top Left Controls */}
          <Controls 
            settings={settings} 
            onSettingsChange={setSettings} 
          />
          
          {/* Top Right Controls */}
          <HeaderControls
            isCameraOn={isCameraOn}
            onToggleCamera={handleToggleCamera}
            onClear={handleClear}
          />
          
          <InputOverlay 
            onQueueText={handleQueueText}
            isActive={true} 
            isCameraOn={isCameraOn}
          />

          {/* Bottom Left Logo (Now triggers rewind) */}
          <Logo isCameraOn={isCameraOn} onRewind={handleRewind} />
          
          {/* Footer / Credits - Responsive Layout */}
          
          {/* Mobile: Aligned to bottom (justify-end) in bottom white bar with slider */}
          <div className="md:hidden fixed bottom-0 left-0 w-full h-[60px] flex flex-col items-center justify-end z-50 pointer-events-none pb-2 gap-1">
             {/* Zoom Slider - Minimalist */}
             <div className="pointer-events-auto flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
                 <span className="text-[8px] font-bold text-black/40 tabular-nums w-4 text-right">
                   {zoomLevel.toFixed(1)}x
                 </span>
                 <input 
                   type="range" 
                   min="0.5" 
                   max="2.0" 
                   step="0.1" 
                   value={zoomLevel} 
                   onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                   className="w-24 h-[2px] bg-black/10 rounded-full appearance-none cursor-pointer 
                     focus:outline-none 
                     [&::-webkit-slider-thumb]:appearance-none 
                     [&::-webkit-slider-thumb]:w-2.5 
                     [&::-webkit-slider-thumb]:h-2.5 
                     [&::-webkit-slider-thumb]:rounded-full 
                     [&::-webkit-slider-thumb]:bg-black 
                     [&::-webkit-slider-thumb]:shadow-sm"
                 />
             </div>
             <p className="text-black/30 text-[8px] uppercase tracking-widest">@Aoe Studio</p>
          </div>

          {/* Desktop: Original Position */}
          <div className="hidden md:flex absolute bottom-6 left-0 w-full flex-col items-center justify-center pointer-events-none mix-blend-difference gap-1">
             <p className="text-white/30 text-[8px] uppercase tracking-widest">@Aoe Studio</p>
             <p className="text-white/30 text-[10px] uppercase tracking-widest">Typographic Tears</p>
          </div>
      </div>
    </div>
  );
};

export default App;
