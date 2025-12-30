import { NormalizedLandmarkList } from '../types';

export interface KissConfig {
  id: string;
  anchorIndex: number;
  scale: number;
  rotation: number; // Static rotation offset for the sticker
  offsetX: number;
  offsetY: number;
  opacity: number;
}

// Scales increased by 80% from previous "tiny" version.
// Now ranges roughly from 0.07 to 0.16 relative to eye-distance.
export const KISS_MARKS: KissConfig[] = [
  // Forehead
  { id: 'forehead-left', anchorIndex: 103, scale: 0, rotation: -15, offsetX: 0, offsetY: 0, opacity: 0.6 },
  { id: 'forehead-right', anchorIndex: 332, scale: 0, rotation: 15, offsetX: 0, offsetY: 0, opacity: 0.6 },
  
  // Cheeks: Larger
  { id: 'cheek-left-upper', anchorIndex: 116, scale: 0.34, rotation: 10, offsetX: 0, offsetY: 0, opacity: 0.35 },
  { id: 'cheek-left-mid', anchorIndex: 205, scale: 0.26, rotation: -5, offsetX: 0, offsetY: 0, opacity: 0.3 },
  { id: 'cheek-left-lower', anchorIndex: 203, scale: 0.23, rotation: 0, offsetX: 0, offsetY: 0, opacity: 0.4 },
  
  { id: 'cheek-right-main', anchorIndex: 345, scale: 0.36, rotation: 5, offsetX: 0, offsetY: 0, opacity: 0.3 },
  { id: 'cheek-right-lower', anchorIndex: 425, scale: 0.23, rotation: -30, offsetX: 0, offsetY: 0, opacity: 0.4 },
  { id: 'cheek-right-outer', anchorIndex: 361, scale: 0.24, rotation: 15, offsetX: 0, offsetY: 0, opacity: 0.35 },
  
  // Nose & Chin
  { id: 'nose-bridge', anchorIndex: 6, scale: 0.29, rotation: 90, offsetX: 0, offsetY: 0, opacity: 0.5 },
  { id: 'nose-tip', anchorIndex: 1, scale: 0.27, rotation: -14, offsetX: 0, offsetY: -2, opacity: 0.3 },
  { id: 'chin', anchorIndex: 152, scale: 0.29, rotation: 10, offsetX: 0, offsetY: -4, opacity: 0.4 }
];

export const drawKissEffect = (
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmarkList[] | null | undefined,
  geometry: { offsetX: number; offsetY: number; drawW: number; drawH: number }
) => {
  if (!landmarks || landmarks.length === 0) return;
  
  const { offsetX, offsetY, drawW, drawH } = geometry;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over'; 

  for (const faceLandmarks of landmarks) {
    // 1. Calculate Face Geometry for relative scaling and rotation
    // Left Eye: 33 (outer corner), Right Eye: 263 (outer corner)
    const pLeftEye = faceLandmarks[33];
    const pRightEye = faceLandmarks[263];

    if (!pLeftEye || !pRightEye) continue;

    // Convert to screen space
    const leX = offsetX + pLeftEye.x * drawW;
    const leY = offsetY + pLeftEye.y * drawH;
    const reX = offsetX + pRightEye.x * drawW;
    const reY = offsetY + pRightEye.y * drawH;

    const dx = reX - leX;
    const dy = reY - leY;
    
    // Face Roll (Rotation)
    const faceRoll = Math.atan2(dy, dx);
    
    // Face Scale reference (Distance between eyes)
    const eyeDist = Math.hypot(dx, dy);

    KISS_MARKS.forEach((config) => {
      const anchor = faceLandmarks[config.anchorIndex];
      if (!anchor) return;

      const ax = offsetX + anchor.x * drawW;
      const ay = offsetY + anchor.y * drawH;

      ctx.save();
      
      // Move to anchor position
      ctx.translate(ax + config.offsetX, ay + config.offsetY);
      
      // Rotate: Face Roll + Sticker Rotation
      ctx.rotate(faceRoll + (config.rotation * Math.PI / 180));
      
      // Scale based on face size
      // scale determines the font size relative to the width of the face (eye distance)
      const fontSize = eyeDist * config.scale;
      
      // Ensure a minimum legible size (e.g., 4px) to prevent disappearing
      const appliedFontSize = Math.max(4, fontSize);

      ctx.font = `${appliedFontSize}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = config.opacity;
      
      // Draw Emoji
      ctx.fillText("💋", 0, 0);
      
      ctx.restore();
    });
  }
  
  ctx.restore();
};