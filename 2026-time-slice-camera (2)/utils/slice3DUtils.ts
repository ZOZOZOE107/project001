import { Rect, Point } from '../types';

class ImgQuad {
    // Relative position in the grid (0 to rect.w, 0 to rect.h)
    relX: number;
    relY: number;
    w: number;
    h: number;
    
    // Physics
    angle: number = 0; // Degrees
    velocity: number = 0;

    constructor(relX: number, relY: number, w: number, h: number) {
        this.relX = relX;
        this.relY = relY;
        this.w = w;
        this.h = h;
    }

    update() {
        this.angle += this.velocity;
        this.velocity *= 0.94; // Damping (friction)

        // Auto return logic similar to p5 script
        // When slow, snap back to nearest 180 or 0 for clean look
        if (Math.abs(this.velocity) < 0.5) {
             // Find nearest multiple of 180 (flat)
             const nearestBase = Math.round(this.angle / 180) * 180;
             // Soft lerp to it
             this.angle += (nearestBase - this.angle) * 0.1;
        }
    }
}

export class Slice3DManager {
    quads: ImgQuad[] = [];
    gridSize: number = 50;
    
    // To track velocity of hand for impulse
    prevHandX: number | null = null;
    prevHandY: number | null = null;

    init(rect: Rect) {
        this.quads = [];
        
        // Generate quads covering the rect dimensions
        for (let y = 0; y < rect.h; y += this.gridSize) {
            for (let x = 0; x < rect.w; x += this.gridSize) {
                const w = Math.min(this.gridSize, rect.w - x);
                const h = Math.min(this.gridSize, rect.h - y);
                this.quads.push(new ImgQuad(x, y, w, h));
            }
        }
        
        this.prevHandX = null;
        this.prevHandY = null;
    }

    update(handPos: Point | null, rect: Rect) {
        // Calculate Force based on hand movement
        let force = 0;
        
        if (handPos && this.prevHandX !== null && this.prevHandY !== null) {
            const dx = handPos.x - this.prevHandX;
            const dy = handPos.y - this.prevHandY;
            
            // Impulse based on movement magnitude
            force = dx + dy;
        }

        // Update Quads
        this.quads.forEach(q => {
             // Interaction Logic
             if (handPos) {
                 // Convert quad relative pos to screen pos
                 const qx = rect.x + q.relX + q.w/2;
                 const qy = rect.y + q.relY + q.h/2;
                 
                 const halfW = q.w / 2;
                 const halfH = q.h / 2;
                 
                 // Check if hand is inside this tile
                 if (handPos.x > qx - halfW && handPos.x < qx + halfW &&
                     handPos.y > qy - halfH && handPos.y < qy + halfH) {
                     
                     // Add force + base impulse
                     // Cap max force to prevent craziness
                     const impulse = Math.min(Math.max(force * 2 + 5, -30), 30);
                     q.velocity += impulse;
                 }
             }
             q.update();
        });

        if (handPos) {
            this.prevHandX = handPos.x;
            this.prevHandY = handPos.y;
        } else {
            this.prevHandX = null;
            this.prevHandY = null;
        }
    }

    draw(ctx: CanvasRenderingContext2D, image: CanvasImageSource, rect: Rect, offsetX: number, offsetY: number, drawW: number, drawH: number) {
        // Source Image Dimensions logic
        const imgWidth = (image as any).width || 1280;
        const imgHeight = (image as any).height || 720;

        const relX = (rect.x - offsetX) / drawW;
        const relY = (rect.y - offsetY) / drawH;
        const relW = rect.w / drawW;
        const relH = rect.h / drawH;
        
        const sourceRectX = relX * imgWidth;
        const sourceRectY = relY * imgHeight;
        
        // Scale factor from Rect pixels to Image pixels
        const scaleX = (relW * imgWidth) / rect.w;
        const scaleY = (relH * imgHeight) / rect.h;

        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.w, rect.h);
        ctx.clip();

        this.quads.forEach(q => {
            // Calculate Source Coords (where in the video frame this tile comes from)
            const sx = sourceRectX + q.relX * scaleX;
            const sy = sourceRectY + q.relY * scaleY;
            const sw = q.w * scaleX;
            const sh = q.h * scaleY;

            // Calculate Destination Coords (Screen)
            const dx = rect.x + q.relX;
            const dy = rect.y + q.relY;
            const dw = q.w;
            const dh = q.h;

            // Rotation Logic
            const angleRad = (q.angle * Math.PI) / 180;
            const cosA = Math.cos(angleRad);
            
            // The visual height is the projection of the rotated plane
            const projH = dh * Math.abs(cosA);
            
            // Center of the tile
            const centerY = dy + dh / 2;
            const drawY = centerY - projH / 2;

            // Gap for "slice" effect (p5 uses w-1)
            const gap = 1;

            // Only draw if visible (not perfectly perpendicular)
            if (projH > 0.5) {
                ctx.save();
                
                // If cosA is negative, the "back" of the card is showing.
                // For a video slice, we simulate this by flipping the image vertically
                if (cosA < 0) {
                    ctx.translate(dx + dw/2, centerY);
                    ctx.scale(1, -1);
                    ctx.translate(-(dx + dw/2), -centerY);
                }

                ctx.drawImage(
                    image, 
                    sx, sy, sw, sh,
                    dx + gap/2, drawY + gap/2, dw - gap, projH - gap
                );
                
                ctx.restore();
            }
        });

        ctx.restore();
    }
}