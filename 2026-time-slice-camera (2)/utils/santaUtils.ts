import { Point, Rect, NormalizedLandmarkList } from '../types';

// --- Bezier Path Logic ---

export class BezierPath {
  points: Point[] = [];
  
  constructor() {
    this.points = [];
  }

  // Generates a new random path inside the given box dimensions
  generate(w: number, h: number) {
    const margin = Math.min(w, h) * 0.2;
    // P0: Start
    const p0 = { x: Math.random() * (w - 2 * margin) + margin, y: Math.random() * (h - 2 * margin) + margin };
    // P3: End
    const p3 = { x: Math.random() * (w - 2 * margin) + margin, y: Math.random() * (h - 2 * margin) + margin };
    // Control points
    const p1 = { x: Math.random() * w, y: Math.random() * h };
    const p2 = { x: Math.random() * w, y: Math.random() * h };
    
    this.points = [p0, p1, p2, p3];
  }

  getPoint(t: number): Point {
    if (this.points.length < 4) return { x: 0, y: 0 };
    
    const [p0, p1, p2, p3] = this.points;
    const invT = 1 - t;
    
    // Cubic Bezier Formula
    const x = Math.pow(invT, 3) * p0.x + 
              3 * Math.pow(invT, 2) * t * p1.x + 
              3 * invT * Math.pow(t, 2) * p2.x + 
              Math.pow(t, 3) * p3.x;
              
    const y = Math.pow(invT, 3) * p0.y + 
              3 * Math.pow(invT, 2) * t * p1.y + 
              3 * invT * Math.pow(t, 2) * p2.y + 
              Math.pow(t, 3) * p3.y;

    return { x, y };
  }
}

// --- Horse Puppet Logic ---

export interface HorseTheme {
    body: string;
    dark: string;  // Mane, Tail, Hooves
    snout: string;
    saddle: string;
    eye: string;
}

export const THEME_BROWN: HorseTheme = {
    body: '#8B4513',   // SaddleBrown
    dark: '#3E2723',   // Darker Brown
    snout: '#D2B48C',  // Tan
    saddle: '#FF6F00', // Orange
    eye: 'black'
};

export const THEME_WHITE: HorseTheme = {
    body: '#F2E8C9',   // Cream / Beige (Rice color)
    dark: '#5D4037',   // Brown contrast for hooves/mane
    snout: '#FFF8E1',  // Lighter Cream
    saddle: '#FF6F00', // Same Orange Saddle
    eye: 'black'
};

export class SantaPuppet {
  theme: HorseTheme;

  // Body Parts positions
  head: Point = { x: 0, y: 0 };
  body: Point = { x: 0, y: 0 };     // Center of body
  
  // Leg Joints (Knees/Hocks) - Controlled by fingers
  flKnee: Point = { x: 0, y: 0 }; 
  frKnee: Point = { x: 0, y: 0 }; 
  blKnee: Point = { x: 0, y: 0 }; 
  brKnee: Point = { x: 0, y: 0 }; 

  // Hooves (Feet) - Reactive / Physics based
  flHoof: Point = { x: 0, y: 0 };
  frHoof: Point = { x: 0, y: 0 };
  blHoof: Point = { x: 0, y: 0 };
  brHoof: Point = { x: 0, y: 0 };

  // Visual state for strings (Keys map to limb names)
  private stringAnchors: { [key: string]: Point } = {};

  constructor(theme: HorseTheme = THEME_BROWN) {
      this.theme = theme;
  }

  // Physics Helper
  private lerpPoint(current: Point, target: Point, speed: number): Point {
    return {
      x: current.x + (target.x - current.x) * speed,
      y: current.y + (target.y - current.y) * speed
    };
  }

  update(
    mode: 'AUTO' | 'PUPPET', 
    rect: Rect, 
    path: BezierPath, 
    progress: number, 
    handLandmarks?: NormalizedLandmarkList,
    screenW?: number,
    screenH?: number,
    mirrorAuto: boolean = false // If true, auto-pilot moves in reverse/mirror
  ) {
    const time = Date.now() / 1000;
    const floorY = rect.y + rect.h;
    
    // Horse Dimensions
    const bodyHeight = 30;
    const legUpperLength = 25; // Body to Knee
    const legLowerLength = 25; // Knee to Hoof
    
    // Base height for body logic
    const standHeight = legUpperLength + legLowerLength + bodyHeight/2; 

    if (mode === 'AUTO') {
      // --- AUTO PILOT MODE (Galloping Horse) ---
      this.stringAnchors = {}; 
      
      // Mirror logic for Auto path
      const pathPos = path.getPoint(progress);
      let targetX = rect.x + pathPos.x;
      
      if (mirrorAuto) {
          // If mirrored, flip the X position relative to center
          const centerX = rect.x + rect.w / 2;
          const dist = targetX - centerX;
          targetX = centerX - dist;
      }

      const baseY = floorY - standHeight;

      // Bounce
      const bounce = Math.abs(Math.sin(time * 12 + (mirrorAuto ? Math.PI : 0))) * 10;
      
      // Target Body Position
      const targetBody = { x: targetX, y: baseY - bounce };
      
      // Head follows body (Direction dependent)
      // In auto, we just make them run forward based on path direction approximately, 
      // OR just force them to face center or movement.
      // Let's make them face direction of movement? 
      // Simplification: Brown runs L->R, White runs R->L (Mirror)
      // Actually, path is random. Let's just offset head.
      const headOffset = mirrorAuto ? -40 : 40;
      const targetHead = { x: targetX + headOffset, y: baseY - 40 - bounce };

      // Animate Knees for Gallop
      const stride = 20;
      const speed = 12;
      const kneeLift = 15;

      // Helper to calc knee pos based on cycle
      const getKneePos = (offsetX: number, phase: number) => {
         const dir = mirrorAuto ? -1 : 1;
         return {
            x: targetX + (offsetX * dir) + Math.cos(time * speed + phase) * stride,
            y: baseY + 20 - Math.max(0, Math.sin(time * speed + phase) * kneeLift)
         };
      };

      // Gallop phase: FL+BR together, FR+BL together
      const tFL = getKneePos(25, 0);
      const tFR = getKneePos(25, Math.PI);
      const tBL = getKneePos(-25, Math.PI);
      const tBR = getKneePos(-25, 0);

      const smooth = 0.1;
      this.body = this.lerpPoint(this.body, targetBody, smooth);
      this.head = this.lerpPoint(this.head, targetHead, smooth);
      
      this.flKnee = this.lerpPoint(this.flKnee, tFL, smooth);
      this.frKnee = this.lerpPoint(this.frKnee, tFR, smooth);
      this.blKnee = this.lerpPoint(this.blKnee, tBL, smooth);
      this.brKnee = this.lerpPoint(this.brKnee, tBR, smooth);

    } else if (mode === 'PUPPET' && handLandmarks && screenW && screenH) {
      // --- PUPPET MODE (Finger -> Knee Control) ---
      
      // Mapping:
      // Thumb (4)  -> Back Left Leg
      // Index (8)  -> Front Left Leg
      // Middle (12)-> Head (Neck)
      // Ring (16)  -> Front Right Leg
      // Pinky (20) -> Back Right Leg

      const solveControlPoint = (idx: number, type: 'KNEE' | 'HEAD'): { target: Point, anchor: Point } => {
         const fx = handLandmarks[idx].x * screenW;
         const fy = handLandmarks[idx].y * screenH;
         const anchor = { x: fx, y: fy };

         // Physics Target
         let tx = Math.max(rect.x, Math.min(rect.x + rect.w, fx));
         
         // String Length logic
         const stringLen = rect.h * 0.4; 
         let ty = fy + stringLen;

         if (type === 'KNEE') {
             ty = Math.min(floorY - 10, ty);
         } else {
             ty = Math.min(floorY - standHeight + 20, ty);
         }
         ty = Math.max(rect.y, ty);

         return { target: { x: tx, y: ty }, anchor };
      };

      // 1. Calculate Targets
      const rBL = solveControlPoint(4, 'KNEE');  // Thumb
      const rFL = solveControlPoint(8, 'KNEE');  // Index
      const rHead = solveControlPoint(12, 'HEAD'); // Middle
      const rFR = solveControlPoint(16, 'KNEE'); // Ring
      const rBR = solveControlPoint(20, 'KNEE'); // Pinky

      // 2. Set Anchors for drawing strings
      this.stringAnchors = {
        bl: rBL.anchor,
        fl: rFL.anchor,
        head: rHead.anchor,
        fr: rFR.anchor,
        br: rBR.anchor
      };

      // 3. Apply Physics
      const smooth = 0.25; 
      
      this.head = this.lerpPoint(this.head, rHead.target, smooth);
      this.flKnee = this.lerpPoint(this.flKnee, rFL.target, smooth);
      this.frKnee = this.lerpPoint(this.frKnee, rFR.target, smooth);
      this.blKnee = this.lerpPoint(this.blKnee, rBL.target, smooth);
      this.brKnee = this.lerpPoint(this.brKnee, rBR.target, smooth);

      // 4. Resolve Body Position
      // Body trails the head.
      // Determine implicit facing direction from hand movement would be complex, 
      // but strictly following physics: Body trails head.
      // If Head X > Body X, Body is "Left" of head.
      
      // We want the body to "dangle" from the head position but be stabilized by legs.
      const legCenterX = (this.flKnee.x + this.blKnee.x + this.frKnee.x + this.brKnee.x) / 4;
      const legCenterY = (this.flKnee.y + this.blKnee.y) / 2 - legUpperLength;

      // Blend Head and Legs
      let targetBodyX = (this.head.x + legCenterX) / 2;
      
      // Add 'neck' offset physics: The body tries to stay behind the head movement.
      // Simple approximation: Just lerp to the midpoint. The "Facing" visual logic will handle the look.
      
      const targetBody = {
          x: targetBodyX,
          y: (this.head.y * 0.6 + legCenterY * 0.4) + 20 // Body sits below head
      };

      this.body = this.lerpPoint(this.body, targetBody, smooth);
    }

    // --- Resolve Hooves (Physics for Lower Leg) ---
    const resolveHoof = (knee: Point, currentHoof: Point): Point => {
        let targetX = knee.x;
        let targetY = knee.y + legLowerLength;
        if (targetY > floorY) targetY = floorY;
        return this.lerpPoint(currentHoof, {x: targetX, y: targetY}, 0.4);
    };

    this.flHoof = resolveHoof(this.flKnee, this.flHoof);
    this.frHoof = resolveHoof(this.frKnee, this.frHoof);
    this.blHoof = resolveHoof(this.blKnee, this.blHoof);
    this.brHoof = resolveHoof(this.brKnee, this.brHoof);
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    
    // --- Determine Facing Direction ---
    // If Head is to the Right of Body -> Face Right (1)
    // If Head is to the Left of Body -> Face Left (-1)
    // Add small threshold to prevent jitter
    let facing = 1; 
    if (this.head.x < this.body.x - 2) facing = -1;
    else if (this.head.x > this.body.x + 2) facing = 1;
    // Else keep previous direction? For now default to 1 if stacked.
    
    // Helper to draw chunky pixel-art style lines
    const drawBlockLine = (p1: Point, p2: Point, width: number, color: string) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'butt'; // Blocky ends
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    };

    const drawRectCenter = (p: Point, w: number, h: number, color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect(p.x - w/2, p.y - h/2, w, h);
    };

    const drawLeg = (origin: Point, knee: Point, hoof: Point) => {
        drawBlockLine(origin, knee, 8, this.theme.body);
        drawRectCenter(knee, 10, 10, this.theme.body); 
        drawBlockLine(knee, hoof, 6, this.theme.body); 
        drawRectCenter(hoof, 10, 8, this.theme.dark);
    };

    // --- Draw Strings (Strings are unaffected by facing, they just go to points) ---
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.setLineDash([2, 2]); 
    
    if (this.stringAnchors.head) {
        const drawStr = (anchor: Point, target: Point, isKnee: boolean = false) => {
            ctx.beginPath();
            ctx.moveTo(anchor.x, anchor.y);
            ctx.lineTo(target.x, target.y);
            ctx.stroke();
            // Dots
            ctx.beginPath(); ctx.setLineDash([]);
            ctx.arc(anchor.x, anchor.y, 2, 0, Math.PI*2); ctx.fillStyle = 'white'; ctx.fill();
            if (isKnee) {
                ctx.beginPath(); ctx.arc(target.x, target.y, 2, 0, Math.PI*2);
                ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(); ctx.setLineDash([2, 2]);
            }
        };
        drawStr(this.stringAnchors.bl, this.blKnee, true);
        drawStr(this.stringAnchors.fl, this.flKnee, true);
        drawStr(this.stringAnchors.head, {x: this.head.x, y: this.head.y - 15}, false); 
        drawStr(this.stringAnchors.fr, this.frKnee, true);
        drawStr(this.stringAnchors.br, this.brKnee, true);
    }
    ctx.setLineDash([]); 

    // --- Draw Horse Body Parts ---
    // Note: We use `facing` to offset features (Tail, Snout) relative to the center mass.
    // The skeleton (Head/Body/Legs points) already contains the structural direction.
    // We just need to ensure the "details" like snout are on the correct side of the head block.

    // 1. Back Legs
    // Attach approx where hips/shoulders would be relative to body center
    // If facing right: Hip is left (-20), Shoulder is right (+20)
    // If facing left: Hip is right (+20), Shoulder is left (-20)
    // Actually, "Back" legs are physically the ones further back in Z-order or anatomical back?
    // Let's rely on the physics mapping: Thumb/Pinky are rear legs. 
    // We anchor them to the "Rear" of the body.
    // Which side is Rear? Opposite of Head.
    
    const dist = 20;
    const rearAnchorX = this.body.x - (dist * facing);
    const frontAnchorX = this.body.x + (dist * facing);
    const anchorY = this.body.y;

    drawLeg({x: rearAnchorX, y: anchorY}, this.blKnee, this.blHoof);
    drawLeg({x: rearAnchorX, y: anchorY}, this.brKnee, this.brHoof);

    // 2. Tail
    // Tail is at the Rear.
    const tailBaseX = this.body.x - (32 * facing);
    const tailBaseY = this.body.y - 10;
    
    // Simple block tail, flipping direction
    drawRectCenter({x: tailBaseX, y: tailBaseY}, 12, 10, this.theme.dark);
    drawRectCenter({x: tailBaseX - (8 * facing), y: tailBaseY + 8}, 12, 12, this.theme.dark);
    drawRectCenter({x: tailBaseX - (12 * facing), y: tailBaseY + 18}, 10, 12, this.theme.dark);

    // 3. Body
    drawRectCenter(this.body, 60, 28, this.theme.body);

    // 4. Saddle
    drawRectCenter({x: this.body.x, y: this.body.y - 6}, 24, 12, this.theme.saddle);

    // 5. Neck
    // Connects Front-Top of body to Bottom-Back of Head
    // Body connect: Front (+25 * facing)
    // Head connect: Back (-5 * facing)
    const bodyConnectX = this.body.x + (25 * facing);
    const bodyConnectY = this.body.y - 10;
    const headConnectX = this.head.x - (5 * facing);
    const headConnectY = this.head.y + 10;
    
    ctx.beginPath();
    ctx.moveTo(bodyConnectX, bodyConnectY);
    ctx.lineTo(headConnectX, headConnectY);
    ctx.lineWidth = 18; 
    ctx.strokeStyle = this.theme.body;
    ctx.stroke();

    // Mane (Back of neck)
    const midNeckX = (bodyConnectX + headConnectX) / 2;
    const midNeckY = (bodyConnectY + headConnectY) / 2;
    // Offset mane slightly "back" (-8 * facing)
    drawRectCenter({x: midNeckX - (8 * facing), y: midNeckY - 8}, 8, 8, this.theme.dark);
    drawRectCenter({x: headConnectX - (8 * facing), y: headConnectY - 8}, 8, 8, this.theme.dark);

    // 6. Head
    drawRectCenter(this.head, 24, 20, this.theme.body);
    
    // Snout (Front) -> +12 * facing
    drawRectCenter({x: this.head.x + (12 * facing), y: this.head.y + 4}, 14, 12, this.theme.snout); 
    
    // Ear (Back-Top) -> -5 * facing
    drawRectCenter({x: this.head.x - (5 * facing), y: this.head.y - 12}, 6, 8, this.theme.body);
    
    // Eye (Center-ish) -> slightly forward? Let's keep center but maybe shift slightly
    drawRectCenter({x: this.head.x + (2 * facing), y: this.head.y - 2}, 4, 4, this.theme.eye);

    // 7. Front Legs (Draw on top)
    drawLeg({x: frontAnchorX, y: anchorY}, this.flKnee, this.flHoof);
    drawLeg({x: frontAnchorX, y: anchorY}, this.frKnee, this.frHoof);

    ctx.restore();
  }
}