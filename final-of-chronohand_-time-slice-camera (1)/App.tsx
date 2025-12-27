import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, Rect, Results, EffectMode, NormalizedLandmarkList } from './types';
import { isPointingUp, isPinching, isHandClosed, isVictoryHand } from './utils/gestureUtils';
import InfoOverlay from './components/InfoOverlay';
import ShredderControls from './components/ShredderControls';
import PixelTextControls from './components/PixelTextControls';
import EffectSwitcher from './components/EffectSwitcher';
import { BezierPath, SantaPuppet } from './utils/santaUtils';
import { PixelTextManager } from './utils/pixelTextEffect';
import { drawKissEffect } from './utils/kissEffectUtils';

// Simple pseudo-noise generator for organic motion
const pseudoNoise = (x: number) => {
  return Math.sin(x) + Math.sin(x * 1.4) * 0.5 + Math.sin(x * 2.6) * 0.25;
};

// Particle definition for Pixel Grid Effect
interface Particle {
  x: number;       // Current Screen X
  y: number;       // Current Screen Y
  originX: number; // Target Screen X (Grid position)
  originY: number; // Target Screen Y (Grid position)
  vx: number;      // Velocity X
  vy: number;      // Velocity Y
  pixelIdx: number; // Index in the source ImageData array
}

const App: React.FC = () => {
  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frozenCanvasRef = useRef<HTMLCanvasElement | null>(null); // Stores the STATIC frozen background
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);   // Stores the LIVE frame for pixel sampling
  
  // Lifecycle ref to prevent async calls after unmount
  const isMountedRef = useRef<boolean>(true);

  // Layout State
  const [isMobile, setIsMobile] = useState<boolean>(false);

  // Zoom State
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const zoomLevelRef = useRef<number>(1.0);

  // Using refs for animation loop state to avoid closure staleness
  const stateRef = useRef<AppState>(AppState.IDLE);
  const rectRef = useRef<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const handCountRef = useRef<number>(0);
  const effectModeRef = useRef<EffectMode>(EffectMode.NORMAL);
  const particlesRef = useRef<Particle[]>([]);
  
  // Store Face Mesh Results
  const faceLandmarksRef = useRef<NormalizedLandmarkList[]>([]);

  // Santa Refs
  const santaPathRef = useRef<BezierPath>(new BezierPath());
  const santaPuppetRef = useRef<SantaPuppet>(new SantaPuppet());
  const santaPathProgressRef = useRef<number>(0);

  // Pixel Text Ref
  const pixelTextManagerRef = useRef<PixelTextManager>(new PixelTextManager());

  // Interaction Logic Refs
  const resetStartTimeRef = useRef<number | null>(null);
  const effectSwitchStartTimeRef = useRef<number | null>(null);

  // --- State for UI ---
  const [uiState, setUiState] = useState<AppState>(AppState.IDLE);
  const [fps, setFps] = useState<number>(0);
  const [handCount, setHandCount] = useState<number>(0);
  const [shredCount, setShredCount] = useState<number>(10);
  const [currentEffect, setCurrentEffect] = useState<EffectMode>(EffectMode.NORMAL);
  
  // State for Pixel Text Effect
  const [pixelText, setPixelText] = useState<string>("MERRY CHRISTMAS");
  const [pixelScale, setPixelScale] = useState<number>(1.0);

  // Ref for shredCount to avoid re-creating onResults
  const shredCountRef = useRef<number>(10);

  // Sync state to ref
  useEffect(() => {
    shredCountRef.current = shredCount;
  }, [shredCount]);

  // Sync zoom to ref for render loop
  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  // Handle Resize / Mobile Detection
  useEffect(() => {
    const checkMobile = () => {
        setIsMobile(window.innerWidth < 768); // Tailwind 'md' breakpoint
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle Pixel Text Effect Updates
  useEffect(() => {
    if (uiState === AppState.FROZEN && currentEffect === EffectMode.PIXEL_TEXT) {
        // Re-initialize text when text or scale changes while the effect is active
        pixelTextManagerRef.current.init(rectRef.current, pixelText, pixelScale);
    }
  }, [pixelText, pixelScale, uiState, currentEffect]);

  // --- Helpers ---

  // Initialize Particles for Pixel Grid
  const initParticles = useCallback((r: Rect, imgW: number, imgH: number) => {
    const GRID_SIZE = 12; // Pixel size
    const cols = Math.floor(r.w / GRID_SIZE);
    const rows = Math.floor(r.h / GRID_SIZE);
    const newParticles: Particle[] = [];

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // Position relative to the Rect
        const localX = x * GRID_SIZE;
        const localY = y * GRID_SIZE;
        
        // Screen position
        const screenX = r.x + localX;
        const screenY = r.y + localY;

        // Calculate pixel index for the CENTER of the grid cell
        const centerX = Math.floor(localX + GRID_SIZE / 2);
        const centerY = Math.floor(localY + GRID_SIZE / 2);
        
        // Ensure within bounds
        const safeX = Math.min(Math.max(centerX, 0), r.w - 1);
        const safeY = Math.min(Math.max(centerY, 0), r.h - 1);
        
        const pixelIdx = (safeY * Math.floor(r.w) + safeX) * 4;

        newParticles.push({
          x: screenX,
          y: screenY,
          originX: screenX,
          originY: screenY,
          vx: 0,
          vy: 0,
          pixelIdx: pixelIdx
        });
      }
    }
    particlesRef.current = newParticles;
  }, []);

  // Initialize Santa Path
  const initSanta = useCallback((r: Rect) => {
     santaPathRef.current.generate(r.w, r.h);
     santaPathProgressRef.current = 0;
     // Initialize puppet position to start of path
     const start = santaPathRef.current.getPoint(0);
     santaPuppetRef.current.body = { x: r.x + start.x, y: r.y + start.y };
     santaPuppetRef.current.head = { x: r.x + start.x, y: r.y + start.y - 50 };
  }, []);

  // Initialize Pixel Text
  const initPixelText = useCallback((r: Rect) => {
     pixelTextManagerRef.current.init(r, pixelText, pixelScale);
  }, [pixelText, pixelScale]);

  // Handle Switcher change
  const handleEffectSwitch = useCallback((mode: EffectMode) => {
    effectModeRef.current = mode;
    setCurrentEffect(mode);
    
    // Trigger init for specific modes
    if (mode === EffectMode.SANTA_WALKER) {
        initSanta(rectRef.current);
    } else if (mode === EffectMode.PIXEL_TEXT) {
        initPixelText(rectRef.current);
    } else if (mode === EffectMode.PIXEL_GRID) {
        particlesRef.current = []; // Reset particles to re-init on next frame
    }
  }, [initSanta, initPixelText]);

  
  const lastFrameTime = useRef<number>(Date.now());
  const frameCount = useRef<number>(0);

  const updateStats = () => {
    frameCount.current++;
    const now = Date.now();
    if (now - lastFrameTime.current >= 1000) {
      setFps(frameCount.current);
      frameCount.current = 0;
      lastFrameTime.current = now;
      setUiState(stateRef.current);
      setHandCount(handCountRef.current);
      setCurrentEffect(effectModeRef.current);
    }
  };

  const playShutterSound = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      
      const ctx = new Ctx();
      const t = ctx.currentTime;
      
      // Helper to create filtered noise
      const createNoise = (startTime: number, duration: number, freq: number, gainVal: number) => {
         const bufferSize = ctx.sampleRate * duration;
         const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
         const data = buffer.getChannelData(0);
         for (let i = 0; i < bufferSize; i++) {
           data[i] = Math.random() * 2 - 1;
         }
         const noise = ctx.createBufferSource();
         noise.buffer = buffer;
         
         const filter = ctx.createBiquadFilter();
         filter.type = 'lowpass';
         filter.frequency.setValueAtTime(freq, startTime);
         
         const gain = ctx.createGain();
         gain.gain.setValueAtTime(gainVal, startTime);
         gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
         
         noise.connect(filter);
         filter.connect(gain);
         gain.connect(ctx.destination);
         
         noise.start(startTime);
         noise.stop(startTime + duration);
      };

      // 1. "Ka" - The mechanical click (High pitch, short)
      const osc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      osc.connect(clickGain);
      clickGain.connect(ctx.destination);
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.exponentialRampToValueAtTime(100, t + 0.05);
      clickGain.gain.setValueAtTime(0.5, t);
      clickGain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
      osc.start(t);
      osc.stop(t + 0.05);

      createNoise(t, 0.04, 3000, 0.3);
      // 2. "Cha" - The shutter closing
      createNoise(t + 0.08, 0.15, 800, 0.8);
      
      setTimeout(() => {
        if (ctx.state !== 'closed') ctx.close();
      }, 400);

    } catch (e) {
      console.warn("Shutter sound failed:", e);
    }
  }, []);

  const resetSystem = useCallback(() => {
    stateRef.current = AppState.IDLE;
    rectRef.current = { x: 0, y: 0, w: 0, h: 0 };
    effectModeRef.current = EffectMode.NORMAL;
    setUiState(AppState.IDLE);
    setCurrentEffect(EffectMode.NORMAL);
    
    resetStartTimeRef.current = null;
    effectSwitchStartTimeRef.current = null;
    particlesRef.current = []; // Clear particles
    if (frozenCanvasRef.current) {
      const ctx = frozenCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, frozenCanvasRef.current.width, frozenCanvasRef.current.height);
    }
  }, []);

  // --- Logic ---

  const onResults = useCallback((results: Results) => {
    updateStats();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    
    if (!canvas || !ctx) return;

    // Handle Mobile Logic vs Desktop Logic
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Match canvas buffer size to display size
    const displayWidth = Math.floor(rect.width);
    const displayHeight = Math.floor(rect.height);

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      
      // Update Offscreen Buffers to match new canvas size
      if (!frozenCanvasRef.current) {
        frozenCanvasRef.current = document.createElement('canvas');
      }
      frozenCanvasRef.current.width = displayWidth;
      frozenCanvasRef.current.height = displayHeight;

      if (!liveCanvasRef.current) {
        liveCanvasRef.current = document.createElement('canvas');
      }
      liveCanvasRef.current.width = displayWidth;
      liveCanvasRef.current.height = displayHeight;
    }

    const canvasW = canvas.width;
    const canvasH = canvas.height;
    
    // 2. Calculate Dimensions with ZOOM
    const imgW = (results.image as any).width || 1280;
    const imgH = (results.image as any).height || 720;

    // Base scale to cover the container
    const baseScale = Math.max(canvasW / imgW, canvasH / imgH);
    
    // Apply digital zoom
    const zoom = zoomLevelRef.current;
    const scale = baseScale * zoom;

    const drawW = imgW * scale;
    const drawH = imgH * scale;
    
    const offsetX = (canvasW - drawW) / 2;
    const offsetY = (canvasH - drawH) / 2;

    // 3. Prepare Drawing Context
    ctx.save();
    ctx.clearRect(0, 0, canvasW, canvasH);

    // ！！！重要修改：移除镜像变换 ！！！
    // 之前代码：ctx.translate(canvasW, 0); ctx.scale(-1, 1);
    // 现在：直接绘制，不进行镜像

    const hands = results.multiHandLandmarks;
    handCountRef.current = hands ? hands.length : 0;

    const getScreenCoord = (normalizedX: number, normalizedY: number) => {
      return {
        x: offsetX + normalizedX * drawW,
        y: offsetY + normalizedY * drawH
      };
    };

    // Check for Victory Gesture (Global Trigger for Kiss Effect)
    let isVictory = false;
    if (hands && hands.length > 0) {
      isVictory = hands.some(hand => isVictoryHand(hand));
    }

    // --- State Machine ---

    if (stateRef.current === AppState.IDLE && hands && hands.length === 2) {
      if (isPointingUp(hands[0]) && isPointingUp(hands[1])) {
        stateRef.current = AppState.RESIZING;
      }
    }

    if (stateRef.current === AppState.RESIZING && hands && hands.length === 2) {
      const p1 = getScreenCoord(hands[0][8].x, hands[0][8].y);
      const p2 = getScreenCoord(hands[1][8].x, hands[1][8].y);

      rectRef.current = {
        x: Math.min(p1.x, p2.x),
        y: Math.min(p1.y, p2.y),
        w: Math.abs(p1.x - p2.x),
        h: Math.abs(p1.y - p2.y)
      };

      if (isPinching(hands[0]) && isPinching(hands[1])) {
        stateRef.current = AppState.FROZEN;
        playShutterSound();
        
        // CAPTURE FROZEN FRAME
        if (frozenCanvasRef.current) {
           const fCtx = frozenCanvasRef.current.getContext('2d');
           if (fCtx) {
             fCtx.save();
             // Draw raw image without mirroring
             fCtx.drawImage(results.image, offsetX, offsetY, drawW, drawH);
             fCtx.restore();
           }
        }
        
        // Init logic for effects that need start up
        if (effectModeRef.current === EffectMode.SANTA_WALKER) {
             initSanta(rectRef.current);
        } else if (effectModeRef.current === EffectMode.PIXEL_TEXT) {
             initPixelText(rectRef.current);
        }
      }
    }

    // --- Interaction Data Preparation ---
    let activeHands: any[] = [];
    if (stateRef.current === AppState.FROZEN && hands) {
        // Filter for Pointing Up hands
        activeHands = hands.filter(h => isPointingUp(h));
        // Sort by X
        activeHands.sort((a, b) => a[8].x - b[8].x);
    }

    // --- Rendering ---

    if (stateRef.current === AppState.FROZEN) {
      const r = rectRef.current;

      // 1. Draw Background (The Frozen Snapshot)
      if (frozenCanvasRef.current) {
         ctx.drawImage(frozenCanvasRef.current, 0, 0, canvasW, canvasH);
      }
      
      // 2. Handle Effects inside the Rect
      
      if (effectModeRef.current === EffectMode.PIXEL_GRID) {
        // --- PIXEL GRID EFFECT ---
        
        // A. Process Live Frame for Sampling
        let roiData: Uint8ClampedArray | null = null;
        
        if (liveCanvasRef.current) {
             const lCtx = liveCanvasRef.current.getContext('2d');
             if (lCtx) {
                 lCtx.clearRect(0,0, canvasW, canvasH);
                 lCtx.save();
                 // Draw live frame without mirroring
                 lCtx.drawImage(results.image, offsetX, offsetY, drawW, drawH);
                 lCtx.restore();

                 // Extract ROI
                 const rx = Math.floor(r.x);
                 const ry = Math.floor(r.y);
                 const rw = Math.floor(r.w);
                 const rh = Math.floor(r.h);
                 
                 if (rw > 0 && rh > 0) {
                    const imageData = lCtx.getImageData(rx, ry, rw, rh);
                    roiData = imageData.data;
                 }
             }
        }

        // B. Initialize Particles if needed
        if (particlesRef.current.length === 0) {
             initParticles(r, canvasW, canvasH);
        }

        // C. Interaction Physics
        let repulsor: {x: number, y: number} | null = null;
        if (activeHands.length > 0) {
            const h = activeHands[0];
            const coord = getScreenCoord(h[8].x, h[8].y);
            repulsor = coord;
        }

        const GRID_SIZE = 12;
        const radius = 120;
        const strength = 20;
        const spring = 0.1;
        const friction = 0.85;

        // D. Update & Draw Particles
        if (roiData) {
            for (let i = 0; i < particlesRef.current.length; i++) {
                const p = particlesRef.current[i];
                
                // Physics
                let forceX = 0;
                let forceY = 0;

                // Repulsion
                if (repulsor) {
                    const dx = p.x - repulsor.x;
                    const dy = p.y - repulsor.y;
                    const distSq = dx*dx + dy*dy;
                    
                    if (distSq < radius * radius) {
                        const dist = Math.sqrt(distSq);
                        const f = (radius - dist) / radius; 
                        const angle = Math.atan2(dy, dx);
                        forceX += Math.cos(angle) * f * strength;
                        forceY += Math.sin(angle) * f * strength;
                    }
                }

                // Spring back
                const dxOrigin = p.originX - p.x;
                const dyOrigin = p.originY - p.y;
                forceX += dxOrigin * spring;
                forceY += dyOrigin * spring;

                p.vx += forceX;
                p.vy += forceY;
                p.vx *= friction;
                p.vy *= friction;
                p.x += p.vx;
                p.y += p.vy;

                // Color Lookup
                if (p.pixelIdx < roiData.length - 4) {
                    const R = roiData[p.pixelIdx];
                    const G = roiData[p.pixelIdx + 1];
                    const B = roiData[p.pixelIdx + 2];
                    
                    ctx.fillStyle = `rgb(${R},${G},${B})`;
                    ctx.fillRect(p.x, p.y, GRID_SIZE + 1, GRID_SIZE + 1);
                }
            }
        }

      } else if (effectModeRef.current === EffectMode.SHREDDER) {
        // --- SHREDDER EFFECT ---
        const numStrips = Math.max(1, shredCountRef.current);
        const stripHeight = r.h / numStrips;
        const time = Date.now() / 800;
        
        for (let i = 0; i < numStrips; i++) {
           const stripY = r.y + i * stripHeight;
           const stripCenterY = stripY + stripHeight / 2;
           
           const wave = Math.sin(time + i * 0.3) * 8;
           const drift = Math.cos(time * 0.5 + i * 0.7) * 4;
           
           let userOffset = 0;
           let pullIntensity = 0;
           
           if (activeHands.length > 0) {
               let controllingHand = null;
               
               if (activeHands.length === 1) {
                   controllingHand = activeHands[0];
               } else {
                   controllingHand = (i % 2 === 0) ? activeHands[0] : activeHands[1];
               }

               if (controllingHand) {
                   const handX = controllingHand[8].x;
                   const handY = controllingHand[8].y * canvasH; 
                   
                   const basePull = (handX - 0.5) * 800;
                   const dist = Math.abs(stripCenterY - handY);
                   const influenceRange = canvasH * 0.7; 
                   const attenuation = Math.max(0, 1 - (dist / influenceRange));
                   
                   userOffset = basePull * attenuation;
                   pullIntensity = Math.abs(userOffset);
               }
           }

           const noiseT = time * 2 + i * 0.4;
           const noiseVal = pseudoNoise(noiseT);
           
           const verticalFluctuation = noiseVal * (5 + pullIntensity * 0.05);
           const horizontalFluctuation = pseudoNoise(noiseT + 100) * (pullIntensity * 0.1);

           const offset = wave + drift + userOffset + horizontalFluctuation;
           const drawY = stripY + verticalFluctuation;
           
           ctx.save();
           ctx.beginPath();
           ctx.rect(r.x + offset, drawY, r.w, stripHeight);
           ctx.clip();
           ctx.drawImage(results.image, offsetX + offset, offsetY, drawW, drawH);
           ctx.restore();
        }

      } else if (effectModeRef.current === EffectMode.SANTA_WALKER) {
        // --- SANTA WALKER EFFECT ---
        
        // 1. Draw The "Transparent" Window
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
        ctx.drawImage(results.image, offsetX, offsetY, drawW, drawH);
        ctx.restore();

        // 2. Logic Update
        let mode: 'AUTO' | 'PUPPET' = 'AUTO';
        let controllerHand: any = null;

        if (hands && hands.length > 0) {
          mode = 'PUPPET';
          controllerHand = hands[0]; // Use first hand
        } else {
          // Auto Pilot Progress
          santaPathProgressRef.current += 0.002;
          if (santaPathProgressRef.current > 1) {
            santaPathProgressRef.current = 0; // Loop
            santaPathRef.current.generate(r.w, r.h); // New Path
          }
        }

        santaPuppetRef.current.update(
           mode,
           r,
           santaPathRef.current,
           santaPathProgressRef.current,
           controllerHand,
           canvasW,
           canvasH
        );

        // 3. Draw Santa
        santaPuppetRef.current.draw(ctx);

      } else if (effectModeRef.current === EffectMode.PIXEL_TEXT) {
         // --- PIXEL TEXT EFFECT ---
         ctx.save();
         ctx.beginPath();
         ctx.rect(r.x, r.y, r.w, r.h);
         ctx.clip();
         ctx.drawImage(results.image, offsetX, offsetY, drawW, drawH);
         ctx.restore();

         pixelTextManagerRef.current.draw(ctx, r);

      } else {
        // --- NORMAL EFFECT (Live Window) ---
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
        ctx.drawImage(results.image, offsetX, offsetY, drawW, drawH);
        ctx.restore();
      }

      // --- GLOBAL KISS OVERLAY (If Victory Gesture) ---
      if (isVictory) {
         ctx.save();
         ctx.beginPath();
         ctx.rect(r.x, r.y, r.w, r.h);
         ctx.clip();
         drawKissEffect(ctx, faceLandmarksRef.current, {
            offsetX,
            offsetY,
            drawW,
            drawH
         });
         ctx.restore();
      }

    } else {
      // IDLE or RESIZING - Draw Full Live Feed
      ctx.drawImage(results.image, offsetX, offsetY, drawW, drawH);

      // --- GLOBAL KISS OVERLAY (If Victory Gesture) ---
      if (isVictory) {
         drawKissEffect(ctx, faceLandmarksRef.current, {
            offsetX,
            offsetY,
            drawW,
            drawH
         });
      }
    }

    // --- UI Overlays (Boxes/Lines) ---
    
    if (stateRef.current === AppState.RESIZING && hands && hands.length === 2) {
      const r = rectRef.current;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      
      // Draw selection box
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x, r.y, r.w, r.h);

      const h1 = getScreenCoord(hands[0][8].x, hands[0][8].y);
      const h2 = getScreenCoord(hands[1][8].x, hands[1][8].y);
      
      // Dashed lines to hands
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.setLineDash([2, 4]);
      ctx.moveTo(h1.x, h1.y);
      ctx.lineTo(r.x, r.y);
      ctx.moveTo(h2.x, h2.y);
      ctx.lineTo(r.x + r.w, r.y + r.h);
      ctx.stroke();
      ctx.setLineDash([]);

      // --- Draw Coordinate Indicators ---
      const drawSmartMarker = (p: {x: number, y: number}) => {
          const isVisualRight = p.x < cx; 
          const isTop = p.y < cy;

          ctx.beginPath();
          ctx.fillStyle = 'rgba(200, 200, 200, 0.3)';
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();

          const valX = p.x.toFixed(2); // 修改：不再翻转X坐标
          const valY = p.y.toFixed(2);
          
          ctx.save();
          ctx.translate(p.x, p.y);
          
          ctx.fillStyle = 'rgba(200, 200, 200, 0.4)';
          ctx.font = '10px monospace';
          
          const gap = 8;
          
          ctx.textAlign = isVisualRight ? 'right' : 'left'; 
          ctx.textBaseline = isTop ? 'bottom' : 'top';
          ctx.fillText(`x: ${valX}`, 0, isTop ? -gap : gap);
          
          ctx.rotate(Math.PI / 2);
          ctx.textAlign = isTop ? 'left' : 'right';
          ctx.textBaseline = isVisualRight ? 'bottom' : 'top';
          ctx.fillText(`y: ${valY}`, 0, isVisualRight ? -gap : gap);

          ctx.restore();
      };

      drawSmartMarker(h1);
      drawSmartMarker(h2);
    }

    ctx.restore(); // Restore to normal coordinates

    // --- Post-Render UI & Logic ---

    // 1. Reset Gesture (Two Fists > 1.5s)
    let isResetGesture = false;
    
    if (hands) {
      if (hands.length === 2) {
        // Require both hands to be closed simultaneously for reset
        isResetGesture = isHandClosed(hands[0]) && isHandClosed(hands[1]);
      }
    }

    // Reset Logic
    let resetProgress = 0;
    if (isResetGesture) {
      if (!resetStartTimeRef.current) resetStartTimeRef.current = Date.now();
      const elapsed = Date.now() - resetStartTimeRef.current;
      resetProgress = Math.min(elapsed / 1500, 1);
      if (elapsed > 1500) {
        resetSystem();
        resetStartTimeRef.current = null;
        resetProgress = 0;
      }
    } else {
      resetStartTimeRef.current = null;
      resetProgress = 0;
    }

    // Effect Switch Logic
    let effectProgress = 0;
    if (stateRef.current === AppState.FROZEN && isVictory) {
      if (!effectSwitchStartTimeRef.current) effectSwitchStartTimeRef.current = Date.now();
      const elapsed = Date.now() - effectSwitchStartTimeRef.current;
      effectProgress = Math.min(elapsed / 2000, 1); // Changed to 2000ms (2s)
      
      if (elapsed > 2000) { 
        // Cycle: NORMAL -> SHREDDER -> PIXEL_GRID -> SANTA_WALKER -> PIXEL_TEXT -> NORMAL
        let nextMode = EffectMode.NORMAL;
        if (effectModeRef.current === EffectMode.NORMAL) {
          nextMode = EffectMode.SHREDDER;
        } else if (effectModeRef.current === EffectMode.SHREDDER) {
          nextMode = EffectMode.PIXEL_GRID;
        } else if (effectModeRef.current === EffectMode.PIXEL_GRID) {
          nextMode = EffectMode.SANTA_WALKER;
        } else if (effectModeRef.current === EffectMode.SANTA_WALKER) {
          nextMode = EffectMode.PIXEL_TEXT;
        } else if (effectModeRef.current === EffectMode.PIXEL_TEXT) {
          nextMode = EffectMode.NORMAL;
        }
        
        handleEffectSwitch(nextMode);
        
        effectSwitchStartTimeRef.current = null; 
        effectProgress = 0;
      }
    } else {
      effectSwitchStartTimeRef.current = null;
      effectProgress = 0;
    }

    // 2. Draw Reset Indicator
    const indicatorX = canvasW - 60;
    const indicatorY = canvasH - 120;
    const radius = 12;

    ctx.beginPath();
    ctx.arc(indicatorX, indicatorY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (resetProgress > 0) {
      ctx.beginPath();
      ctx.arc(indicatorX, indicatorY, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * resetProgress));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // 3. Draw Effect Toggle Indicator
    if (effectProgress > 0) {
       const tx = canvasW / 2;
       const ty = canvasH - 140;
       
       ctx.beginPath();
       ctx.arc(tx, ty, radius, 0, 2 * Math.PI);
       ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
       ctx.stroke();

       ctx.beginPath();
       ctx.arc(tx, ty, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * effectProgress));
       ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
       ctx.lineWidth = 3;
       ctx.lineCap = 'round';
       ctx.stroke();
    }

  }, [resetSystem, playShutterSound, initParticles, initSanta, initPixelText, handleEffectSwitch]);

  // --- Setup ---

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '1') resetSystem();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [resetSystem]);

  // Use a ref to hold the latest onResults callback
  const onResultsRef = useRef<((results: Results) => void) | null>(null);

  useEffect(() => {
    onResultsRef.current = onResults;
  }, [onResults]);

  useEffect(() => {
    isMountedRef.current = true;
    let camera: any = null;
    let hands: any = null;
    let faceMesh: any = null;

    const setupMediaPipe = async () => {
      if (!videoRef.current) return;
      
      const HandsClass = (window as any).Hands;
      const FaceMeshClass = (window as any).FaceMesh;
      const CameraClass = (window as any).Camera;
      
      if (!HandsClass || !CameraClass || !FaceMeshClass) {
        console.error("MediaPipe Hands, FaceMesh, or Camera not loaded");
        return;
      }

      // 先获取摄像头流，设置正确的约束
      try {
        // iPhone前置摄像头优化设置
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 960, max: 1440 }, // 4:3 比例
            aspectRatio: { ideal: 4/3 }, // 强制4:3避免拉伸
            frameRate: { ideal: 30 }
          }
        });

        // 将流赋给video元素
        videoRef.current.srcObject = stream;

        // --- Initialize Hands ---
        hands = new HandsClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        // Pass a proxy function to always call the latest onResults
        hands.onResults((results: Results) => {
          if (onResultsRef.current) {
            onResultsRef.current(results);
          }
        });

        // --- Initialize FaceMesh ---
        if (FaceMeshClass) {
            faceMesh = new FaceMeshClass({
              locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`
            });
            
            faceMesh.setOptions({
              maxNumFaces: 1,
              refineLandmarks: true,
              minDetectionConfidence: 0.5,
              minTrackingConfidence: 0.5
            });

            faceMesh.onResults((results: any) => {
               // Store latest face data
               faceLandmarksRef.current = results.multiFaceLandmarks || [];
            });
        } else {
            console.warn("FaceMesh library not found. Face effects will not work.");
        }

        // 启动相机处理
        camera = new CameraClass(videoRef.current, {
          onFrame: async () => {
            if (!isMountedRef.current) return;
            
            if (videoRef.current) {
              try {
                const handsPromise = hands ? hands.send({ image: videoRef.current }) : Promise.resolve();
                const shouldProcessFace = (faceMesh && handCountRef.current > 0);
                const faceMeshPromise = shouldProcessFace
                    ? faceMesh.send({ image: videoRef.current })
                    : Promise.resolve();

                await Promise.all([handsPromise, faceMeshPromise]);
              } catch (e) {
                 if (isMountedRef.current) {
                    console.warn("MediaPipe Frame Error:", e);
                 }
              }
            }
          },
          width: 1280,
          height: 960 // 匹配4:3比例
        });
        camera.start();

      } catch (error) {
        console.error("无法访问摄像头:", error);
        // 降级处理：使用默认设置
        camera = new CameraClass(videoRef.current, {
          onFrame: async () => {
            // ... 降级逻辑
          }
        });
        camera.start();
      }
    };

    setupMediaPipe();

    return () => {
        isMountedRef.current = false;
        
        if (camera) {
             try {
                camera.stop();
             } catch(e) { console.warn("Camera stop error", e) }
        }
        
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
        }

        if (hands) {
             try {
                 hands.close();
             } catch(e) { console.warn("Hands close error", e); }
        }
        
        if (faceMesh) {
             try {
                 faceMesh.close();
             } catch(e) { console.warn("FaceMesh close error", e); }
        }
    };
  }, []); // Empty dependency array ensures this runs once

  return (
    <div className={`relative w-screen h-screen ${isMobile ? 'bg-white' : 'bg-black'} overflow-hidden select-none flex items-center justify-center`}>
      <video ref={videoRef} className="hidden" playsInline muted />
      
      {/* Mobile Layout Wrapper */}
      <div className={`relative ${isMobile ? 'w-[95%] aspect-[9/16] overflow-hidden rounded-lg' : 'w-full h-full'}`}>
          <canvas 
            ref={canvasRef} 
            className="w-full h-full object-contain bg-black block"
            style={{
              // 可选：添加CSS缩放补偿
              transform: `scale(${zoomLevel === 1 ? 1 : 1})`,
              transformOrigin: 'center center'
            }}
          />
          
          <InfoOverlay 
            state={uiState} 
            fps={fps} 
            handCount={handCount} 
            effectMode={currentEffect} 
            onReset={resetSystem} 
            showZoom={isMobile && uiState !== AppState.FROZEN}
            zoomLevel={zoomLevel}
            onZoomChange={setZoomLevel}
          />
          
          {/* Effect Switcher - Visible in Frozen Mode */}
          {uiState === AppState.FROZEN && (
            <EffectSwitcher 
              currentMode={currentEffect} 
              onSwitch={handleEffectSwitch} 
            />
          )}

          {/* Shredder Controls */}
          {uiState === AppState.FROZEN && currentEffect === EffectMode.SHREDDER && (
            <ShredderControls count={shredCount} onChange={setShredCount} />
          )}

          {/* Pixel Text Controls */}
          {uiState === AppState.FROZEN && currentEffect === EffectMode.PIXEL_TEXT && (
            <PixelTextControls 
              text={pixelText} 
              onTextChange={setPixelText}
              scale={pixelScale}
              onScaleChange={setPixelScale}
            />
          )}
      </div>
    </div>
  );
};

export default App;