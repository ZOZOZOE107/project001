export interface GameConfig {
  name: string;
  spawnRate: number; // Time in ms between spawns
  minSpeed: number;
  maxSpeed: number;
  targetSize: number;
  colors: string[];
  gravity: number;
  description: string;
  shape: 'circle' | 'heart' | 'fafa'; // Added fafa shape
}

export interface GameState {
  score: number;
  isPlaying: boolean;
  lives: number;
}

export interface Target {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  createdAt: number;
  text?: string; // Optional text content for the target
  // 3D Rotation properties
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  vRotX: number;
  vRotY: number;
  vRotZ: number;
  // Interaction state
  isLocked?: boolean;
  
  // Fafa (Marimekko) specific properties
  fafaPoints?: {x: number, y: number}[];
  secondaryColor?: string;
  // Organic movement parameters (Butterfly flight)
  flightFreq?: number;
  flightAmp?: number;
  flightPhase?: number;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
  type?: 'circle' | 'ring' | 'text';
  text?: string;
}

// MediaPipe Types (Simplified)
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface Results {
  multiHandLandmarks: Landmark[][];
  image: HTMLVideoElement;
}