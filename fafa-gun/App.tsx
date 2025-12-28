import React, { useState, useRef } from 'react';
import ARGame, { ARGameHandle } from './components/ARGame';
import { GameConfig } from './types';
import { Settings, Send, X } from 'lucide-react';

const CLASSIC_COLORS = ["#FFFFFF"];
const MORANDI_COLORS = ["#778899", "#8FBC8F", "#BC8F8F", "#D2B48C", "#A9A9A9", "#B0C4DE"];
// Marimekko Unikko inspired bold colors + User provided palette
const FAFA_COLORS = [
    "#d41c24", // Red
    "#eb246b", // Pink
    "#b91c4e", // Dark Pink
    "#f38324", // Orange
    "#20468E", // Blue
    "#F8C700", // Yellow
];

const INITIAL_CONFIG: GameConfig = {
  name: "Zero-G Mode",
  spawnRate: 800,
  minSpeed: 0, // Updated to 0
  maxSpeed: 7, // Updated relative to minSpeed
  targetSize: 14, 
  colors: CLASSIC_COLORS, 
  gravity: 0, 
  description: "Catch targets floating in from all sides!",
  shape: 'circle',
};

// Hand-drawn style minimalist icons
const SketchPlay = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    stroke="none" 
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* A filled, slightly organic triangle */}
    <path d="M6.5 5.5C6.5 5.5 18 11.5 18.5 12C19 12.5 18 13 6.5 19.5C5.5 20 5.5 18.5 6 12.5C6.2 9.5 5.5 6 6.5 5.5Z" />
  </svg>
);

const SketchStop = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    stroke="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* A filled, slightly organic square */}
    <path d="M7 7C7 6.5 17 6.2 17.5 7C18 7.8 17.8 17 17.5 17.5C17.2 18 7.5 17.8 7 17.5C6.5 17.2 6.8 7.5 7 7Z" />
  </svg>
);

const App: React.FC = () => {
  const [config, setConfig] = useState<GameConfig>(INITIAL_CONFIG);
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [cursorSize, setCursorSize] = useState(19); // Updated initial value to 19
  const [textSize, setTextSize] = useState(20); 
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const [launchQuantity, setLaunchQuantity] = useState(1);
  const [launchInterval, setLaunchInterval] = useState(500); 
  const [activePalette, setActivePalette] = useState<'classic' | 'morandi' | 'fafa'>('classic');
  
  const gameRef = useRef<ARGameHandle>(null);

  const toggleGame = () => {
    setIsPlaying(!isPlaying);
  };

  const handleBallSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const size = parseInt(e.target.value, 10);
    setConfig(prev => ({ ...prev, targetSize: size }));
  };

  const handleCursorSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCursorSize(parseInt(e.target.value, 10));
  };
  
  const handleTextSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextSize(parseInt(e.target.value, 10));
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const speed = parseInt(e.target.value, 10);
    setConfig(prev => ({ 
      ...prev, 
      minSpeed: speed, 
      maxSpeed: speed + 7 
    }));
  };

  const handleLaunchText = () => {
    if (customText.trim() && gameRef.current) {
      const textToLaunch = Array(launchQuantity).fill(customText.trim()).join(' ');
      gameRef.current.launchText(textToLaunch, launchInterval);
      setCustomText(""); 
    }
  };

  const handleLaunchBalls = () => {
    if (gameRef.current) {
      gameRef.current.launchBalls(launchQuantity, launchInterval);
    }
  };
  
  const toggleShape = (shape: 'circle' | 'heart' | 'fafa') => {
    setConfig(prev => ({ ...prev, shape }));
    if (shape === 'fafa' && activePalette !== 'fafa') {
        togglePalette('fafa');
    }
  };

  const togglePalette = (palette: 'classic' | 'morandi' | 'fafa') => {
    setActivePalette(palette);
    let colors = CLASSIC_COLORS;
    if (palette === 'morandi') colors = MORANDI_COLORS;
    if (palette === 'fafa') colors = FAFA_COLORS;

    setConfig(prev => ({ 
        ...prev, 
        colors: colors 
    }));
  };

  const isFafa = config.shape === 'fafa';

  return (
    <div className="h-screen w-screen bg-black text-black font-mono selection:bg-black selection:text-white flex flex-col overflow-hidden">
      
      {/* Top Fixed Bar - Responsive Layout */}
      <header className="bg-white z-40 shrink-0 relative flex flex-col md:flex-row md:h-12 md:items-center md:justify-between px-4 md:px-6 py-3 md:py-0 gap-1 md:gap-0 border-b md:border-b-0 border-gray-100 transition-all duration-300">
          
          {/* Top Row: Branding (L), Score (Center Mobile), Settings (R Mobile) */}
          <div className="relative flex items-center justify-between w-full md:w-auto md:justify-start md:gap-6 h-8 md:h-auto">
            
            {/* Branding with DIN Condensed / Oswald font */}
            <div className="text-xl md:text-2xl font-bold tracking-wider uppercase text-black shrink-0 font-['DIN_Condensed','Oswald','sans-serif']">
                AOE Studio
            </div>

            {/* Score: Absolute Center on Mobile, Static on Desktop */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 md:static md:transform-none md:translate-x-0 md:translate-y-0">
                <div className="text-[8px] md:text-[10px] tracking-[0.2em] text-gray-500 uppercase">
                    Score
                </div>
                <div className="text-xs md:text-sm font-light tracking-widest text-black">
                    {score.toLocaleString('en-US', { minimumIntegerDigits: 3, useGrouping: false })}
                </div>
            </div>

            {/* Mobile-only Settings Trigger */}
            <button 
                onClick={() => setIsSettingsOpen(true)}
                className="md:hidden p-2 hover:bg-gray-100 rounded-full transition-colors text-black"
            >
                <Settings size={14} />
            </button>
          </div>

          {/* Center: Input (Row 2 on Mobile with Transparency, Absolute Center on Desktop) */}
          <div className="relative w-full md:w-64 md:absolute md:left-1/2 md:transform md:-translate-x-1/2 mt-2 md:mt-0 flex gap-2">
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLaunchText();
              }}
              placeholder="TYPE TO LAUNCH"
              className="flex-1 min-w-0 text-center text-black placeholder-gray-400 text-[10px] tracking-[0.2em] uppercase outline-none transition-all
              bg-gray-100/80 backdrop-blur-md rounded-full py-2.5 border border-transparent focus:bg-white focus:border-gray-200
              md:bg-transparent md:backdrop-blur-none md:rounded-full md:py-2 md:border md:border-gray-300 md:focus:border-black md:focus:bg-transparent"
            />
            {/* Mobile-only Send Button */}
            <button 
                onClick={handleLaunchText}
                className="md:hidden flex items-center justify-center w-10 h-10 bg-gray-100/80 backdrop-blur-md rounded-full text-black hover:bg-white transition-all active:scale-95 border border-transparent shrink-0"
            >
                <Send size={14} />
            </button>
          </div>

          {/* Desktop-only Settings Trigger (Right Side) */}
          <div className="hidden md:block">
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-black"
              >
                <Settings size={14} />
              </button>
          </div>
      </header>

      {/* Main Game Area - Fills remaining space */}
      <div className="flex-grow relative overflow-hidden bg-black z-0">
        <ARGame 
          ref={gameRef}
          config={config} 
          cursorSize={cursorSize}
          textSize={textSize}
          isPlaying={isPlaying} 
          onScoreUpdate={setScore} 
          onGameOver={() => setIsPlaying(false)} 
        />
        
        {/* Play Button - Floating inside game area at bottom */}
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-30 pointer-events-auto">
          <button
              onClick={toggleGame}
              className={`
                w-12 h-12 rounded-full border border-white/50 hover:border-white transition-all duration-500
                flex items-center justify-center backdrop-blur-sm hover:scale-105 hover:bg-white/10
                ${isPlaying ? 'shadow-[0_0_15px_rgba(255,255,255,0.2)]' : ''}
              `}
          >
              {isPlaying ? (
                  <SketchStop size={12} className="text-white" />
              ) : (
                  <SketchPlay size={14} className="text-white ml-1" />
              )}
              
              {/* Spinning decorative ring when playing */}
              {isPlaying && (
                  <div className="absolute inset-0 rounded-full border border-dashed border-white/30 animate-spin duration-[3s]"></div>
              )}
          </button>
        </div>
      </div>

      {/* Bottom Fixed Bar - White */}
      <footer className="h-10 flex items-center justify-between px-6 z-40 shrink-0 transition-all duration-500 bg-white">
          {/* Left: System Info */}
          <div className="text-[8px] tracking-[0.2em] text-gray-500 uppercase flex items-center gap-2 font-bold mix-blend-multiply">
             <span className={`w-1 h-1 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
             System Ready
          </div>
          
          {/* Right: Version */}
          <div className="text-[8px] tracking-[0.2em] text-gray-400 uppercase font-bold mix-blend-multiply">
             v1.0.6 • FAFA GUN
          </div>
      </footer>

      {/* Settings Panel - Clean & Compact */}
      <div 
        className={`fixed right-0 top-0 h-full w-[280px] bg-white border-l border-gray-200 z-50 transition-transform duration-300 ease-out transform ${isSettingsOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="h-full flex flex-col text-black">
            {/* Header */}
            <div className="h-12 border-b border-gray-100 flex items-center justify-between px-6">
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-black">Config</span>
                <button onClick={() => setIsSettingsOpen(false)} className="text-gray-400 hover:text-black">
                    <X size={14} />
                </button>
            </div>

            {/* Content Scrollable */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                
                {/* Visual Section */}
                <div className="space-y-3">
                    <label className="text-[9px] font-bold tracking-[0.2em] text-gray-400 uppercase block">
                        Visual Mode
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        <button onClick={() => toggleShape('circle')} className={`py-2 text-[9px] tracking-widest uppercase border transition-colors ${config.shape === 'circle' ? 'border-black text-black' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}>Circle</button>
                        <button onClick={() => toggleShape('heart')} className={`py-2 text-[9px] tracking-widest uppercase border transition-colors ${config.shape === 'heart' ? 'border-black text-black' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}>Heart</button>
                        <button onClick={() => toggleShape('fafa')} className={`py-2 text-[9px] tracking-widest uppercase border transition-colors ${config.shape === 'fafa' ? 'border-black text-black' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}>Fafa</button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => togglePalette('classic')} className={`flex-1 py-1 text-[9px] tracking-widest uppercase border-b transition-colors ${activePalette === 'classic' ? 'border-black text-black' : 'border-transparent text-gray-400'}`}>Classic</button>
                        {/* Renamed Morandi to Color */}
                        <button onClick={() => togglePalette('morandi')} className={`flex-1 py-1 text-[9px] tracking-widest uppercase border-b transition-colors ${activePalette === 'morandi' ? 'border-black text-black' : 'border-transparent text-gray-400'}`}>Color</button>
                    </div>
                </div>

                {/* Batch Control */}
                <div className="space-y-4">
                     <label className="text-[9px] font-bold tracking-[0.2em] text-gray-400 uppercase block">
                        Batch Ops
                    </label>
                    
                    <button 
                        onClick={handleLaunchBalls}
                        className="w-full py-3 border border-blue-500/30 text-blue-600 hover:bg-blue-50 transition-all text-[9px] tracking-widest uppercase flex items-center justify-center gap-2"
                    >
                        <Send size={10} /> Launch [{launchQuantity}]
                    </button>

                    <div className="space-y-1">
                        <div className="flex justify-between text-[9px] uppercase tracking-wider text-gray-400">
                            <span>Count</span>
                            <span className="text-black">{launchQuantity}</span>
                        </div>
                        <input 
                            type="range" min="1" max="20" 
                            value={launchQuantity} onChange={(e) => setLaunchQuantity(parseInt(e.target.value))}
                            className="w-full h-[1px] bg-gray-200 appearance-none cursor-pointer accent-black"
                        />
                    </div>
                     <div className="space-y-1">
                        <div className="flex justify-between text-[9px] uppercase tracking-wider text-gray-400">
                            <span>Delay</span>
                            <span className="text-black">{launchInterval}ms</span>
                        </div>
                        <input 
                            type="range" min="100" max="2000" step="50"
                            value={launchInterval} onChange={(e) => setLaunchInterval(parseInt(e.target.value))}
                            className="w-full h-[1px] bg-gray-200 appearance-none cursor-pointer accent-black"
                        />
                    </div>
                </div>

                {/* Physics */}
                <div className="space-y-4 pt-4 border-t border-gray-100">
                     <label className="text-[9px] font-bold tracking-[0.2em] text-gray-400 uppercase block">
                        Parameters
                    </label>
                    
                    {/* Sliders with updated ranges */}
                    {[
                        { label: "Text Size", val: textSize, min: 0, max: 35, fn: handleTextSizeChange },
                        { label: "Velocity", val: config.minSpeed, min: 0, max: 15, fn: handleSpeedChange },
                        { label: "Target Size", val: config.targetSize, min: 0, max: 30, fn: handleBallSizeChange },
                        { label: "HUD Size", val: cursorSize, min: 0, max: 30, fn: handleCursorSizeChange },
                    ].map((item, i) => (
                        <div key={i} className="space-y-1">
                            <div className="flex justify-between text-[9px] uppercase tracking-wider text-gray-400">
                                <span>{item.label}</span>
                                <span className="text-black">{item.val}</span>
                            </div>
                            <input 
                                type="range" min={item.min} max={item.max}
                                value={item.val} onChange={item.fn}
                                className="w-full h-[1px] bg-gray-200 appearance-none cursor-pointer accent-black"
                            />
                        </div>
                    ))}
                </div>

            </div>
        </div>
      </div>
      
      {/* Scrollbar CSS */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 2px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #ccc; }
      `}</style>
    </div>
  );
};

export default App;