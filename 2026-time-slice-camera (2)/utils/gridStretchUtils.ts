import { Rect, Point } from '../types';

export interface GridInteraction {
  x: number; // Normalized 0-1
  y: number; // Normalized 0-1
  radius: number; // Normalized influence radius
}

export class GridStretchManager {
  n: number = 15;
  currentWeightsX: number[] = [];
  currentWeightsY: number[] = [];
  targetWeightsX: number[] = [];
  targetWeightsY: number[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    for (let i = 0; i < this.n; i++) {
      this.currentWeightsX[i] = 1;
      this.currentWeightsY[i] = 1;
      this.targetWeightsX[i] = 1;
      this.targetWeightsY[i] = 1;
    }
  }

  update(interactions: GridInteraction[]) {
    // Reset targets to baseline
    for (let i = 0; i < this.n; i++) {
      this.targetWeightsX[i] = 1;
      this.targetWeightsY[i] = 1;
    }

    // Apply influences from all hands
    if (interactions.length > 0) {
      for (const point of interactions) {
        // SNAP LOGIC: Snap the continuous hand position to the nearest grid line index
        // Grid indices go from 0 to n-1. 
        // Normalized position 0-1 maps to index 0 to n-1.
        const gridIdxX = Math.round(point.x * (this.n - 1));
        const gridIdxY = Math.round(point.y * (this.n - 1));
        
        // Convert back to normalized space for the math (0.0, 0.07, 0.14 ... 1.0)
        const snappedX = gridIdxX / (this.n - 1);
        const snappedY = gridIdxY / (this.n - 1);

        // Calculate influence bandwidth based on pinch radius
        // Base value 4.5 is good for tight control. Lower value = wider spread.
        // We map radius (0.0 to ~0.3) to a bandwidth.
        // Larger radius = Wider spread = Lower bandwidth number.
        const spread = Math.max(0.5, 15 * (1 - Math.min(point.radius * 3, 0.9)));
        
        // Intensity Logic:
        // No stretch when pinched tight (small radius).
        // Stretch increases with diameter.
        const threshold = 0.03; // Radius below this has 0 effect
        const gain = 50.0;      // Amplification factor
        const intensity = Math.max(0, (point.radius - threshold) * gain);

        for (let i = 0; i < this.n; i++) {
          const normIdx = i / (this.n - 1);
          const distX = Math.abs(normIdx - snappedX);
          const distY = Math.abs(normIdx - snappedY);

          // Additive influence
          // Gaussian function: exp(-x^2 * bandwidth)
          const weightX = intensity * Math.exp(-Math.pow(distX * spread, 2));
          const weightY = intensity * Math.exp(-Math.pow(distY * spread, 2));

          this.targetWeightsX[i] += weightX;
          this.targetWeightsY[i] += weightY;
        }
      }
    }

    // Lerp towards targets (Smoothing)
    for (let i = 0; i < this.n; i++) {
      this.currentWeightsX[i] += (this.targetWeightsX[i] - this.currentWeightsX[i]) * 0.12;
      this.currentWeightsY[i] += (this.targetWeightsY[i] - this.currentWeightsY[i]) * 0.12;
    }
  }

  draw(
      ctx: CanvasRenderingContext2D, 
      image: CanvasImageSource, 
      rect: Rect, 
      offsetX: number, 
      offsetY: number, 
      drawW: number, 
      drawH: number
  ) {
    const imgWidth = (image as any).width || 1280;
    const imgHeight = (image as any).height || 720;

    // Calculate source rectangle in the original image coordinates (The Live Frame)
    const relX = (rect.x - offsetX) / drawW;
    const relY = (rect.y - offsetY) / drawH;
    const relW = rect.w / drawW;
    const relH = rect.h / drawH;

    const sourceRectX = relX * imgWidth;
    const sourceRectY = relY * imgHeight;
    const sourceRectW = relW * imgWidth;
    const sourceRectH = relH * imgHeight;

    const sw = sourceRectW / this.n;
    const sh = sourceRectH / this.n;

    // Calculate total weights for destination sizing
    let totalWeightX = 0;
    let totalWeightY = 0;
    for (let i = 0; i < this.n; i++) {
      totalWeightX += this.currentWeightsX[i];
      totalWeightY += this.currentWeightsY[i];
    }

    const unitW = rect.w / totalWeightX;
    const unitH = rect.h / totalWeightY;

    ctx.save();
    // Clip to rect to ensure we don't draw outside bounds due to float precision
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();

    let dx = rect.x;
    for (let i = 0; i < this.n; i++) {
      let dy = rect.y;
      const colW = this.currentWeightsX[i] * unitW;
      
      for (let j = 0; j < this.n; j++) {
        const rowH = this.currentWeightsY[j] * unitH;

        // Source coordinates
        const sx = sourceRectX + i * sw;
        const sy = sourceRectY + j * sh;

        // Draw Image Slice
        // Add slightly overlap (+1) to prevent hairline gaps
        ctx.drawImage(image, sx, sy, sw, sh, dx, dy, colW + 1, rowH + 1);

        // Draw Red Grid (Always Visible)
        // Draw bottom and right borders of the cell
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(200, 0, 0, 0.5)'; // Dark Red, semi-transparent
        
        // Only draw inner grid lines, not the outer border of the rect?
        // Let's draw full grid
        ctx.strokeRect(dx, dy, colW, rowH);
        
        // Optional: Draw intersection dots for "grid node" feel
        // ctx.fillStyle = 'rgba(139, 0, 0, 0.8)';
        // ctx.fillRect(dx - 1, dy - 1, 2, 2);

        dy += rowH;
      }
      dx += colW;
    }
    
    ctx.restore();
  }
}