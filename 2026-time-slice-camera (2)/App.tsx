import React, { useEffect, useRef, useState, useCallback } from 'react';
// Removed explicit MediaPipe imports to avoid ESM syntax errors with global scripts
import { AppState, Rect, Results, EffectMode, NormalizedLandmarkList } from './types';
import { isPointingUp, isPinching, isHandClosed, isVictoryHand } from './utils/gestureUtils';
import InfoOverlay from './components/InfoOverlay';
import ShredderControls from './components/ShredderControls';
import PixelTextControls from './components/PixelTextControls';
import { BezierPath, SantaPuppet, THEME_BROWN, THEME_WHITE } from './utils/santaUtils';
import { PixelTextManager } from './utils/pixelTextEffect';
import { GridStretchManager, GridInteraction } from './utils/gridStretchUtils';
import { Slice3DManager } from './utils/slice3DUtils';
import { drawKissEffect } from './utils/kissEffectUtils';
import { SoundEngine } from './utils/soundEngine';

// Simple pseudo-noise generator for organic motion
const pseudoNoise = (x: number) => {
  return Math.sin(x) + Math.sin(x * 1.4) * 0.5 + Math.sin(x * 2.6) * 0.25;
};

// Linear interpolation helper for smoothing
const lerp = (start: number, end: number, factor: number) => {
  return start + (end - start) * factor;
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
  
  // Sound Engine
  const soundEngineRef = useRef<SoundEngine>(new SoundEngine());
  
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

  // Santa/Horse Refs (Two Horses!)
  const santaPathRef = useRef<BezierPath>(new BezierPath());
  const horse1Ref = useRef<SantaPuppet>(new SantaPuppet(THEME_BROWN));
  const horse2Ref = useRef<SantaPuppet>(new SantaPuppet(THEME_WHITE));
  const santaPathProgressRef = useRef<number>(0);

  // Pixel Text Ref
  const pixelTextManagerRef = useRef<PixelTextManager>(new PixelTextManager());

  // Grid Stretch Ref
  const gridStretchRef = useRef<GridStretchManager>(new GridStretchManager());

  // Slice 3D Ref
  const slice3DRef = useRef<Slice3DManager>(new Slice3DManager());

  // Interaction Logic Refs
  const resetStartTimeRef = useRef<number | null>(null);
  const effectSwitchStartTimeRef = useRef<number | null>(null);
  
  // Physics tracking for sound
  const prevHandPosRef = useRef<{x: number, y: number} | null>(null);
  // Track previous grid cell for note triggering
  const prevGridIndexRef = useRef<number>(-1);

  // --- State for UI ---
  const [uiState, setUiState] = useState<AppState>(AppState.IDLE);
  const [fps, setFps] = useState<number>(0);
  const [handCount, setHandCount] = useState<number>(0);
  const [shredCount, setShredCount] = useState<number>(10);
  const [currentEffect, setCurrentEffect] = useState<EffectMode>(EffectMode.NORMAL);
  
  // State for Pixel Text Effect
  const [pixelText, setPixelText] = useState<string>("Hi, 2026");
  const [pixelScale, setPixelScale] = useState<number>(2.4);

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

  // Initialize Santa/Horses Path
  const initSanta = useCallback((r: Rect) => {
     santaPathRef.current.generate(r.w, r.h);
     santaPathProgressRef.current = 0;
     
     // Initialize puppet positions to start of path
     const start = santaPathRef.current.getPoint(0);
     
     // Horse 1
     horse1Ref.current.body = { x: r.x + start.x, y: r.y + start.y };
     horse1Ref.current.head = { x: r.x + start.x, y: r.y + start.y - 50 };

     // Horse 2 (Mirror offset for init)
     const centerX = r.x + r.w/2;
     const mirrorX = centerX - ((r.x + start.x) - centerX);
     horse2Ref.current.body = { x: mirrorX, y: r.y + start.y };
     horse2Ref.current.head = { x: mirrorX, y: r.y + start.y - 50 };
  }, []);

  // Initialize Pixel Text
  const initPixelText = useCallback((r: Rect) => {
     pixelTextManagerRef.current.init(r, pixelText, pixelScale);
  }, [pixelText, pixelScale]);

  // Handle Switcher change
  const handleEffectSwitch = useCallback((mode: EffectMode) => {
    // CLEANUP OLD EFFECTS
    if (effectModeRef.current === EffectMode.SHREDDER) {
        soundEngineRef.current.stopOceanSound();
    }

    effectModeRef.current = mode;
    setCurrentEffect(mode);
    
    // Trigger init for specific modes
    if (mode === EffectMode.SANTA_WALKER) {
        initSanta(rectRef.current);
    } else if (mode === EffectMode.PIXEL_TEXT) {
        initPixelText(rectRef.current);
    } else if (mode === EffectMode.PIXEL_GRID) {
        particlesRef.current = []; // Reset particles to re-init on next frame
    } else if (mode === EffectMode.GRID_STRETCH) {
        gridStretchRef.current.reset();
    } else if (mode === EffectMode.SLICE_3D) {
        slice3DRef.current.init(rectRef.current);
    } else if (mode === EffectMode.SHREDDER) {
        // Start Ocean sound for Shredder
        soundEngineRef.current.startOceanSound();
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
    // Resume sound engine context on user interaction
    soundEngineRef.current.resume();
    // Use the new Piano Freeze chord instead of mechanical noise
    soundEngineRef.current.playFreezeChord();
  }, []);

  const resetSystem = useCallback(() => {
    // Stop all loops
    soundEngineRef.current.stopOceanSound();

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

    // Apply Mirror Effect for Main Display
    ctx.translate(canvasW, 0);
    ctx.scale(-1, 1);

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

    // --- Sound Engine State Resume ---
    if (stateRef.current !== AppState.IDLE && hands && hands.length > 0) {
        soundEngineRef.current.resume();
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

      // Raw target values
      const tx = Math.min(p1.x, p2.x);
      const ty = Math.min(p1.y, p2.y);
      const tw = Math.abs(p1.x - p2.x);
      const th = Math.abs(p1.y - p2.y);

      // Apply smoothing to reduce jitter (0.4 is a good balance)
      const smoothFactor = 0.4;

      if (rectRef.current.w === 0 && rectRef.current.h === 0) {
          rectRef.current = { x: tx, y: ty, w: tw, h: th };
      } else {
          rectRef.current = {
            x: lerp(rectRef.current.x, tx, smoothFactor),
            y: lerp(rectRef.current.y, ty, smoothFactor),
            w: lerp(rectRef.current.w, tw, smoothFactor),
            h: lerp(rectRef.current.h, th, smoothFactor)
          };
      }

      if (isPinching(hands[0]) && isPinching(hands[1])) {
        stateRef.current = AppState.FROZEN;
        playShutterSound();
        
        // CAPTURE FROZEN FRAME
        if (frozenCanvasRef.current) {
           const fCtx = frozenCanvasRef.current.getContext('2d');
           if (fCtx) {
             fCtx.save();
             // Draw raw image without mirroring (it will be drawn on mirrored context later)
             fCtx.drawImage(results.image, offsetX, offsetY, drawW, drawH);
             fCtx.restore();
           }
        }
        
        // Init logic for effects that need start up
        if (effectModeRef.current === EffectMode.SANTA_WALKER) {
             initSanta(rectRef.current);
        } else if (effectModeRef.current === EffectMode.PIXEL_TEXT) {
             initPixelText(rectRef.current);
        } else if (effectModeRef.current === EffectMode.SLICE_3D) {
             slice3DRef.current.init(rectRef.current);
        } else if (effectModeRef.current === EffectMode.SHREDDER) {
             soundEngineRef.current.startOceanSound();
        }
      }
    }

    // --- Interaction Data Preparation ---
    let activeHands: any[] = [];
    if (stateRef.current === AppState.FROZEN && hands) {
        // Filter for Pointing Up hands (or just all hands for horses?)
        // For Horses, we want to control with open hand (fingers down essentially, but let's just use all visible hands)
        // Original logic filtered for isPointingUp. Let's keep that for Shredder/Grid, 
        // but for Horses allow any detected hand to control.
        activeHands = [...hands]; 
        // Sort by X (normalized 0-1) to distinguish Left/Right hand
        activeHands.sort((a, b) => a[8].x - b[8].x);
    }
    
    // --- Hand Velocity Calculation (For Sound) ---
    let handVelocity = 0;
    if (activeHands.length > 0) {
        const h = activeHands[0];
        const cx = h[8].x;
        const cy = h[8].y;
        if (prevHandPosRef.current) {
            const dx = cx - prevHandPosRef.current.x;
            const dy = cy - prevHandPosRef.current.y;
            handVelocity = Math.sqrt(dx*dx + dy*dy);
        }
        prevHandPosRef.current = {x: cx, y: cy};
    } else {
        prevHandPosRef.current = null;
    }

    // --- Rendering ---

    if (stateRef.current === AppState.FROZEN) {
      const r = rectRef.current;

      // 1. Draw Background (The Frozen Snapshot)
      if (frozenCanvasRef.current) {
         ctx.drawImage(frozenCanvasRef.current, 0, 0, canvasW, canvasH);
      }
      
      // 2. Handle Effects inside the Rect
      
      if (effectModeRef.current === EffectMode.GRID_STRETCH) {
        // --- GRID STRETCH EFFECT ---
        
        const interactions: GridInteraction[] = [];

        // Loop through all hands to calculate interactions
        activeHands.forEach(hand => {
             const p4 = getScreenCoord(hand[4].x, hand[4].y);
             const p8 = getScreenCoord(hand[8].x, hand[8].y);
             
             // Logic Check
             let targetX = 0;
             let targetY = 0;
             let radius = 0.05; // Default small radius

             if (isPointingUp(hand)) {
                // Pointing Up -> Control with Index (8), default radius
                const p8_norm_x = (p8.x - r.x) / r.w;
                const p8_norm_y = (p8.y - r.y) / r.h;
                
                targetX = p8_norm_x;
                targetY = p8_norm_y;
                radius = 0.12; // Standard radius for point (Increased to 0.12 for new intensity logic)
             } else {
                // Other gesture (likely pinch/open) -> Control with Center of 4 & 8
                // Radius = Distance between 4 & 8
                const centerX = (p4.x + p8.x) / 2;
                const centerY = (p4.y + p8.y) / 2;
                
                const normX = (centerX - r.x) / r.w;
                const normY = (centerY - r.y) / r.h;
                
                // Calculate distance in normalized space roughly, or screen space relative to rect
                const dx = p4.x - p8.x;
                const dy = p4.y - p8.y;
                const distPx = Math.sqrt(dx*dx + dy*dy);
                
                // Normalize radius against rect width (0 to 1 scale)
                const normRadius = distPx / r.w;

                targetX = normX;
                targetY = normY;
                radius = normRadius;
             }

             // Only add if inside rect (with some buffer)
             if (targetX >= -0.2 && targetX <= 1.2 && targetY >= -0.2 && targetY <= 1.2) {
                 interactions.push({ x: targetX, y: targetY, radius: radius });
                 
                 // SOUND TRIGGER: Handpan logic
                 // Trigger when hand moves significantly OR when touching different grid zones
                 // Divide normalized width into 8 zones (matching scale length)
                 if (targetX >= 0 && targetX <= 1) {
                     const currentGridIdx = Math.floor(targetX * 8); // 8 notes scale
                     const hasChangedZone = currentGridIdx !== prevGridIndexRef.current;
                     const hasHighVelocity = handVelocity > 0.02;

                     if (hasHighVelocity && (hasChangedZone || handVelocity > 0.08)) {
                         soundEngineRef.current.playHandpanNote(targetX, targetY, Math.min(handVelocity * 10, 1));
                         prevGridIndexRef.current = currentGridIdx;
                     }
                 }
             }
        });

        gridStretchRef.current.update(interactions);
        // showGrid is always TRUE now
        gridStretchRef.current.draw(ctx, results.image, r, offsetX, offsetY, drawW, drawH);

        // Draw Visual Points (Red Dots) at 4 and 8 AFTER drawing the effect
        activeHands.forEach(hand => {
             const p4 = getScreenCoord(hand[4].x, hand[4].y);
             const p8 = getScreenCoord(hand[8].x, hand[8].y);
             
             ctx.save();
             ctx.fillStyle = '#8B0000'; // Dark Red
             ctx.beginPath(); ctx.arc(p4.x, p4.y, 5, 0, Math.PI * 2); ctx.fill();
             ctx.beginPath(); ctx.arc(p8.x, p8.y, 5, 0, Math.PI * 2); ctx.fill();
             ctx.restore();
        });

      } else if (effectModeRef.current === EffectMode.SLICE_3D) {
        // --- SLICE 3D EFFECT ---
        // Use Index Finger Tip (8) to interact
        const interactHand = activeHands.length > 0 ? activeHands[0] : null; // Use main hand
        
        let handPos = null;
        if (interactHand) {
            // Screen Coords
            handPos = getScreenCoord(interactHand[8].x, interactHand[8].y);
            
            // SOUND TRIGGER: High velocity interaction -> Bell Chime
            if (handVelocity > 0.03) {
                 soundEngineRef.current.playDistantBell(Math.min(handVelocity * 10, 1));
            }
        }

        slice3DRef.current.update(handPos, r);
        slice3DRef.current.draw(ctx, results.image, r, offsetX, offsetY, drawW, drawH);

      } else if (effectModeRef.current === EffectMode.PIXEL_GRID) {
        // ... (Existing Pixel Grid Code) ...
        // Only use hands that are pointing up for interaction here to avoid accidental touches
        const interactHands = activeHands.filter(h => isPointingUp(h));
        
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
        if (interactHands.length > 0) {
            const h = interactHands[0];
            const coord = getScreenCoord(h[8].x, h[8].y);
            repulsor = coord;
        }

        const GRID_SIZE = 12;
        const radius = 120;
        const strength = 20;
        const spring = 0.1;
        const friction = 0.85;

        // D. Update & Draw Particles
        let particlesMoved = false;
        
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
                        particlesMoved = true;
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
        
        // SOUND TRIGGER: Particle movement -> Water Drop
        if (particlesMoved && handVelocity > 0.01) {
            soundEngineRef.current.playWaterDrop(Math.min(handVelocity * 5, 1));
        }

      } else if (effectModeRef.current === EffectMode.SHREDDER) {
        // --- SHREDDER EFFECT (STRIPES) ---
        
        // Use all available hands for control, no filter on gesture
        const interactHands = activeHands;

        const numStrips = Math.max(1, shredCountRef.current);
        const stripHeight = r.h / numStrips;
        const time = Date.now() / 800;

        // 1. Calculate Hand Influence Zones (Circles based on Pinch Distance)
        const zones = interactHands.map(hand => {
            const p4 = getScreenCoord(hand[4].x, hand[4].y);
            const p8 = getScreenCoord(hand[8].x, hand[8].y);
            
            const centerX = (p4.x + p8.x) / 2;
            const centerY = (p4.y + p8.y) / 2;
            const distance = Math.hypot(p4.x - p8.x, p4.y - p8.y);
            
            // The diameter is the distance, so radius is half
            return {
                x: centerX,
                y: centerY,
                radius: distance / 2
            };
        });
        
        let totalPull = 0;

        for (let i = 0; i < numStrips; i++) {
           const stripY = r.y + i * stripHeight;
           const stripCenterY = stripY + stripHeight / 2;
           
           // Base organic movement
           const wave = Math.sin(time + i * 0.3) * 8;
           const drift = Math.cos(time * 0.5 + i * 0.7) * 4;
           
           let userOffset = 0;
           let pullIntensity = 0;
           
           // Check if this strip intersects any hand zone
           for (const z of zones) {
               // Vertical distance from circle center to strip center
               const distY = Math.abs(stripCenterY - z.y);
               
               if (distY < z.radius) {
                   // Strip is inside the circle!
                   
                   // Calculate Pull based on Horizontal position relative to the Rect center
                   // Normalized position of the circle center relative to the frozen rect
                   // If hand is in middle of rect, 0.5. Left < 0.5, Right > 0.5
                   // We actually want pull based on screen width usually, or rect width.
                   // Let's use Rect relative width for control feeling
                   const normX = (z.x - r.x) / r.w;
                   
                   // -400 to +400 pull strength based on X
                   const basePull = (normX - 0.5) * 800; 

                   // Soften edges of the circle vertically (Hanning window style)
                   const falloff = 1 - (distY / z.radius);
                   const weight = Math.pow(falloff, 0.5); // Tune falloff curve
                   
                   // Accumulate pull from multiple hands? Or max?
                   // Accumulate allows two hands to fight or boost
                   userOffset += basePull * weight;
                   pullIntensity += Math.abs(basePull * weight);
               }
           }
           
           if (pullIntensity > 0) totalPull += pullIntensity;

           const noiseT = time * 2 + i * 0.4;
           const noiseVal = pseudoNoise(noiseT);
           
           // Fluctuation happens mostly when active, or small when passive
           const activeFluctuation = noiseVal * (5 + pullIntensity * 0.05);
           const passiveFluctuation = pseudoNoise(noiseT + 100) * 4; // Base jitter

           // If pullIntensity is high, use active fluctuation, else passive
           const verticalFluctuation = (pullIntensity > 10) ? activeFluctuation : passiveFluctuation;
           const horizontalFluctuation = pseudoNoise(noiseT + 50) * (pullIntensity * 0.1);

           const offset = wave + drift + userOffset + horizontalFluctuation;
           const drawY = stripY + verticalFluctuation;
           
           ctx.save();
           ctx.beginPath();
           ctx.rect(r.x + offset, drawY, r.w, stripHeight);
           ctx.clip();
           ctx.drawImage(results.image, offsetX + offset, offsetY, drawW, drawH);
           ctx.restore();
        }

        // SOUND TRIGGER: Significant pulling -> Wind/Rustle
        if (totalPull > 5 && handVelocity > 0.01) {
             soundEngineRef.current.playWindBurst(Math.min(totalPull / 50, 1.0));
        }

        // 2. Draw the White Circles (Visual Feedback)
        ctx.save();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        zones.forEach(z => {
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
            ctx.stroke();
        });
        ctx.restore();

      } else if (effectModeRef.current === EffectMode.SANTA_WALKER) {
        // --- HORSE PUPPET EFFECT (Two Horses) ---
        
        // 1. Draw The "Transparent" Window
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
        ctx.drawImage(results.image, offsetX, offsetY, drawW, drawH);
        ctx.restore();

        // 2. Logic Update
        
        // Control Assignment:
        // Hand 0 (Leftmost hand) -> Controls Horse 1 (Brown)
        // Hand 1 (Rightmost hand) -> Controls Horse 2 (White)
        
        const hand1 = activeHands.length > 0 ? activeHands[0] : null;
        const hand2 = activeHands.length > 1 ? activeHands[1] : null;

        // Auto Pilot Update
        if (!hand1) {
            santaPathProgressRef.current += 0.002;
            if (santaPathProgressRef.current > 1) {
                santaPathProgressRef.current = 0; // Loop
                santaPathRef.current.generate(r.w, r.h); // New Path
            }
        }

        // UPDATE HORSE 1 (Brown)
        horse1Ref.current.update(
           hand1 ? 'PUPPET' : 'AUTO',
           r,
           santaPathRef.current,
           santaPathProgressRef.current,
           hand1,
           canvasW,
           canvasH,
           false // Auto: Standard direction
        );

        // UPDATE HORSE 2 (White)
        horse2Ref.current.update(
           hand2 ? 'PUPPET' : 'AUTO',
           r,
           santaPathRef.current,
           santaPathProgressRef.current,
           hand2, // Use second hand if available
           canvasW,
           canvasH,
           true // Auto: Mirrored direction
        );

        // SOUND TRIGGER: Horse Gallop (Clop)
        // Trigger if either hand moves rapidly while in puppet mode
        if ((hand1 || hand2) && handVelocity > 0.03) {
            soundEngineRef.current.playHorseClop(Math.min(handVelocity * 5, 1));
        }

        // 3. Draw Horses
        // Draw Auto horses with some Z-sorting? Or just draw.
        horse2Ref.current.draw(ctx); // Draw White first
        horse1Ref.current.draw(ctx); // Draw Brown on top

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
    // ... (Existing UI Overlay code for resizing box) ...
    if (stateRef.current === AppState.RESIZING && hands && hands.length === 2) {
      const r = rectRef.current;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      
      // Draw selection box
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      // Change 1: Whiter line (0.9 opacity)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
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
          const isLeft = p.x < cx; 
          const isTop = p.y < cy;

          // Change 2: Larger Dot (2x size -> radius 6)
          ctx.beginPath();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
          ctx.fill();

          const valX = (canvasW - p.x).toFixed(0); 
          const valY = p.y.toFixed(0);
          
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.scale(-1, 1); 
          
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; // Whiter text
          // UPDATE: Use Pixelify Sans for Canvas drawing
          ctx.font = '500 12px "Pixelify Sans", monospace';
          
          const gap = 12;
          
          // Change 3: Text OUTSIDE and ALONG the border
          
          // X-Label (Horizontal)
          // Vertical Position: Outside (Top corner -> Above, Bottom corner -> Below)
          ctx.textBaseline = isTop ? 'bottom' : 'top';
          // Horizontal Align: Along the border (Left corner -> Run Right, Right corner -> Run Left)
          // In mirrored context: 'right' aligns text to flow Right (Visual Right). 'left' flows Left.
          ctx.textAlign = isLeft ? 'right' : 'left';
          ctx.fillText(`x: ${valX}`, 0, isTop ? -gap : gap);

          // Y-Label (Vertical)
          ctx.rotate(Math.PI / 2);
          
          // Horizontal Position (in rotated space): Outside (Left corner -> Left, Right corner -> Right)
          // In rotated space: +Y is Visual Right. -Y is Visual Left.
          ctx.textBaseline = isLeft ? 'bottom' : 'top';
          const yOffset = isLeft ? -gap : gap;
          
          // Vertical Align (Along the border):
          // Top Corner -> Line goes Down -> Flow Down ('left')
          // Bottom Corner -> Line goes Up -> Flow Up ('right')
          ctx.textAlign = isTop ? 'left' : 'right';
          
          ctx.fillText(`y: ${valY}`, 0, yOffset);

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
        // Cycle: NORMAL -> GRID_STRETCH -> SLICE_3D -> PIXEL_GRID -> SHREDDER -> SANTA_WALKER -> PIXEL_TEXT -> NORMAL
        let nextMode = EffectMode.NORMAL;
        if (effectModeRef.current === EffectMode.NORMAL) {
          nextMode = EffectMode.GRID_STRETCH; 
        } else if (effectModeRef.current === EffectMode.GRID_STRETCH) {
          nextMode = EffectMode.SLICE_3D;     // New Slice Effect
        } else if (effectModeRef.current === EffectMode.SLICE_3D) {
          nextMode = EffectMode.PIXEL_GRID;     
        } else if (effectModeRef.current === EffectMode.PIXEL_GRID) {
          nextMode = EffectMode.SHREDDER;   
        } else if (effectModeRef.current === EffectMode.SHREDDER) {
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
  // ... (Existing Setup Code) ...

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
          maxNumHands: 2, // Ensure 2 hands are detected
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
        camera = new CameraClass(videoRef.current, {
          onFrame: async () => {}
        });
        camera.start();
      }
    };

    setupMediaPipe();

    return () => {
        isMountedRef.current = false;
        if (camera) try { camera.stop(); } catch(e) {}
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
        }
        if (hands) try { hands.close(); } catch(e) {}
        if (faceMesh) try { faceMesh.close(); } catch(e) {}
    };
  }, []);

  return (
    <div className={`relative w-screen h-screen ${isMobile ? 'bg-white' : 'bg-black'} overflow-hidden select-none flex items-center justify-center`}>
      <video ref={videoRef} className="hidden" playsInline muted />
      
      {/* Mobile Layout Wrapper */}
      <div className={`relative ${isMobile ? 'w-[95%] aspect-[9/16] overflow-hidden rounded-lg' : 'w-full h-full'}`}>
          <canvas 
            ref={canvasRef} 
            className="w-full h-full object-contain bg-black block"
            style={{
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