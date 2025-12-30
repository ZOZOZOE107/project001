export enum AppState {
  IDLE = 'IDLE',
  RESIZING = 'RESIZING',
  FROZEN = 'FROZEN'
}

export enum EffectMode {
  NORMAL = 'NORMAL',
  GRID_STRETCH = 'GRID_STRETCH',
  SLICE_3D = 'SLICE_3D',
  PIXEL_GRID = 'PIXEL_GRID',
  SHREDDER = 'SHREDDER',
  SANTA_WALKER = 'SANTA_WALKER',
  PIXEL_TEXT = 'PIXEL_TEXT'
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

// MediaPipe Types (Partial definition for what we use)
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface NormalizedLandmarkList extends Array<Landmark> {}

export interface Results {
  image: HTMLVideoElement | HTMLCanvasElement | ImageBitmap;
  multiHandLandmarks: NormalizedLandmarkList[];
  multiHandedness: any[];
}

export interface FaceResults {
  multiFaceLandmarks: NormalizedLandmarkList[];
  image: any;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}