import { NormalizedLandmarkList, Point, Landmark } from '../types';

/**
 * Checks if the index finger is pointing up while other fingers are curled.
 * Note: MediaPipe Y coordinates: 0 is top, 1 is bottom. So "Up" means lower Y value.
 */
export const isPointingUp = (landmarks: NormalizedLandmarkList): boolean => {
  if (!landmarks || landmarks.length < 21) return false;

  // Finger indices:
  // Thumb: 4, Index: 8, Middle: 12, Ring: 16, Pinky: 20
  // PIP joints (knuckles roughly): 6, 10, 14, 18

  const indexUp = landmarks[8].y < landmarks[6].y;
  const middleDown = landmarks[12].y > landmarks[10].y;
  const ringDown = landmarks[16].y > landmarks[14].y;
  const pinkyDown = landmarks[20].y > landmarks[18].y;

  return indexUp && middleDown && ringDown && pinkyDown;
};

/**
 * Checks if the hand is closed into a fist.
 * Checks if finger tips are below (greater Y) their PIP joints.
 */
export const isHandClosed = (landmarks: NormalizedLandmarkList): boolean => {
  if (!landmarks || landmarks.length < 21) return false;

  const indexClosed = landmarks[8].y > landmarks[6].y;
  const middleClosed = landmarks[12].y > landmarks[10].y;
  const ringClosed = landmarks[16].y > landmarks[14].y;
  const pinkyClosed = landmarks[20].y > landmarks[18].y;

  // We can add a thumb check, but checking 4 fingers is usually sufficient and more robust
  return indexClosed && middleClosed && ringClosed && pinkyClosed;
};

/**
 * Checks if the thumb and index finger are pinching (close together).
 */
export const isPinching = (landmarks: NormalizedLandmarkList): boolean => {
  if (!landmarks || landmarks.length < 21) return false;

  const dx = landmarks[8].x - landmarks[4].x;
  const dy = landmarks[8].y - landmarks[4].y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Threshold can be adjusted based on testing
  return dist < 0.05; 
};

/**
 * Checks for Victory/Peace sign (Index and Middle up, others down).
 */
export const isVictoryHand = (landmarks: NormalizedLandmarkList): boolean => {
  if (!landmarks || landmarks.length < 21) return false;

  // Tips must be above PIPs for Index (8) and Middle (12)
  const indexUp = landmarks[8].y < landmarks[6].y;
  const middleUp = landmarks[12].y < landmarks[10].y;
  
  // Tips must be below PIPs for Ring (16) and Pinky (20)
  const ringDown = landmarks[16].y > landmarks[14].y;
  const pinkyDown = landmarks[20].y > landmarks[18].y;

  return indexUp && middleUp && ringDown && pinkyDown;
}

/**
 * Converts normalized coordinates (0-1) to canvas pixel coordinates.
 */
export const toScreenCoords = (point: Landmark, width: number, height: number): Point => {
  return {
    x: point.x * width,
    y: point.y * height
  };
};