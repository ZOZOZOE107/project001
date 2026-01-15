
import React, { useEffect, useRef } from 'react';

interface LogoProps {
  isCameraOn: boolean;
  onRewind?: () => void;
}

const Logo: React.FC<LogoProps> = ({ isCameraOn, onRewind }) => {
  const trapezoidRef = useRef<SVGPathElement>(null);
  const squareRef = useRef<SVGRectElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Calculate delta from center of screen, scaled down by 25
      const deltaX = (e.clientX - window.innerWidth / 2) / 25;
      const deltaY = (e.clientY - window.innerHeight / 2) / 25;

      // Apply different parallax coefficients to each element
      if (trapezoidRef.current) {
        trapezoidRef.current.style.transform = `translate(${deltaX * 0.15}px, ${deltaY * 0.15}px)`;
      }
      if (squareRef.current) {
        squareRef.current.style.transform = `translate(${deltaX * 0.5}px, ${deltaY * 0.5}px)`;
      }
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${deltaX * 0.9}px, ${deltaY * 0.9}px)`;
      }
    };

    const handleMouseLeave = () => {
      // Reset positions
      [trapezoidRef.current, squareRef.current, dotRef.current].forEach(el => {
        if (el) el.style.transform = "translate(0, 0)";
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  const transitionStyle: React.CSSProperties = {
    transition: 'transform 0.2s cubic-bezier(0.2, 0.4, 0.3, 1)',
    transformOrigin: 'center center'
  };

  // Color Logic:
  // Mobile (Default): Always black ('fill-black')
  // Desktop (md): White if camera is on ('md:fill-white'), otherwise remains black.
  const fillClass = isCameraOn ? 'fill-black md:fill-white' : 'fill-black';
  const textClass = isCameraOn ? 'text-black md:text-white' : 'text-black';

  return (
    <div className="fixed md:absolute z-[100] pointer-events-auto 
        md:bottom-6 md:left-6 
        bottom-0 left-4 h-[60px] flex items-center">
      <button 
        onClick={onRewind}
        className="h-10 w-auto md:h-12 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity active:scale-95 bg-transparent border-none outline-none p-0 focus:outline-none scale-[0.7] origin-left"
        aria-label="Rewind"
      >
        <svg 
            viewBox="0 0 278.39 204.99" 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-full w-auto overflow-visible"
        >
            <g id="logo-group">
                {/* Left: Trapezoid Body */}
                <path 
                    ref={trapezoidRef}
                    id="trapezoid" 
                    className={fillClass}
                    style={transitionStyle}
                    d="M126.32 1.49c-.34-.9-1.2-1.49-2.16-1.49H66.1c-.96 0-1.82.59-2.16 1.49L.15 171.08q-.15.39-.15.81v30.79c0 1.27 1.03 2.3 2.3 2.3h185.66c1.27 0 2.3-1.03 2.3-2.3v-30.79q0-.42-.15-.81zm13.85 162.93H50.09c-3.38 0-5.69-3.42-4.43-6.56l45.01-111.9c1.61-3.99 7.26-3.99 8.87 0l45.05 111.9c1.26 3.14-1.04 6.56-4.43 6.56Z" 
                />
                
                {/* Right: Square */}
                <rect 
                    ref={squareRef}
                    id="square" 
                    className={fillClass}
                    style={transitionStyle}
                    width="41.78" 
                    height="45.81" 
                    x="236.61" 
                    y="42.87" 
                    rx="2.27" 
                    ry="2.27" 
                />
                
                {/* Right: Dot */}
                <circle 
                    ref={dotRef}
                    id="dot" 
                    className={fillClass}
                    style={transitionStyle}
                    cx="257.5" 
                    cy="181.22" 
                    r="20.89" 
                />
            </g>
        </svg>
      </button>

      {/* Credit Text - Visible only on Mobile now */}
      <div className={`md:hidden flex items-center gap-1 text-[10px] font-bold tracking-wider ${textClass} uppercase -ml-2 select-none`}>
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
  );
};

export default Logo;
