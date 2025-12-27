import { Rect } from '../types';

// "Progress Pride 2021~" Palette from reference
const PALETTE = [
  "#e60100","#fe8e01","#ffee04","#00821b","#014bff","#770188", // Rainbow
  "#000000","#61370f","#74d8ef","#ffb1cb","#fffeff",           // Progress inclusions
  "#ffd900","#7b00aa"                                           // Intersex inclusions
];

class PixelBlock {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  color: string;
  
  constructor(targetX: number, targetY: number, startX: number, startY: number, color: string) {
    this.targetX = targetX;
    this.targetY = targetY;
    this.x = startX;
    this.y = startY;
    this.color = color;
  }

  update(progress: number) {
    // Linear Interpolation (Lerp)
    const ease = 0.01; 
    this.x += (this.targetX - this.x) * ease;
    this.y += (this.targetY - this.y) * ease;
  }
}

export class PixelTextManager {
  blocks: PixelBlock[] = [];
  startTime: number = 0;
  gridSize: number = 10;
  initialized: boolean = false;
  
  init(rect: Rect, text: string = "MERRY CHRISTMAS", scale: number = 1.0) {
    this.blocks = [];
    this.startTime = Date.now();
    this.initialized = true;

    if (rect.w <= 0 || rect.h <= 0) return;

    // 1. Create offscreen canvas
    const w = Math.floor(rect.w);
    const h = Math.floor(rect.h);
    
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    // 2. Draw Text 
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Layout logic:
    // Scale up font based on box dimensions and user scale
    const baseSize = Math.min(w / 8, h / 2.5); 
    const fontSize = Math.floor(baseSize * scale);
    
    // Use Heavy (900) weight
    ctx.font = `900 ${fontSize}px Arial, sans-serif`; 
    
    // Grid Size calculation
    // We want the pixels to be relative to the font size so text stays readable
    this.gridSize = Math.max(4, Math.floor(fontSize * 0.12));

    // Letter Spacing
    (ctx as any).letterSpacing = `${Math.floor(fontSize * 0.1)}px`;
    
    // Split text logic
    const words = text.split(' ').filter(word => word.length > 0);
    
    if (words.length === 0) {
        // No text, do nothing
    } else if (words.length === 1) {
        // Single line centered
        ctx.fillText(words[0].toUpperCase(), w / 2, h / 2);
    } else {
        // Two lines (split roughly in half if many words, or just first/rest)
        // For simplicity, let's just take the first half of words for top, rest for bottom
        const mid = Math.ceil(words.length / 2);
        const topText = words.slice(0, mid).join(' ');
        const bottomText = words.slice(mid).join(' ');
        
        ctx.fillText(topText.toUpperCase(), w / 2, h * 0.35);
        ctx.fillText(bottomText.toUpperCase(), w / 2, h * 0.65);
    }

    // 3. Scan pixels
    const imgData = ctx.getImageData(0, 0, w, h).data;
    let colorIdx = 0;

    for (let y = 0; y < h; y += this.gridSize) {
      for (let x = 0; x < w; x += this.gridSize) {
        // Sample center of grid cell
        const sampleX = Math.floor(x + this.gridSize/2);
        const sampleY = Math.floor(y + this.gridSize/2);
        
        if (sampleX >= w || sampleY >= h) continue;

        const i = (sampleY * w + sampleX) * 4;
        
        // Threshold > 128 (50% gray)
        if (imgData[i+3] > 128) {
             const startX = Math.random() * w;
             const startY = Math.random() * h;
             
             const color = PALETTE[colorIdx % PALETTE.length];
             colorIdx++;
            
             // Flip X for mirror effect
             const flippedTargetX = w - x - this.gridSize;

             this.blocks.push(new PixelBlock(flippedTargetX, y, startX, startY, color));
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, rect: Rect) {
     const elapsed = Date.now() - this.startTime;
     
     const ANIMATION_DURATION = 11000;
     const FADE_DURATION = 2000; 

     const isAnimating = elapsed < ANIMATION_DURATION;
     
     let debugAlpha = 1;
     if (!isAnimating) {
         const fadeProgress = (elapsed - ANIMATION_DURATION) / FADE_DURATION;
         debugAlpha = Math.max(0, 1 - fadeProgress);
     }

     ctx.save();
     ctx.translate(rect.x, rect.y);

     // Size of dot relative to grid.
     const size = this.gridSize * 0.85; 

     // --- 1. Draw Background Grid (Fades Out) ---
     // User request: "Grid background lattice too dense, want larger grid cells"
     // We multiply the grid step by 4 for the background drawing to make it sparser.
     const bgGridStep = this.gridSize * 4;

     if (debugAlpha > 0.01) {
         ctx.beginPath();
         ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 * debugAlpha})`; 
         ctx.lineWidth = 1;
         
         // Start from offset to center the grid roughly
         const offsetX = (rect.w % bgGridStep) / 2;
         const offsetY = (rect.h % bgGridStep) / 2;

         // Vertical lines
         for (let x = offsetX; x <= rect.w; x += bgGridStep) {
             ctx.moveTo(x, 0); 
             ctx.lineTo(x, rect.h);
         }
         // Horizontal lines
         for (let y = offsetY; y <= rect.h; y += bgGridStep) {
             ctx.moveTo(0, y); 
             ctx.lineTo(rect.w, y);
         }
         ctx.stroke();
     }

     // --- 2. Draw Connecting Lines (Sequence) (Fades Out) ---
     if (this.blocks.length > 1 && debugAlpha > 0.01) {
         ctx.beginPath();
         ctx.strokeStyle = `rgba(255, 100, 100, ${0.6 * debugAlpha})`; 
         ctx.lineWidth = 0.8;
         
         const b0 = this.blocks[0];
         ctx.moveTo(b0.x + size/2, b0.y + size/2);
         
         for (let i = 1; i < this.blocks.length; i++) {
             const b = this.blocks[i];
             ctx.lineTo(b.x + size/2, b.y + size/2);
         }
         ctx.stroke();
     }

     // --- 3. Draw Particles & Numbers ---
     this.blocks.forEach((b, i) => {
        // --- Logic ---
        if (isAnimating) {
             b.update(elapsed); 
        } else {
             b.x = b.targetX;
             b.y = b.targetY;
        }

        // --- Rendering ---
        
        // Debug Rect (Outline)
        if (isAnimating && debugAlpha > 0.01) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 * debugAlpha})`;
            ctx.lineWidth = 1;
            ctx.strokeRect(b.targetX, b.targetY, size, size);
        }

        // Main Particle
        ctx.fillStyle = b.color;
        
        if (!isAnimating) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = b.color;
        } else {
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
        }

        ctx.beginPath();
        const cx = b.x + size/2;
        const cy = b.y + size/2;
        ctx.arc(cx, cy, size/2, 0, Math.PI * 2);
        ctx.fill();

        // --- 4. Draw Index Number (Fades Out) ---
        if (debugAlpha > 0.01) {
            ctx.shadowBlur = 0; 
            ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * debugAlpha})`;
            
            // Adaptive font size
            const fontSizeNum = Math.max(3, Math.floor(size * 0.4));
            
            ctx.font = `${fontSizeNum}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(i.toString(), cx, cy);
        }
     });

     ctx.restore();
  }
}