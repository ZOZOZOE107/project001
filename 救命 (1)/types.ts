import Matter from 'matter-js';

// App Settings
export interface AppSettings {
  size: number;
  speed: number;
  bounce: number;
}

// Custom Body interface extending Matter.Body structure for our specific logic
export interface TearPluginData {
  state: 'sliding' | 'falling' | 'rewinding';
  side: 'left' | 'right';
  progress: number;
  pathOffset: number;
  currentSize: number;
  origin: { x: number, y: number };
  rewindStartTime?: number;
}

export interface TearRenderData {
  customText?: string;
  baseFontSize?: number;
  scaleMultiplier?: number;
}

// We cast Matter.Body to this when processing
export type TearBody = Matter.Body & {
  plugin: TearPluginData;
  render: Matter.IBodyRenderOptions & TearRenderData;
};

// MediaPipe Types (Partial)
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface FaceMeshResults {
  multiFaceLandmarks: Landmark[][];
  image: HTMLVideoElement;
}