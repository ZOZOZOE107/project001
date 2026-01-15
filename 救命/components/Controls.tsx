
import React, { useState } from 'react';
import { AppSettings } from '../types';

interface ControlsProps {
  settings: AppSettings;
  onSettingsChange: (newSettings: AppSettings) => void;
  isCameraOn: boolean;
}

const Controls: React.FC<ControlsProps> = ({ settings, onSettingsChange, isCameraOn }) => {
  // State to track which controls are open individually
  const [openControls, setOpenControls] = useState<Record<string, boolean>>({
    SIZE: false,
    SPEED: false,
    BOUNCE: false
  });

  const toggleControl = (label: string) => {
    setOpenControls(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };

  const handleChange = (key: keyof AppSettings, value: number) => {
    onSettingsChange({
      ...settings,
      [key]: value
    });
  };

  const getIcon = (label: string) => {
    // Reduced icon size for mobile (approx 1/3 smaller: 20px -> 14px)
    const size = "14";
    switch (label) {
      case "SIZE":
        // Text Size Icon
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7V4h16v3" />
            <path d="M9 20h6" />
            <path d="M12 4v16" />
          </svg>
        );
      case "SPEED":
        // Lightning Icon
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        );
      case "BOUNCE":
        // Droplet Icon (Tears)
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
             <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>
          </svg>
        );
      default: return null;
    }
  };

  // Mobile: Vertical Sliders (Side-by-side row)
  const renderVerticalSlider = (
    label: string, 
    value: number, 
    min: number, 
    max: number, 
    step: number, 
    onChange: (val: number) => void,
    displayValue: string | number
  ) => {
    const isOpen = openControls[label];

    return (
      <div className="flex flex-col items-center gap-1">
        {/* Icon - Always visible, acts as toggle trigger */}
        <div 
          className="opacity-90 cursor-pointer p-1 active:opacity-50 transition-opacity"
          onClick={() => toggleControl(label)}
        >
          {getIcon(label)}
        </div>

        {/* Collapsible Area: Slider + Value */}
        <div 
          className={`flex flex-col items-center gap-1 overflow-hidden transition-all duration-500 ease-in-out origin-top ${
              isOpen 
              ? 'max-h-[200px] opacity-100 translate-y-0 pointer-events-auto' 
              : 'max-h-0 opacity-0 -translate-y-2 pointer-events-none'
          }`}
        >
          <div className="relative w-4 h-32 flex items-center justify-center">
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(e) => onChange(parseFloat(e.target.value))}
              data-setting-key={label.toLowerCase()} // Added for AR interaction
              className="absolute w-32 h-6 bg-transparent appearance-none cursor-pointer -rotate-90 origin-center touch-none
                focus:outline-none
                [&::-webkit-slider-runnable-track]:bg-white/40 
                [&::-webkit-slider-runnable-track]:h-[1px] 
                [&::-webkit-slider-runnable-track]:w-full
                [&::-webkit-slider-thumb]:appearance-none 
                [&::-webkit-slider-thumb]:w-3 
                [&::-webkit-slider-thumb]:h-3 
                [&::-webkit-slider-thumb]:rounded-full 
                [&::-webkit-slider-thumb]:bg-white 
                [&::-webkit-slider-thumb]:mt-[-5px]"
            />
          </div>
          <span className="text-[9px] tabular-nums opacity-90">{displayValue}</span>
        </div>
      </div>
    );
  };

  // Desktop: Horizontal Sliders (Stacked vertically)
  const renderHorizontalSlider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (val: number) => void,
    displayValue: string | number
  ) => (
    <div className="flex flex-col gap-1 w-40">
      <div className="flex justify-between items-end">
         <span className="text-[10px] font-bold tracking-wider opacity-70 uppercase">{label}</span>
         <span className="text-[10px] tabular-nums opacity-90">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        data-setting-key={label.toLowerCase()} // Added for AR interaction
        className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer
          focus:outline-none
          [&::-webkit-slider-thumb]:appearance-none 
          [&::-webkit-slider-thumb]:w-3 
          [&::-webkit-slider-thumb]:h-3 
          [&::-webkit-slider-thumb]:rounded-full 
          [&::-webkit-slider-thumb]:bg-white"
      />
    </div>
  );

  return (
    <>
      {/* Mobile View: Row of Vertical Sliders with Icons */}
      {/* Positioned at top-[22px] to center 14px icons in 60px bar */}
      <div className="md:hidden fixed top-[22px] left-4 flex gap-4 z-50 text-white select-none pointer-events-auto mix-blend-difference">
        {renderVerticalSlider("SIZE", settings.size, 5, 60, 1, (v) => handleChange('size', v), settings.size)}
        {renderVerticalSlider("SPEED", settings.speed, 0.1, 2.0, 0.1, (v) => handleChange('speed', v), settings.speed.toFixed(1))}
        {renderVerticalSlider("BOUNCE", settings.bounce, 0.0, 0.9, 0.1, (v) => handleChange('bounce', v), settings.bounce.toFixed(1))}
      </div>

      {/* Desktop View: Column of Horizontal Sliders + Credits */}
      <div className="hidden md:flex absolute top-6 left-6 flex-col gap-6 z-50 select-none pointer-events-auto">
        {/* Sliders - Uses mix-blend-difference for inversed contrast */}
        <div className="flex flex-col gap-6 text-white mix-blend-difference">
            {renderHorizontalSlider("SIZE", settings.size, 5, 60, 1, (v) => handleChange('size', v), settings.size)}
            {renderHorizontalSlider("SPEED", settings.speed, 0.1, 2.0, 0.1, (v) => handleChange('speed', v), settings.speed.toFixed(1))}
            {renderHorizontalSlider("BOUNCE", settings.bounce, 0.0, 0.9, 0.1, (v) => handleChange('bounce', v), settings.bounce.toFixed(1))}
        </div>
        
        {/* Credits - Separated to avoid inverted emoji colors */}
        {/* Using shadow for readability on video instead of difference blend */}
        <div 
          className={`flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase transition-colors duration-300 ${isCameraOn ? 'text-white' : 'text-black'}`}
          style={{ textShadow: isCameraOn ? '0 1px 2px rgba(0,0,0,0.5)' : 'none' }}
        >
            <span className="opacity-70">made by</span>
            <a 
              href="https://xhslink.com/m/7WvN3Nruuxq" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="opacity-70 underline underline-offset-2 hover:opacity-100 transition-opacity"
            >
              @OE一
            </a>
            <span className="opacity-70">🍠：）</span>
        </div>
      </div>
    </>
  );
};

export default Controls;
