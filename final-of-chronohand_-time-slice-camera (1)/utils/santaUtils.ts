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

// --- Santa Puppet Logic ---

export class SantaPuppet {
  // Current Physics State
  head: Point = { x: 0, y: 0 };
  body: Point = { x: 0, y: 0 };
  leftHand: Point = { x: 0, y: 0 };
  rightHand: Point = { x: 0, y: 0 };
  leftFoot: Point = { x: 0, y: 0 };
  rightFoot: Point = { x: 0, y: 0 };

  // Visual state for strings
  private stringAnchors: { [key: string]: Point } = {};

  // Helper for smooth movement
  private moveTowards(current: number, target: number, speed: number): number {
    return current + (target - current) * speed;
  }

  private lerpPoint(current: Point, target: Point, speed: number): Point {
    return {
      x: this.moveTowards(current.x, target.x, speed),
      y: this.moveTowards(current.y, target.y, speed)
    };
  }

  update(
    mode: 'AUTO' | 'PUPPET', 
    rect: Rect, 
    path: BezierPath, 
    progress: number, // 0-1 for path
    handLandmarks?: NormalizedLandmarkList,
    screenW?: number,
    screenH?: number
  ) {
    const time = Date.now() / 1000;

    if (mode === 'AUTO') {
      // --- AUTO PILOT MODE ---
      this.stringAnchors = {}; // Clear strings
      
      // 1. Get Base Position from Path
      const pathPos = path.getPoint(progress);
      // Map to screen coords (offset by rect.x/y)
      const targetX = rect.x + pathPos.x;
      
      // Fix Y to the bottom of the rect (Walking on floor)
      // Pivot point is roughly 50px above floor so feet touch floor during walk cycle
      const floorY = rect.y + rect.h;
      const targetY = floorY - 50; 

      // 2. Animate Walk Cycle
      const bounce = Math.abs(Math.sin(time * 10)) * 10;
      const sway = Math.sin(time * 5) * 5;

      const targetBody = { x: targetX, y: targetY - 40 - bounce };
      const targetHead = { x: targetX + sway, y: targetY - 90 - bounce };

      // Limbs swing
      const legRange = 30;
      const armRange = 25;
      
      const lfX = targetX + Math.sin(time * 10) * legRange;
      const lfY = targetY + 40 + Math.cos(time * 10) * 10;
      
      const rfX = targetX + Math.sin(time * 10 + Math.PI) * legRange;
      const rfY = targetY + 40 + Math.cos(time * 10 + Math.PI) * 10;

      const lhX = targetX - 30 + Math.sin(time * 10 + Math.PI) * armRange;
      const lhY = targetY - 40;
      
      const rhX = targetX + 30 + Math.sin(time * 10) * armRange;
      const rhY = targetY - 40;

      // 3. Apply Smooth Physics
      const smooth = 0.2;
      this.body = this.lerpPoint(this.body, targetBody, smooth);
      this.head = this.lerpPoint(this.head, targetHead, smooth);
      this.leftFoot = this.lerpPoint(this.leftFoot, {x: lfX, y: lfY}, smooth);
      this.rightFoot = this.lerpPoint(this.rightFoot, {x: rfX, y: rfY}, smooth);
      this.leftHand = this.lerpPoint(this.leftHand, {x: lhX, y: lhY}, smooth);
      this.rightHand = this.lerpPoint(this.rightHand, {x: rhX, y: rhY}, smooth);

    } else if (mode === 'PUPPET' && handLandmarks && screenW && screenH) {
      // --- PUPPET MODE ---
      
      // MARIONETTE PHYSICS:
      // Vertical strings dropping from fingers.
      // 1. Calculate floor position (bottom of rect)
      const floorY = rect.y + rect.h;
      
      // 2. Define "String Drop Length". 
      // This is how far down the puppet *wants* to hang relative to the fingers.
      // A value of rect.h * 0.8 ensures that even if the hand is high up in the box, 
      // the puppet can reach the floor.
      const stringDrop = rect.h * 0.8; 

      // MAPPING:
      // Thumb (4)  -> Left Foot
      // Index (8)  -> Left Hand
      // Middle (12)-> Head
      // Ring (16)  -> Right Hand
      // Pinky (20) -> Right Foot

      // Helper: Calculates where the limb should be based on the finger
      const solveLimbPos = (idx: number, yOffsetConstraint: number = 0): { target: Point, anchor: Point } => {
         const fx = handLandmarks[idx].x * screenW;
         const fy = handLandmarks[idx].y * screenH;
         
         // Visual Anchor (The Finger)
         const anchor = { x: fx, y: fy };

         // Physics Target
         // X: Matches finger X (Vertical string), but clamped to box
         let tx = Math.max(rect.x, Math.min(rect.x + rect.w, fx));
         
         // Y: Finger Y + Drop, but clamped to floor
         // yOffsetConstraint is used for Head/Hands to keep them above floor if needed
         let ty = fy + stringDrop;
         
         const maxY = floorY - yOffsetConstraint;
         const minY = rect.y; // Ceiling
         
         ty = Math.max(minY, Math.min(maxY, ty));

         return { target: { x: tx, y: ty }, anchor };
      };

      // 1. Calculate Targets
      const rLeftFoot = solveLimbPos(4, 0);   // Thumb -> Left Foot (Can touch floor)
      const rLeftHand = solveLimbPos(8, 0);   // Index -> Left Hand (Can touch floor/drag)
      const rHead     = solveLimbPos(12, 50); // Middle -> Head (Keeps 50px above floor)
      const rRightHand= solveLimbPos(16, 0);  // Ring -> Right Hand
      const rRightFoot= solveLimbPos(20, 0);  // Pinky -> Right Foot

      // 2. Update Visual Strings
      this.stringAnchors = {
        leftFoot: rLeftFoot.anchor,
        leftHand: rLeftHand.anchor,
        head: rHead.anchor,
        rightHand: rRightHand.anchor,
        rightFoot: rRightFoot.anchor
      };

      // 3. Apply Physics (Lerp for weight)
      const smooth = 0.2; // Increase smoothness for heavy marionette feel

      this.leftFoot = this.lerpPoint(this.leftFoot, rLeftFoot.target, smooth);
      this.leftHand = this.lerpPoint(this.leftHand, rLeftHand.target, smooth);
      this.head = this.lerpPoint(this.head, rHead.target, smooth);
      this.rightHand = this.lerpPoint(this.rightHand, rRightHand.target, smooth);
      this.rightFoot = this.lerpPoint(this.rightFoot, rRightFoot.target, smooth);

      // Body follows Head
      this.body = this.lerpPoint(this.body, { x: this.head.x, y: this.head.y + 40 }, 0.2);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Helpers
    const drawLimb = (start: Point, end: Point, color: string, width: number) => {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    const drawDot = (p: Point, r: number, color: string) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    };

    // --- Draw Strings ---
    const drawString = (from: Point, to: Point) => {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; // Slightly brighter strings
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw anchor dot at finger
        ctx.beginPath();
        ctx.arc(from.x, from.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
    };

    if (Object.keys(this.stringAnchors).length > 0) {
        if (this.stringAnchors.head) drawString(this.stringAnchors.head, this.head);
        if (this.stringAnchors.leftHand) drawString(this.stringAnchors.leftHand, this.leftHand);
        if (this.stringAnchors.rightHand) drawString(this.stringAnchors.rightHand, this.rightHand);
        if (this.stringAnchors.leftFoot) drawString(this.stringAnchors.leftFoot, this.leftFoot);
        if (this.stringAnchors.rightFoot) drawString(this.stringAnchors.rightFoot, this.rightFoot);
    } else {
        // Auto mode faint strings going up
        ctx.globalAlpha = 0.1;
        drawLimb(this.head, {x: this.head.x, y: 0}, 'white', 1);
        ctx.globalAlpha = 1.0;
    }

    // --- Draw Body ---
    // Torso (Red)
    drawLimb(this.head, {x: this.body.x, y: this.body.y + 10}, '#D42426', 40);

    // Arms (Red sleeves, White gloves)
    drawLimb({x: this.head.x - 10, y: this.head.y + 20}, this.leftHand, '#D42426', 12);
    drawDot(this.leftHand, 8, 'white'); // Glove

    drawLimb({x: this.head.x + 10, y: this.head.y + 20}, this.rightHand, '#D42426', 12);
    drawDot(this.rightHand, 8, 'white'); // Glove

    // Legs (Red pants, Black boots)
    drawLimb({x: this.body.x - 10, y: this.body.y + 10}, this.leftFoot, '#D42426', 14);
    drawDot(this.leftFoot, 8, 'black'); // Boot

    drawLimb({x: this.body.x + 10, y: this.body.y + 10}, this.rightFoot, '#D42426', 14);
    drawDot(this.rightFoot, 8, 'black'); // Boot

    // Head (Beige face, White Beard, Red Hat)
    drawDot(this.head, 18, '#FFCCAA'); // Face
    
    // Beard
    ctx.beginPath();
    ctx.arc(this.head.x, this.head.y + 5, 18, 0, Math.PI);
    ctx.fillStyle = 'white';
    ctx.fill();

    // Hat
    ctx.beginPath();
    ctx.moveTo(this.head.x - 18, this.head.y - 5);
    ctx.quadraticCurveTo(this.head.x, this.head.y - 35, this.head.x + 18, this.head.y - 5);
    ctx.fillStyle = '#D42426';
    ctx.fill();
    drawDot({x: this.head.x + 18, y: this.head.y}, 6, 'white'); // Pom pom

    // Belt
    ctx.beginPath();
    ctx.rect(this.body.x - 20, this.body.y - 5, 40, 10);
    ctx.fillStyle = 'black';
    ctx.fill();
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.body.x - 5, this.body.y - 5, 10, 10);

    ctx.restore();
  }
}