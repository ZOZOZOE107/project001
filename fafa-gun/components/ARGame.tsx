import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import Webcam from 'react-webcam';
import { GameConfig, Target, Particle, Results } from '../types';

interface ARGameProps {
  config: GameConfig;
  cursorSize: number;
  textSize: number; // Added prop for text size
  onScoreUpdate: (score: number) => void;
  onGameOver: () => void;
  isPlaying: boolean;
}

export interface ARGameHandle {
  launchText: (text: string, interval?: number) => void;
  launchBalls: (count: number, interval?: number) => void;
}

// Simple value noise function (1D)
const noise = (x: number, seed: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const w = f * f * (3 - 2 * f); // Cubic smoothing
    
    // Hash function based on sin
    const hash = (n: number) => {
        const val = Math.sin(n * 12.9898 + seed) * 43758.5453;
        return val - Math.floor(val);
    };
    
    return hash(i) * (1 - w) + hash(i + 1) * w;
};

const ARGame = forwardRef<ARGameHandle, ARGameProps>(({ config, cursorSize, textSize, onScoreUpdate, onGameOver, isPlaying }, ref) => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Game State Refs (Mutable for performance in animation loop)
  const targetsRef = useRef<Target[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const scoreRef = useRef(0);
  const lastSpawnTimeRef = useRef(0);
  
  // Store an array of hand positions with velocity. Added thumb coordinates.
  const handPositionsRef = useRef<{ x: number; y: number; thumbX: number; thumbY: number; vy: number; isActive: boolean }[]>([]);
  // Store previous positions to calculate velocity
  const prevHandPositionsRef = useRef<{ x: number; y: number }[]>([]);
  
  const animationFrameRef = useRef<number>(0);
  const gameActiveRef = useRef(false);
  
  // Refs for props to avoid re-triggering effects when they change
  const configRef = useRef(config);
  const cursorSizeRef = useRef(cursorSize);
  const textSizeRef = useRef(textSize);

  // Update refs when props change
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    cursorSizeRef.current = cursorSize;
  }, [cursorSize]);

  useEffect(() => {
    textSizeRef.current = textSize;
  }, [textSize]);
  
  // Audio Context Ref
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Initialize Audio Context
  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtxRef.current = new AudioContextClass();
    }
    
    return () => {
      audioCtxRef.current?.close();
    };
  }, []);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    launchText: (text: string, interval: number = 300) => {
      if (!canvasRef.current) return;
      
      const width = canvasRef.current.width;
      const height = canvasRef.current.height;
      
      // Split text into individual characters (Array.from handles unicode/emojis better)
      // Force uppercase for BPdots style
      const chars = Array.from(text.toUpperCase());

      chars.forEach((char, index) => {
        // Spawn characters one by one with a delay
        setTimeout(() => {
          if (!canvasRef.current) return;
          const currentConfig = configRef.current;
          const currentTextSize = textSizeRef.current;
          
          // Calculate physics
          const heightScale = height / 720;
          const baseSpeed = Math.random() * (currentConfig.maxSpeed - currentConfig.minSpeed) + currentConfig.minSpeed;
          // Slight speed reduction for text to make trajectory visible, similar to Fafa
          const scaledSpeed = (baseSpeed * 0.8) * Math.max(1, heightScale);

          // Use textSizeRef for the radius calculation so collision matches visual size
          const radius = currentTextSize * 0.5; 

          // Text always spawns from bottom to be readable
          const newTarget: Target = {
            id: Date.now() + Math.random(),
            x: Math.random() * (width - 100) + 50, 
            y: height + 50,
            vx: (Math.random() - 0.5) * 1.5, // Reduced horizontal noise, relying on organic flight
            vy: -scaledSpeed * 1.1, 
            radius: Math.max(radius, 20), // Minimum hit area 
            color: currentConfig.colors[index % currentConfig.colors.length], 
            createdAt: Date.now(),
            text: char, // Store single character
            // Initialize random 3D rotation and velocity
            rotationX: 0, // FIXED to 0 for Y-axis rotation only
            rotationY: Math.random() * Math.PI * 2,
            rotationZ: 0, // FIXED to 0 for Y-axis rotation only
            vRotX: 0,
            vRotY: (Math.random() - 0.5) * 0.1,
            vRotZ: 0,
            isLocked: false,
            // Add Organic movement parameters (Butterfly flight) for text
            flightFreq: 0.003 + Math.random() * 0.002,
            flightAmp: 2 + Math.random() * 3,
            flightPhase: Math.random() * Math.PI * 2,
          };
          
          targetsRef.current.push(newTarget);
        }, index * interval); // Use dynamic interval
      });
    },
    launchBalls: (count: number, interval: number = 300) => {
      if (!canvasRef.current) return;
      const width = canvasRef.current.width;
      const height = canvasRef.current.height;
      
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
           if (!canvasRef.current) return;
           spawnTarget(width, height);
        }, i * interval); // Use dynamic interval
      }
    }
  }));

  // Sync isPlaying prop with ref
  useEffect(() => {
    gameActiveRef.current = isPlaying;
    if (isPlaying) {
      scoreRef.current = 0;
      targetsRef.current = [];
      particlesRef.current = [];
      onScoreUpdate(0);
      
      // Resume audio context if suspended (browser autoplay policy)
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    }
  }, [isPlaying, onScoreUpdate]);

  // Helper Functions

  const playHitSound = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    
    // Create oscillator for "ding" sound
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    // Randomize pitch slightly for variety (Pentatonic-ish range)
    const baseFreq = 880; // A5
    const pitch = baseFreq + (Math.random() * 100 - 50); 
    
    osc.frequency.setValueAtTime(pitch, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.5, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  };

  const playMissSound = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(50, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  };

  const spawnTarget = (width: number, height: number) => {
    const currentConfig = configRef.current;
    const isFafa = currentConfig.shape === 'fafa';
    
    // Scale speed based on screen height (reference 720p)
    const heightScale = height / 720; 
    let baseSpeed = Math.random() * (currentConfig.maxSpeed - currentConfig.minSpeed) + currentConfig.minSpeed;
    
    // Fafa mode should be more graceful/slower to see the curve
    if (isFafa) {
        baseSpeed = baseSpeed * 0.6;
    }
    
    const speed = baseSpeed * Math.max(1, heightScale);

    // Omni-directional spawning logic
    // 0: Top, 1: Right, 2: Bottom, 3: Left
    const side = Math.floor(Math.random() * 4);
    const offset = currentConfig.targetSize + 50;

    let startX = 0, startY = 0;

    if (side === 0) { // Top
        startX = Math.random() * width;
        startY = -offset;
    } else if (side === 1) { // Right
        startX = width + offset;
        startY = Math.random() * height;
    } else if (side === 2) { // Bottom
        startX = Math.random() * width;
        startY = height + offset;
    } else { // Left
        startX = -offset;
        startY = Math.random() * height;
    }

    // Aim for a random point roughly in the central 60% of the screen
    // This ensures balls cross the screen instead of clipping corners
    const targetX = width * 0.2 + Math.random() * width * 0.6;
    const targetY = height * 0.2 + Math.random() * height * 0.6;

    const angle = Math.atan2(targetY - startY, targetX - startX);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    
    const primaryColor = currentConfig.colors[Math.floor(Math.random() * currentConfig.colors.length)];
    const targetId = Date.now() + Math.random();

    // Generate Fafa (Flower) points if shape is fafa
    let fafaPoints: {x: number, y: number}[] = [];
    let secondaryColor = '#000000';
    let flightFreq = 0;
    let flightAmp = 0;
    let flightPhase = 0;

    if (isFafa) {
        // EXACT IMPLEMENTATION of the p5 code logic
        // this.r = random(40, 60)*height/566; -> We use config.targetSize as base r
        const r = currentConfig.targetSize * 1.5; // Scale up slightly to match visual weight of circles
        const points = [];
        
        // Pick a secondary color different from primary
        const availableSecondary = currentConfig.colors.filter(c => c !== primaryColor);
        secondaryColor = availableSecondary.length > 0 
            ? availableSecondary[Math.floor(Math.random() * availableSecondary.length)] 
            : '#FFFFFF';

        // Seed for noise
        const seed = Math.random() * 1000;
        
        // First pass: generate radius values based on the formula
        const radiusValues: number[] = [];
        
        // "for (let a = 0; a <= 6 * PI; a += PI / 8)"
        // This loop runs 49 times (0 to 6PI inclusive with PI/8 steps)
        for (let a = 0; a <= 6 * Math.PI; a += Math.PI / 8) {
            // this.pts1.push(this.r *noise(this.r+a/3) + (abs(cos(a)) * this.r ) + abs(sin(a))*this.r/2);
            // We use our custom noise function instead of p5 noise
            const n = noise(r + a/3, seed);
            
            const val = r * n + (Math.abs(Math.cos(a)) * r) + (Math.abs(Math.sin(a)) * r / 2);
            radiusValues.push(val);
        }

        // Second pass: Map these radius values to a circle (0 to 2PI)
        // In the user's p5 code, they iterate through pts1 and use "a += TWO_PI / this.pts1.length"
        const numPoints = radiusValues.length;
        for (let i = 0; i < numPoints; i++) {
            const rad = radiusValues[i];
            const theta = (i / numPoints) * 2 * Math.PI;
            
            points.push({
                x: rad * Math.cos(theta),
                y: rad * Math.sin(theta)
            });
        }

        fafaPoints = points;
        
        // Butterfly movement params
        flightFreq = 0.003 + Math.random() * 0.002; // How fast it wiggles
        flightAmp = 2 + Math.random() * 3; // How wide the curve is
        flightPhase = Math.random() * Math.PI * 2; // Start at different points in wave
    }

    const newTarget: Target = {
      id: targetId,
      x: startX,
      y: startY,
      vx: vx,
      vy: vy,
      radius: currentConfig.targetSize,
      color: primaryColor,
      createdAt: Date.now(),
      rotationX: 0,
      rotationY: Math.random() * Math.PI * 2,
      rotationZ: 0,
      vRotX: 0,
      vRotY: (Math.random() - 0.5) * 0.1,
      vRotZ: 0,
      isLocked: false,
      fafaPoints: fafaPoints,
      secondaryColor: secondaryColor,
      flightFreq,
      flightAmp,
      flightPhase
    };
    targetsRef.current.push(newTarget);
  };

  const createExplosion = (x: number, y: number, color: string, label: string = '+100') => {
    // 1. Sparks
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 4;
      particlesRef.current.push({
        id: Math.random(),
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color: color,
        size: Math.random() * 4 + 2,
        type: 'circle'
      });
    }

    // 2. Shockwave Ring
    particlesRef.current.push({
      id: Math.random(),
      x,
      y,
      vx: 0,
      vy: 0,
      life: 1.0,
      color: 'white',
      size: 10, // Starts small, expands as radius
      type: 'ring'
    });

    // 3. Score Popup
    particlesRef.current.push({
      id: Math.random(),
      x,
      y: y - 20,
      vx: 0,
      vy: -2, // Float up
      life: 1.0,
      color: 'white',
      size: 13, // Reduced by ~60% from 32
      type: 'text',
      text: label
    });
  };

  const createMissEffect = (x: number, y: number) => {
    // 1. Gray/Red Dust
    for (let i = 0; i < 8; i++) {
      particlesRef.current.push({
        id: Math.random(),
        x,
        y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 1) * 8, // Upwards splash
        life: 1.0,
        color: '#EF4444', // Red
        size: Math.random() * 3 + 1,
        type: 'circle'
      });
    }

    // 2. Miss Text
    particlesRef.current.push({
      id: Math.random(),
      x,
      y: y - 30,
      vx: 0,
      vy: -1,
      life: 1.0,
      color: '#EF4444', 
      size: 24,
      type: 'text',
      text: 'MISS'
    });
  };

  const drawHandCursor = (ctx: CanvasRenderingContext2D, pos: { x: number, y: number, thumbX: number, thumbY: number }, isAiming: boolean) => {
    // Use gray for aiming instead of red
    const baseColor = isAiming ? '#9CA3AF' : 'rgba(255, 255, 255, 0.9)';
    const size = cursorSizeRef.current;

    ctx.save();
    
    // 1. Center Dot (Always present, small and precise) at Index Finger Tip
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
    ctx.fill();

    // 2. Main Ring Style
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 2; 
    // Light shadow for contrast
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';

    if (isAiming) {
        // --- LOCKED / AIMING STATE ---
        // Solid Ring
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
        ctx.stroke();

        // 4 "Lock-on" Brackets surrounding the ring
        const bracketSize = size + 8;
        const bracketLen = 6;
        ctx.lineWidth = 3; 
        
        // Corners
        const corners = [
            [-1, -1], [1, -1], [1, 1], [-1, 1] // TL, TR, BR, BL
        ];
        
        corners.forEach(([mx, my]) => {
             ctx.beginPath();
             // Vertical part of bracket
             ctx.moveTo(pos.x + mx * bracketSize, pos.y + my * (bracketSize - bracketLen));
             // Corner
             ctx.lineTo(pos.x + mx * bracketSize, pos.y + my * bracketSize);
             // Horizontal part of bracket
             ctx.lineTo(pos.x + mx * (bracketSize - bracketLen), pos.y + my * bracketSize);
             ctx.stroke();
        });

    } else {
        // --- IDLE STATE ---
        // Clean thin ring
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
        ctx.stroke();
        
        // Subtle tick marks at Cardinal directions (N, E, S, W) to look like a scope
        const tickLen = 5;
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Top
        ctx.moveTo(pos.x, pos.y - size - tickLen);
        ctx.lineTo(pos.x, pos.y - size + 2);
        // Bottom
        ctx.moveTo(pos.x, pos.y + size - 2);
        ctx.lineTo(pos.x, pos.y + size + tickLen);
        // Left
        ctx.moveTo(pos.x - size - tickLen, pos.y);
        ctx.lineTo(pos.x - size + 2, pos.y);
        // Right
        ctx.moveTo(pos.x + size - 2, pos.y);
        ctx.lineTo(pos.x + size + tickLen, pos.y);
        ctx.stroke();
    }
    
    // 3. Draw Coordinates near Thumb Tip
    ctx.font = "bold 10px 'Courier New', monospace";
    ctx.fillStyle = baseColor;
    ctx.textAlign = "left";
    // Slight offset to not cover the finger
    const offsetX = 15;
    ctx.fillText(`X:${Math.round(pos.x)}`, pos.thumbX + offsetX, pos.thumbY - 6);
    ctx.fillText(`Y:${Math.round(pos.y)}`, pos.thumbX + offsetX, pos.thumbY + 6);

    ctx.restore();
  };

  const updateGameEngine = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const now = Date.now();
    const currentConfig = configRef.current;
    const currentCursorSize = cursorSizeRef.current;

    // Spawning (Only spawn regular balls automatically)
    if (now - lastSpawnTimeRef.current > currentConfig.spawnRate) {
      spawnTarget(width, height);
      lastSpawnTimeRef.current = now;
    }

    // Update & Draw Targets
    targetsRef.current.forEach((target, index) => {
      // 1. Interaction & Physics Logic
      
      const handCursorRadius = currentCursorSize; 
      // Increased hit tolerance significantly (10 -> 50) to make hitting easier
      const hitTolerance = 50; 
      const collisionDistance = target.radius + handCursorRadius + hitTolerance;
      
      let isColliding = false;
      let interactingHandVelocityY = 0;

      // Check collision with ALL Hands
      for (const hand of handPositionsRef.current) {
        if (!hand.isActive) continue; // Only active hands (Gun gesture) can interact

        const dx = hand.x - target.x;
        const dy = hand.y - target.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < collisionDistance) {
          isColliding = true;
          interactingHandVelocityY = hand.vy;
          // If we found a hand interacting, we prioritize it
          break; 
        }
      }

      if (isColliding) {
        // --- INTERACTION: LOCKED/PAUSED ---
        target.isLocked = true;
        
        // ** MECHANIC **: If hand moves UP quickly while touching, DESTROY.
        // Screen Y increases downwards. Moving UP means negative velocity.
        // Threshold: -15 pixels per frame (approx) seems good for a "flick".
        // Relaxed to -8 to make it easier to trigger a hit without snapping wrist
        const FLICK_THRESHOLD = -8;

        if (interactingHandVelocityY < FLICK_THRESHOLD) {
           // HIT!
           scoreRef.current += 100;
           onScoreUpdate(scoreRef.current);
           playHitSound();

           // Trigger Haptic Feedback
           if (navigator.vibrate) {
             navigator.vibrate(50);
           }
           
           // CHANGE: Custom text for Fafa mode (+FAFA) vs Regular (+100)
           const popupText = currentConfig.shape === 'fafa' ? '+FAFA' : '+100';
           createExplosion(target.x, target.y, target.color, popupText);
           
           targetsRef.current.splice(index, 1);
           return; // Stop processing this target
        }
        
        // If simply touching/holding (no flick), target stays paused.
        // We skip positional updates (vx, vy) effectively freezing it in space.
        
      } else {
        // --- NO INTERACTION: NORMAL PHYSICS ---
        target.isLocked = false;
        
        // Enable organic flight if it is Fafa mode OR if it is a text target (user request)
        const useOrganicFlight = currentConfig.shape === 'fafa' || (target.text !== undefined);
        
        if (useOrganicFlight) {
            // --- ORGANIC BUTTERFLY FLIGHT ---
            // Combine linear velocity with sine wave perpendicular motion
            const freq = target.flightFreq || 0.003;
            const amp = target.flightAmp || 2;
            const phase = target.flightPhase || 0;

            const sway = Math.sin(now * freq + phase) * amp;
            
            // Add sway to movement
            target.x += target.vx + sway; 
            target.y += target.vy + (Math.cos(now * freq) * 0.5); // Slight bobbing

            // Rotate slightly into the turn (Bank)
            target.rotationY = sway * 0.1;

        } else {
            // --- STANDARD PHYSICS ---
            target.x += target.vx;
            target.y += target.vy;
            target.vy += currentConfig.gravity; // Gravity
            
            // Angular Physics (Rotation always active for "alive" feel)
            target.rotationX += target.vRotX;
            target.rotationY += target.vRotY;
            target.rotationZ += target.vRotZ;

            // Continuous rotation for circles (flipping effect)
            if (currentConfig.shape === 'circle') {
                target.rotationY += 0.05;
            }
        }
      }


      // 2. Boundary Checks
      const margin = 150; // Allow target to go further off screen before cleanup
      if (
        target.y > height + margin || 
        target.y < -margin || 
        target.x > width + margin || 
        target.x < -margin
      ) {
         // Missed / Out of bounds
         if (currentConfig.gravity > 0 && target.vy > 0 && target.y > height) {
            playMissSound();
            createMissEffect(target.x, height - 20);
         }
         targetsRef.current.splice(index, 1);
      } else {
        // ------------------
        // RENDER TARGET
        // ------------------
        
        // 1. Setup 3D Transformation context
        ctx.save();
        ctx.translate(target.x, target.y);
        
        // 2. Apply 3D Rotation Simulation
        // For Y-axis only rotation, we simulate it by scaling the X axis.
        ctx.rotate(target.rotationZ); // This should be 0 now
        
        // Fafa mode should be flat, no 3D rotation scaling
        if (currentConfig.shape !== 'fafa') {
            ctx.scale(Math.cos(target.rotationY), Math.cos(target.rotationX)); // rotationX should be 0
        } else {
            // Apply slight 2D rotation for fafa instead of 3D flip
            // The banking calculated in physics is applied here
            ctx.rotate(target.rotationY);
        }

        if (target.text) {
          // --- TEXT MODE ---
          ctx.scale(-1, 1); // Correction for mirror

          const fontSize = target.radius * 2; 
          // Updated Font: BPdots simulation using Codystar (Bold)
          ctx.font = `900 ${fontSize}px "Codystar", "BPdots", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          ctx.fillStyle = target.color;
          
          // CHANGE: Double Bold Simulation using Stroke
          ctx.lineWidth = fontSize * 0.08; // Thick stroke
          ctx.strokeStyle = target.color;
          ctx.strokeText(target.text, 0, 0); // Stroke first to thicken
          ctx.fillText(target.text, 0, 0);   // Fill on top

        } else {
          // --- BALL/HEART/FAFA MODE ---
          let drawRadius = target.radius;
          let drawColor = target.color;

          // Check if target is in "danger zone" (Falling/Gravity only)
          const isFalling = target.vy > 0;
          const dangerZone = 200;

          if (currentConfig.gravity > 0 && isFalling && (height - target.y) < dangerZone && !target.isLocked) {
               const flash = Math.floor(Date.now() / 100) % 2 === 0;
               if (flash) {
                   drawColor = '#EF4444'; 
               }
               const scale = 0.5 + 0.5 * Math.max(0, (height - target.y) / dangerZone);
               drawRadius = target.radius * scale;
          }

          ctx.fillStyle = drawColor;
          ctx.beginPath();
          
          if (currentConfig.shape === 'fafa' && target.fafaPoints) {
            // --- FAFA (Flower) MODE ---
            // 1. Draw Petals (Organic shape)
            ctx.beginPath();
            const pts = target.fafaPoints;
            if (pts.length > 0) {
                // To make it smooth like the curve() function in p5, use quadratic curves to midpoints
                // This approximates the curveVertex behavior for closed loops
                const firstMidX = (pts[0].x + pts[pts.length-1].x)/2;
                const firstMidY = (pts[0].y + pts[pts.length-1].y)/2;
                
                ctx.moveTo(firstMidX, firstMidY);
                
                for (let i = 0; i < pts.length; i++) {
                   const p1 = pts[i];
                   const p2 = pts[(i + 1) % pts.length];
                   const midX = (p1.x + p2.x) / 2;
                   const midY = (p1.y + p2.y) / 2;
                   ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
                }
            }
            ctx.fill();

            // 2. Draw Middle Ellipse (Secondary Color)
            ctx.beginPath();
            ctx.fillStyle = target.secondaryColor || '#FFFFFF';
            
            // ADJUSTED: Smaller center ratio (0.6 instead of 1.5) to match Unikko style
            // The drawRadius is approximately the visual bounds of the flower
            const innerR = drawRadius * 0.6; 
            ctx.ellipse(0, 0, innerR, innerR * 0.85, 0, 0, Math.PI * 2);
            ctx.fill();

            // 3. Draw Core Dot (Black)
            ctx.beginPath();
            ctx.fillStyle = '#040404';
            // ADJUSTED: Smaller core dot relative to inner ellipse
            ctx.ellipse(0, 0, innerR * 0.4, innerR * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();

          } else if (currentConfig.shape === 'heart') {
             // Draw Heart Shape
             // Adjust heart size to roughly match circle radius
             const topCurveHeight = drawRadius * 0.5;
             // Start at bottom tip
             ctx.moveTo(0, drawRadius * 0.6); 
             // Left curve
             ctx.bezierCurveTo(0, -drawRadius * 0.4, -drawRadius * 1.5, -drawRadius * 0.4, -drawRadius * 1.5, drawRadius * 0.6 - drawRadius);
             ctx.bezierCurveTo(-drawRadius * 1.5, drawRadius - drawRadius, 0, drawRadius * 1.6 - drawRadius, 0, drawRadius + drawRadius * 0.6 - drawRadius);
             
             // Simplified heart path relative to (0,0)
             ctx.beginPath();
             const hSize = drawRadius * 1.2;
             ctx.moveTo(0, hSize * 0.5);
             ctx.bezierCurveTo(0, -hSize * 0.3, -hSize * 1.5, -hSize * 0.3, -hSize * 1.5, hSize * 0.5);
             ctx.bezierCurveTo(-hSize * 1.5, hSize * 1.2, 0, hSize * 1.8, 0, hSize * 2.2);
             ctx.bezierCurveTo(0, hSize * 1.8, hSize * 1.5, hSize * 1.2, hSize * 1.5, hSize * 0.5);
             ctx.bezierCurveTo(hSize * 1.5, -hSize * 0.3, 0, -hSize * 0.3, 0, hSize * 0.5);
             
             // Shift it up slightly to center it
             ctx.translate(0, -hSize);
             ctx.fill();
          } else {
             // Draw Circle Shape
             ctx.arc(0, 0, drawRadius, 0, 2 * Math.PI);
             ctx.fill();
          }
          
          
          
          // Shine/Refection (Only for circle for now, or adapted for heart)
          if (currentConfig.shape === 'circle') {
            ctx.beginPath();
            ctx.arc(-drawRadius * 0.3, -drawRadius * 0.3, drawRadius * 0.2, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fill();
          }
        }
        
        ctx.restore();
      }
    });

    // Update & Draw Particles
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.life -= 0.02;

      if (p.life <= 0) {
        particlesRef.current.splice(i, 1);
        continue;
      }

      p.x += p.vx;
      p.y += p.vy;

      ctx.save();
      ctx.globalAlpha = p.life;

      if (p.type === 'text' && p.text) {
        ctx.save();
        ctx.scale(-1, 1); 
        // Updated Font here as well for particles
        ctx.font = `900 ${p.size}px "Codystar", "BPdots", sans-serif`;
        ctx.fillStyle = p.color;
        
        // CHANGE: Double Bold Simulation for Particles too
        ctx.lineWidth = p.size * 0.08;
        ctx.strokeStyle = p.color;
        ctx.strokeText(p.text, -p.x, p.y);
        
        ctx.textAlign = 'center';
        ctx.fillText(p.text, -p.x, p.y);
        ctx.restore();
      } 
      else if (p.type === 'ring') {
        p.size += 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4 * p.life;
        ctx.stroke();
      } 
      else {
        p.vy += 0.2; 
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  };

  const onResults = useCallback((results: Results) => {
    // Robust checks to prevent crashes if video isn't ready
    if (!canvasRef.current || !webcamRef.current || !webcamRef.current.video) return;
    if (webcamRef.current.video.videoWidth === 0 || webcamRef.current.video.videoHeight === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas sizing matches video
    const videoWidth = webcamRef.current.video.videoWidth;
    const videoHeight = webcamRef.current.video.videoHeight;
    
    if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
        canvas.width = videoWidth;
        canvas.height = videoHeight;
    }

    // Clear and Flip context for mirror effect
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    // 1. Update Hand Positions (Multiple Hands) & Calculate Velocity
    const newHandPositions: { x: number; y: number; thumbX: number; thumbY: number; vy: number; isActive: boolean }[] = [];
    
    if (results.multiHandLandmarks) {
      results.multiHandLandmarks.forEach((landmarks, index) => {
        const indexTip = landmarks[8];
        const thumbTip = landmarks[4];
        
        const currentX = indexTip.x * canvas.width;
        const currentY = indexTip.y * canvas.height;
        const thumbX = thumbTip.x * canvas.width;
        const thumbY = thumbTip.y * canvas.height;
        
        // Check gesture: Thumb Tip higher (smaller y) than Index Tip
        // In screen coordinates, y=0 is top.
        const isActive = thumbTip.y < indexTip.y;
        
        // Calculate velocity based on previous position of same hand index
        let vy = 0;
        const prev = prevHandPositionsRef.current[index];
        if (prev) {
          vy = currentY - prev.y;
        }

        newHandPositions.push({
            x: currentX,
            y: currentY,
            thumbX: thumbX,
            thumbY: thumbY,
            vy: vy,
            isActive // Only active if thumb is higher than index (Gun gesture)
        });
      });
    }
    
    // Update refs for next frame
    handPositionsRef.current = newHandPositions;
    prevHandPositionsRef.current = newHandPositions.map(p => ({ x: p.x, y: p.y }));

    // Draw Cursors
    const currentCursorSize = cursorSizeRef.current;
    newHandPositions.forEach(pos => {
      // Only draw cursor if hand is active (Gun gesture)
      if (!pos.isActive) return;

      // Check for aiming (hovering)
      const handCursorRadius = currentCursorSize;
      const hitTolerance = 10; 
      
      const isAiming = targetsRef.current.some(target => {
        const dx = pos.x - target.x;
        const dy = pos.y - target.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < (target.radius + handCursorRadius + hitTolerance);
      });

      drawHandCursor(ctx, pos, isAiming);
    });

    // 2. Game Logic
    if (gameActiveRef.current) {
      updateGameEngine(ctx, canvas.width, canvas.height);
    }

    ctx.restore();
  }, []); 

  // Initialize MediaPipe Hands
  useEffect(() => {
    const Hands = (window as any).Hands;
    if (!Hands) return;

    const hands = new Hands({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      },
    });

    hands.setOptions({
      maxNumHands: 2, 
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    hands.onResults(onResults);

    const sendFrame = async () => {
      if (
        webcamRef.current &&
        webcamRef.current.video &&
        webcamRef.current.video.readyState === 4
      ) {
        try {
           await hands.send({ image: webcamRef.current.video });
        } catch (e) {}
      }
      animationFrameRef.current = requestAnimationFrame(sendFrame);
    };

    sendFrame();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      try {
        hands.close();
      } catch (e) {
        console.error("Error closing Hands:", e);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onResults]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black">
      <Webcam
        ref={webcamRef}
        className="absolute w-full h-full object-cover"
        mirrored={true}
        audio={false}
      />
      <canvas
        ref={canvasRef}
        className="absolute w-full h-full object-cover z-10"
      />
      {!webcamRef.current?.video?.readyState && (
         <div className="absolute z-20 text-white flex flex-col items-center animate-pulse">
           <i className="fas fa-camera text-4xl mb-4"></i>
           <p>Initializing Camera & Vision...</p>
         </div>
      )}
    </div>
  );
});

export default ARGame;