
import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { AppSettings, TearBody, Landmark } from '../types';

// Constants for Face Landmark Indices
const L_EYE = 145;
const L_CHEEK = 205;
const L_DROP = 136;
const R_EYE = 374;
const R_CHEEK = 425;
const R_DROP = 365;

// Constants for Hand Landmark Indices
const INDEX_FINGER_TIP = 8;
const INDEX_FINGER_PIP = 6;
const MIDDLE_FINGER_TIP = 12;
const MIDDLE_FINGER_PIP = 10;
const RING_FINGER_TIP = 16;
const RING_FINGER_PIP = 14;
const PINKY_TIP = 20;
const PINKY_PIP = 18;

// Offset for the ground from the bottom of the canvas (top of the bottom toolbar)
const GROUND_OFFSET = 10; 

interface ARCanvasProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  textQueue: string[];
  onTextConsumed: () => void;
  isCameraOn: boolean;
  clearTrigger: number;
  rewindTrigger?: number;
  zoomLevel?: number;
  verticalOffset?: number;
}

// Helper to check distance between landmarks
const dist = (a: Landmark, b: Landmark) => Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2);

const ARCanvas: React.FC<ARCanvasProps> = ({ settings, onSettingsChange, textQueue, onTextConsumed, isCameraOn, clearTrigger, rewindTrigger, zoomLevel = 1, verticalOffset = 0 }) => {
  const outerContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  
  // Track dimensions dynamically to handle resize and layout changes
  const dimensionsRef = useRef({ width: window.innerWidth, height: window.innerHeight });
  // Track video source dimensions for aspect ratio correction
  const videoDimensionsRef = useRef({ width: 1280, height: 720 });
  
  const faceLandmarksRef = useRef<Landmark[] | null>(null);
  const handLandmarksRef = useRef<Landmark[][] | null>(null);
  
  const cameraRef = useRef<any>(null);

  // Interaction Refs
  const lastInteractRef = useRef<{ element: Element | null, startTime: number }>({ element: null, startTime: 0 });
  const lastSpawnTimeRef = useRef<number>(0);
  
  // To avoid stale closures
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  
  const isCameraOnRef = useRef(isCameraOn);
  useEffect(() => { isCameraOnRef.current = isCameraOn; }, [isCameraOn]);
  
  const textQueueRef = useRef(textQueue);
  useEffect(() => { textQueueRef.current = textQueue; }, [textQueue]);
  
  const onTextConsumedRef = useRef(onTextConsumed);
  useEffect(() => { onTextConsumedRef.current = onTextConsumed; }, [onTextConsumed]);

  const onSettingsChangeRef = useRef(onSettingsChange);
  useEffect(() => { onSettingsChangeRef.current = onSettingsChange; }, [onSettingsChange]);

  const zoomLevelRef = useRef(zoomLevel);
  useEffect(() => { zoomLevelRef.current = zoomLevel; }, [zoomLevel]);

  // We don't need verticalOffset ref for logic anymore as we handle it via CSS transform on container

  const [isLoading, setIsLoading] = useState(true);

  // Handle Clear Trigger
  useEffect(() => {
    if (clearTrigger > 0 && engineRef.current) {
       const bodies = Matter.Composite.allBodies(engineRef.current.world);
       // Remove all non-static bodies (the tears)
       const tears = bodies.filter(b => !b.isStatic);
       Matter.Composite.remove(engineRef.current.world, tears);
    }
  }, [clearTrigger]);

  // Handle Rewind Trigger
  useEffect(() => {
    if (rewindTrigger && rewindTrigger > 0 && engineRef.current) {
        const bodies = Matter.Composite.allBodies(engineRef.current.world) as TearBody[];
        // Filter and sort bodies by ID descending (newest first) for "Last In First Out" rewind effect
        const tears = bodies.filter(b => !b.isStatic && b.plugin);
        tears.sort((a, b) => b.id - a.id);

        const now = Date.now();
        tears.forEach((b, index) => {
            b.plugin.state = 'rewinding';
            // Stagger start times: 60ms delay between each item
            b.plugin.rewindStartTime = now + (index * 60);
            
            // Disable collisions immediately so they can float through things
            b.isSensor = true;
            b.frictionAir = 0;
            
            // Stop current motion immediately
            Matter.Body.setVelocity(b, { x: 0, y: 0 });
            Matter.Body.setAngularVelocity(b, 0);
        });
    }
  }, [rewindTrigger]);

  // --- Dynamic Resizing Effect ---
  // When settings.size changes, update the scale of all existing tear bodies
  useEffect(() => {
    if (!engineRef.current) return;
    
    const bodies = Matter.Composite.allBodies(engineRef.current.world) as TearBody[];
    const newSize = settings.size;

    bodies.forEach(body => {
      // Skip walls or bodies without our plugin data
      if (body.isStatic || !body.plugin) return;
      
      const currentSize = body.plugin.currentSize;
      
      // Calculate scale factor relative to the body's current size
      if (currentSize && currentSize !== newSize) {
        const scaleFactor = newSize / currentSize;
        Matter.Body.scale(body, scaleFactor, scaleFactor);
        
        // Update the tracked size
        body.plugin.currentSize = newSize;
      }
    });
  }, [settings.size]);

  // --- Initialize Matter.js ---
  useEffect(() => {
    if (!containerRef.current || !outerContainerRef.current) return;

    const Engine = Matter.Engine,
          Render = Matter.Render,
          Runner = Matter.Runner,
          Bodies = Matter.Bodies,
          Composite = Matter.Composite,
          Events = Matter.Events,
          Mouse = Matter.Mouse,
          MouseConstraint = Matter.MouseConstraint,
          Body = Matter.Body;

    // Create engine
    const engine = Engine.create();
    engine.gravity.y = settings.speed;
    engineRef.current = engine;

    // Measure the actual container size from the OUTER wrapper
    const rect = outerContainerRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    dimensionsRef.current = { width, height };

    // Create renderer
    const render = Render.create({
      element: containerRef.current,
      engine: engine,
      options: {
        width,
        height,
        background: 'transparent', // Transparent to show video behind
        wireframes: false,
        showAngleIndicator: false
      }
    });
    renderRef.current = render;

    // --- Boundaries (Ground & Walls) ---
    // Adjusted friction for boundaries to help with natural settling
    const wallOpts = { 
        isStatic: true, 
        render: { visible: false },
        friction: 0.5, 
        restitution: 0.2 
    };
    const thick = 100;
    
    // Walls and Ground based on container dimensions
    // Apply offset to ground so it sits slightly above the bottom edge (toolbar)
    const groundY = height - GROUND_OFFSET + thick / 2;
    const ground = Bodies.rectangle(width / 2, groundY, width, thick, { ...wallOpts, label: 'ground' });
    const leftWall = Bodies.rectangle(0 - thick / 2, height / 2, thick, height * 4, { ...wallOpts, label: 'left-wall' });
    const rightWall = Bodies.rectangle(width + thick / 2, height / 2, thick, height * 4, { ...wallOpts, label: 'right-wall' });
    
    Composite.add(engine.world, [ground, leftWall, rightWall]);

    // Mouse control
    const mouse = Mouse.create(render.canvas);
    mouse.element.removeEventListener("mousewheel", (mouse as any).mousewheel);
    mouse.element.removeEventListener("DOMMouseScroll", (mouse as any).mousewheel);

    const mouseConstraint = MouseConstraint.create(engine, {
      mouse: mouse,
      constraint: {
        stiffness: 0.1,
        render: { visible: false }
      }
    });
    Composite.add(engine.world, mouseConstraint);

    // Track mouse position for repulsion
    let mousePosition = { x: 0, y: 0 };
    Events.on(mouseConstraint, 'mousemove', (event: any) => {
        mousePosition = event.mouse.position;
    });

    // Helper: Coordinate Mapping for Zoom + Cover (matches object-cover)
    // Vertical Offset is handled by CSS transform of container, so logic here assumes 0 offset
    const getMappedCoords = (nx: number, ny: number, mirrorX: boolean = false) => {
        const { width: cW, height: cH } = dimensionsRef.current;
        const { width: vW, height: vH } = videoDimensionsRef.current;
        const zoom = zoomLevelRef.current;
        
        // Cover Logic: Fit the smaller dimension to the container, crop the larger one
        // This effectively fits the height on mobile (tall screen) and width on desktop (wide screen)
        const scale = Math.max(cW / vW, cH / vH);
        
        const targetW = vW * scale;
        const targetH = vH * scale;
        
        // Calculate offsets to center the contained video rect
        const offX = (cW - targetW) / 2;
        const offY = (cH - targetH) / 2;
        
        const px = mirrorX ? (1 - nx) : nx;
        
        // Coordinates in Unscaled Container space
        const ucX = offX + px * targetW;
        const ucY = offY + ny * targetH;
        
        // Apply Zoom relative to center
        // final = center + (point - center) * zoom
        const finalX = (cW / 2) + (ucX - cW / 2) * zoom;
        const finalY = (cH / 2) + (ucY - cH / 2) * zoom;
        
        return { x: finalX, y: finalY };
    };

    // Helper to transform internal canvas coords to screen coords for elementFromPoint interaction
    const getScreenCoords = (cx: number, cy: number) => {
        // Use containerRef rect because it includes the translateY transform
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return { x: cx, y: cy };
        
        // Screen Coordinate = Canvas Coordinate + Canvas Screen Position
        return { x: cx + rect.left, y: cy + rect.top };
    };

    // --- Physics Logic ---
    Events.on(engine, 'beforeUpdate', () => {
        const bodies = Composite.allBodies(engine.world) as TearBody[];
        const currentFaceLandmarks = faceLandmarksRef.current;
        const currentHandLandmarks = handLandmarksRef.current;
        const camOn = isCameraOnRef.current;
        const currentSettings = settingsRef.current;
        const now = Date.now();

        // Update gravity based on settings
        engine.gravity.y = currentSettings.speed;

        // 1. Calculate repulsion points
        const repulsionPoints: Matter.Vector[] = [mousePosition];
        if (camOn && currentHandLandmarks) {
            currentHandLandmarks.forEach(hand => {
                const indexTip = hand[INDEX_FINGER_TIP];
                if (indexTip) {
                    const p = getMappedCoords(indexTip.x, indexTip.y, true);
                    repulsionPoints.push(p);
                }
            });
        }

        // 2. Tear Logic
        bodies.forEach(body => {
            if (body.isStatic) return;

            // Update bounce (restitution)
            body.restitution = currentSettings.bounce;

            // --- REWIND LOGIC ---
            if (body.plugin && body.plugin.state === 'rewinding') {
                if (body.plugin.rewindStartTime && now < body.plugin.rewindStartTime) {
                    Body.setVelocity(body, { x: 0, y: 0 });
                    Body.setAngularVelocity(body, 0);
                    return; 
                }

                let onPath = false;

                if (camOn && currentFaceLandmarks) {
                    const isLeft = body.plugin.side === 'left';
                    const p0Raw = currentFaceLandmarks[isLeft ? L_EYE : R_EYE];
                    const p1Raw = currentFaceLandmarks[isLeft ? L_CHEEK : R_CHEEK];
                    const p2Raw = currentFaceLandmarks[isLeft ? L_DROP : R_DROP];

                    if (p0Raw && p1Raw && p2Raw) {
                        onPath = true;
                        
                        // Map landmarks to screen space
                        const p0 = getMappedCoords(p0Raw.x, p0Raw.y, true);
                        const p1 = getMappedCoords(p1Raw.x, p1Raw.y, true);
                        const p2 = getMappedCoords(p2Raw.x, p2Raw.y, true);

                        if (body.plugin.progress >= 1.0) {
                             // Falling phase -> fly to chin (p2)
                             const chinX = p2.x + body.plugin.pathOffset;
                             const chinY = p2.y;
                             
                             const dx = chinX - body.position.x;
                             const dy = chinY - body.position.y;
                             const distToChin = Math.sqrt(dx*dx + dy*dy);
                             const flySpeed = currentSettings.speed * 20;

                             if (distToChin < flySpeed * 1.5) {
                                 body.plugin.progress = 0.99;
                             } else {
                                 Body.setVelocity(body, {
                                     x: (dx / distToChin) * flySpeed,
                                     y: (dy / distToChin) * flySpeed
                                 });
                                 Body.setAngularVelocity(body, 0);
                             }
                        } else {
                            // Sliding phase -> slide to eye (p0)
                            const decrement = 0.04 * currentSettings.speed;
                            body.plugin.progress -= decrement;

                            if (body.plugin.progress <= 0) {
                                Composite.remove(engine.world, body);
                                return;
                            }

                            const t = body.plugin.progress;
                            const it = 1 - t;
                            // Interpolate in screen space
                            const bx = (it * it * p0.x) + (2 * it * t * p1.x) + (t * t * p2.x);
                            const by = (it * it * p0.y) + (2 * it * t * p1.y) + (t * t * p2.y);

                            Body.setPosition(body, { x: bx + body.plugin.pathOffset, y: by });
                            Body.setVelocity(body, { x: 0, y: 0 });
                            Body.setAngularVelocity(body, 0);
                        }
                    }
                }

                if (!onPath) {
                    const origin = body.plugin.origin;
                    if (origin) {
                        const dx = origin.x - body.position.x;
                        const dy = origin.y - body.position.y;
                        const distToOrigin = Math.sqrt(dx * dx + dy * dy);
                        const flySpeed = currentSettings.speed * 25;

                        if (distToOrigin < flySpeed) {
                            Composite.remove(engine.world, body);
                        } else {
                            Body.setVelocity(body, {
                                x: (dx / distToOrigin) * flySpeed,
                                y: (dy / distToOrigin) * flySpeed
                            });
                            Body.setAngularVelocity(body, 0);
                        }
                    } else {
                        Composite.remove(engine.world, body);
                    }
                }
                return; 
            }

            // A. Sliding on Face Logic
            if (body.plugin && body.plugin.state === 'sliding') {
                if (camOn && currentFaceLandmarks) {
                    const isLeft = body.plugin.side === 'left';
                    const p0Raw = currentFaceLandmarks[isLeft ? L_EYE : R_EYE];
                    const p1Raw = currentFaceLandmarks[isLeft ? L_CHEEK : R_CHEEK];
                    const p2Raw = currentFaceLandmarks[isLeft ? L_DROP : R_DROP];

                    if (p0Raw && p1Raw && p2Raw) {
                        // Map to screen space
                        const p0 = getMappedCoords(p0Raw.x, p0Raw.y, true);
                        const p1 = getMappedCoords(p1Raw.x, p1Raw.y, true);
                        const p2 = getMappedCoords(p2Raw.x, p2Raw.y, true);

                        // Quadratic Bezier interpolation
                        const t = body.plugin.progress;
                        const it = 1 - t;

                        const bx = (it * it * p0.x) + (2 * it * t * p1.x) + (t * t * p2.x);
                        const by = (it * it * p0.y) + (2 * it * t * p1.y) + (t * t * p2.y);

                        Body.setPosition(body, { x: bx + body.plugin.pathOffset, y: by });
                        Body.setVelocity(body, { x: 0, y: 0 });
                        Body.setAngularVelocity(body, 0);

                        const progressSpeed = 0.01 + (t * 0.03); 
                        body.plugin.progress += progressSpeed;

                        if (body.plugin.progress >= 1.0) {
                            body.plugin.state = 'falling';
                            body.isSensor = false; 
                            Body.setVelocity(body, {
                                x: (Math.random() - 0.5) * 2.0,
                                y: 5 + Math.random() * 2
                            });
                        }
                    } else {
                        body.plugin.state = 'falling';
                        body.isSensor = false;
                    }
                } else {
                    body.plugin.state = 'falling';
                    body.isSensor = false;
                }
            }
            
            // B. Falling/Repulsion Logic
            if (body.plugin.state === 'falling') {
                repulsionPoints.forEach(pt => {
                    const dx = body.position.x - pt.x;
                    const dy = body.position.y - pt.y;
                    const distSq = dx*dx + dy*dy;
                    if (distSq < 10000 && distSq > 0) {
                        const force = 0.005;
                        Body.applyForce(body, body.position, {
                            x: (dx / Math.sqrt(distSq)) * force,
                            y: (dy / Math.sqrt(distSq)) * force
                        });
                    }
                });
            }
        });

        // 3. Spawning Logic
        const spawnInterval = 35; 
        
        if (textQueueRef.current.length > 0 && now - lastSpawnTimeRef.current > spawnInterval) {
            const char = textQueueRef.current[0];
            let spawnPos = null;
            let side: 'left' | 'right' = Math.random() > 0.5 ? 'left' : 'right';

            const winW = dimensionsRef.current.width; // Fallback for no cam

            if (camOn && currentFaceLandmarks) {
                const isLeft = side === 'left';
                const eye = currentFaceLandmarks[isLeft ? L_EYE : R_EYE];
                if (eye) {
                    spawnPos = getMappedCoords(eye.x, eye.y, true);
                }
            } else if (!camOn) {
                spawnPos = {
                    x: winW / 2 + (Math.random() - 0.5) * 200,
                    y: -50
                };
            }

            if (spawnPos) {
                lastSpawnTimeRef.current = now;
                const radius = currentSettings.size * 0.25; 
                
                const tearBody = Bodies.circle(spawnPos.x, spawnPos.y, radius, {
                    restitution: currentSettings.bounce,
                    friction: 0.05, 
                    frictionStatic: 0.1,
                    frictionAir: 0.01,
                    isSensor: camOn, 
                    render: { opacity: 0 }
                }) as TearBody;

                tearBody.plugin = {
                    state: camOn ? 'sliding' : 'falling',
                    side: side,
                    progress: 0,
                    pathOffset: (Math.random() - 0.5) * 10,
                    currentSize: currentSettings.size,
                    origin: { x: spawnPos.x, y: spawnPos.y }
                };
                
                tearBody.render.customText = char;
                tearBody.render.baseFontSize = currentSettings.size;
                
                Composite.add(engine.world, tearBody);
                onTextConsumedRef.current(); 
            }
        }
    });

    // --- Custom Rendering (Text & Hands) ---
    Events.on(render, 'afterRender', () => {
        const ctx = render.context;
        const bodies = Composite.allBodies(engine.world) as TearBody[];
        const isCamOn = isCameraOnRef.current;
        const { width: winW, height: winH } = dimensionsRef.current;

        // 1. Render Text
        ctx.font = `bold ${settingsRef.current.size}px "Space Grotesk", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        bodies.forEach(body => {
            if (body.isStatic || !body.render.customText) return;
            const { x, y } = body.position;
            const angle = body.angle;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.fillStyle = isCamOn ? '#ffffff' : '#000000';
            if (isCamOn) {
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 4;
            } else {
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
            }
            ctx.fillText(body.render.customText, 0, 0);
            ctx.restore();
        });

        // 2. Render Hand Interaction Points
        const currentHands = handLandmarksRef.current;
        if (currentHands && isCamOn) {
             const now = performance.now();

             currentHands.forEach(hand => {
                 const tip = hand[INDEX_FINGER_TIP];
                 if (!tip) return;
                 
                 // Logic to determine pointing
                 const wrist = hand[0];
                 const isIndexExtended = dist(wrist, hand[INDEX_FINGER_TIP]) > dist(wrist, hand[INDEX_FINGER_PIP]);
                 const isMiddleCurled = dist(wrist, hand[MIDDLE_FINGER_TIP]) < dist(wrist, hand[MIDDLE_FINGER_PIP]);
                 const isRingCurled = dist(wrist, hand[RING_FINGER_TIP]) < dist(wrist, hand[RING_FINGER_PIP]);
                 const isPinkyCurled = dist(wrist, hand[PINKY_TIP]) < dist(wrist, hand[PINKY_PIP]);
                 const isPointingUp = isIndexExtended && isMiddleCurled && isRingCurled && isPinkyCurled;

                 // Map Coordinates using helper (physics coords)
                 const p = getMappedCoords(tip.x, tip.y, true);
                 const x = p.x;
                 const y = p.y;
                 
                 if (isPointingUp) {
                    // Interaction logic: Use adjusted screen coordinates for elementFromPoint
                    const screenPos = getScreenCoords(x, y);
                    const el = document.elementFromPoint(screenPos.x, screenPos.y);
                    
                    if (el) {
                        const inputEl = el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'range' 
                                      ? (el as HTMLInputElement) 
                                      : el.querySelector('input[type="range"]') as HTMLInputElement;

                        if (inputEl) {
                           const key = inputEl.getAttribute('data-setting-key') as keyof AppSettings;
                           if (key) {
                               const rect = inputEl.getBoundingClientRect();
                               let percent = 0;
                               if (rect.height > rect.width) {
                                  percent = (rect.bottom - screenPos.y) / rect.height;
                               } else {
                                  percent = (screenPos.x - rect.left) / rect.width;
                               }
                               percent = Math.max(0, Math.min(1, percent));
                               const min = parseFloat(inputEl.min);
                               const max = parseFloat(inputEl.max);
                               const step = parseFloat(inputEl.step);
                               let newVal = min + (max - min) * percent;
                               newVal = Math.round(newVal / step) * step;
                               onSettingsChangeRef.current({ ...settingsRef.current, [key]: newVal });
                           }
                        }
                        
                        const btnEl = el.tagName === 'BUTTON' ? (el as HTMLButtonElement) : el.closest('button');
                        if (btnEl) {
                             if (lastInteractRef.current.element !== btnEl) {
                                 lastInteractRef.current.element = btnEl;
                                 lastInteractRef.current.startTime = now;
                             } else {
                                 const elapsed = now - lastInteractRef.current.startTime;
                                 const DWELL_TIME = 600; 
                                 ctx.beginPath();
                                 ctx.arc(x, y, 16, 0, (elapsed / DWELL_TIME) * 2 * Math.PI);
                                 ctx.strokeStyle = '#00ff00';
                                 ctx.lineWidth = 3;
                                 ctx.stroke();

                                 if (elapsed > DWELL_TIME) {
                                     btnEl.click();
                                     lastInteractRef.current.startTime = now + 1000; 
                                     ctx.fillStyle = '#00ff00';
                                     ctx.fill();
                                 }
                             }
                        } else {
                            lastInteractRef.current.element = null;
                        }
                    }
                 } else {
                    lastInteractRef.current.element = null;
                 }

                 ctx.beginPath();
                 ctx.arc(x, y, 8, 0, 2 * Math.PI); 
                 if (isPointingUp) {
                    ctx.fillStyle = 'rgba(0, 255, 0, 0.5)'; 
                    ctx.strokeStyle = '#00ff00';
                 } else {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                 }
                 ctx.lineWidth = 2;
                 ctx.fill();
                 ctx.stroke();
             });
        }
    });

    // Start engine
    Render.run(render);
    const runner = Runner.create();
    runnerRef.current = runner;
    Runner.run(runner, engine);

    return () => {
        Render.stop(render);
        Runner.stop(runner);
        Composite.clear(engine.world, false, true);
        Engine.clear(engine);
        render.canvas.remove();
        render.canvas = null as any;
        render.context = null as any;
        render.textures = {};
    };
  }, []); 

  // --- Resize Handler ---
  useEffect(() => {
     const handleResize = () => {
         // Using outerContainer for reference ensures we get the container size 
         // without the scale transform affecting the returned values in a weird way
         if (!renderRef.current || !engineRef.current || !outerContainerRef.current) return;
         
         const rect = outerContainerRef.current.getBoundingClientRect();
         const w = rect.width;
         const h = rect.height;
         dimensionsRef.current = { width: w, height: h };
         
         renderRef.current.canvas.width = w;
         renderRef.current.canvas.height = h;
         renderRef.current.options.width = w;
         renderRef.current.options.height = h;

         // Update Ground Position to stay at bottom relative to new height
         // We use the same OFFSET logic to ensure it stays "slightly higher than bottom toolbar"
         const ground = Matter.Composite.allBodies(engineRef.current.world).find(b => b.label === 'ground');
         if (ground) {
             const thick = 100;
             const newY = h - GROUND_OFFSET + thick / 2;
             Matter.Body.setPosition(ground, { x: w / 2, y: newY });
             // Update width of ground to match new screen width
             const newGround = Matter.Bodies.rectangle(w / 2, newY, w, thick);
             Matter.Body.setVertices(ground, newGround.vertices);
         }

         // Update Walls
         const leftWall = Matter.Composite.allBodies(engineRef.current.world).find(b => b.label === 'left-wall');
         if (leftWall) {
             const thick = 100;
             Matter.Body.setPosition(leftWall, { x: 0 - thick / 2, y: h / 2 });
         }
         const rightWall = Matter.Composite.allBodies(engineRef.current.world).find(b => b.label === 'right-wall');
         if (rightWall) {
             const thick = 100;
             Matter.Body.setPosition(rightWall, { x: w + thick / 2, y: h / 2 });
         }
     };
     
     window.addEventListener('resize', handleResize);
     return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- FaceMesh & Hands & Camera Setup ---
  useEffect(() => {
    let faceMesh: any;
    let hands: any;
    let camera: any;

    const initMediaPipe = async () => {
        if (!(window as any).FaceMesh || !videoRef.current) return;

        // 1. Initialize FaceMesh
        faceMesh = new (window as any).FaceMesh({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        faceMesh.onResults((results: any) => {
            setIsLoading(false);
            if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                faceLandmarksRef.current = results.multiFaceLandmarks[0];
            } else {
                faceLandmarksRef.current = null;
            }
        });

        // 2. Initialize Hands
        if ((window as any).Hands) {
            hands = new (window as any).Hands({
                locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
            });
            hands.setOptions({
                maxNumHands: 2,
                modelComplexity: 1,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            hands.onResults((results: any) => {
                if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                    handLandmarksRef.current = results.multiHandLandmarks;
                } else {
                    handLandmarksRef.current = null;
                }
            });
        }

        // 3. Initialize Camera
        if ((window as any).Camera) {
            camera = new (window as any).Camera(videoRef.current, {
                onFrame: async () => {
                    if (videoRef.current && isCameraOnRef.current) {
                        if (faceMesh) await faceMesh.send({ image: videoRef.current });
                        if (hands) await hands.send({ image: videoRef.current });
                    }
                },
                width: 1280,
                height: 720
            });
            camera.start();
        }
    };
    
    initMediaPipe();

    return () => {
        if (camera) camera.stop();
        if (faceMesh) faceMesh.close();
        if (hands) hands.close();
    };
  }, []);

  return (
    <div 
        ref={outerContainerRef}
        // Change: Use top-[60px] and bottom-[60px] to strictly constrain height between toolbars on mobile.
        // Change: Removed rounded-2xl to ensure corners don't create visual gaps above the toolbar.
        // Change: Ensure desktop still uses full height (top-0 h-full).
        className={`absolute left-0 w-full md:top-0 md:h-full md:bottom-auto top-[60px] bottom-[60px] overflow-hidden transition-colors duration-500 ${isCameraOn ? 'bg-black' : 'bg-white'}`}
    >
      {/* Container that slides vertically for Pan/Scroll effect */}
      <div 
          className="w-full h-full relative transition-transform duration-300 ease-out"
          style={{ transform: `translateY(${verticalOffset}px)` }}
      >
          {/* Zoom Wrapper: Video Scaled by Zoom */}
          <div 
            className="w-full h-full origin-center transition-transform duration-300 ease-out flex items-center justify-center"
            style={{ transform: `scale(${zoomLevel})` }}
          >
              <video
                ref={videoRef}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${isCameraOn ? 'opacity-100' : 'opacity-0'}`}
                playsInline
                muted
                autoPlay 
                style={{ transform: 'scaleX(-1)' }} 
                onLoadedMetadata={(e) => {
                     const v = e.currentTarget;
                     videoDimensionsRef.current = { width: v.videoWidth, height: v.videoHeight };
                }}
              />
          </div>
          
          {/* Physics/AR Layer - Moves with the container but is NOT scaled by zoom (to keep resolution) */}
          <div 
            ref={containerRef} 
            className="absolute inset-0 z-10"
          />
      </div>
      
      {isLoading && isCameraOn && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/50 text-xs tracking-widest animate-pulse">
              INITIALIZING VISION...
          </div>
      )}
    </div>
  );
};

export default ARCanvas;
