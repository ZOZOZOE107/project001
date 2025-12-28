import React, { useEffect, useRef, useState } from 'react';
import { noise } from './utils/noise';

// Types for MediaPipe (Global)
declare global {
  interface Window {
    Hands: any;
    drawConnectors: any;
    drawLandmarks: any;
    HAND_CONNECTIONS: any;
  }
}

// C Major Pentatonic Scale (Healing/Peaceful/Ambient)
// Extended across 4 octaves for a wide, piano-like range
const SCALE = [
  130.81, 146.83, 164.81, 196.00, 220.00, // C3 - A3
  261.63, 293.66, 329.63, 392.00, 440.00, // C4 - A4 (Middle)
  523.25, 587.33, 659.25, 783.99, 880.00, // C5 - A5
  1046.50, 1174.66, 1318.51, 1567.98, 1760.00 // C6 - A6 (Sparkles)
];

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null); // New: For smooth masking
  const fileInputRef = useRef<HTMLInputElement>(null); // For loading music
  const requestRef = useRef<number>(0);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Audio Context & Nodes
  const audioContextRef = useRef<AudioContext | null>(null);
  const mainBusRef = useRef<GainNode | null>(null);
  const synthBusRef = useRef<GainNode | null>(null); // New: Bus for healing sounds
  const backingBusRef = useRef<GainNode | null>(null); // New: Bus for user track
  
  const masterAnalyserRef = useRef<AnalyserNode | null>(null); // Visualizer for everything
  const noiseBufferRef = useRef<AudioBuffer | null>(null); // For percussion
  
  // Backing Track Nodes
  const backingBufferRef = useRef<AudioBuffer | null>(null);
  const backingSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const backingFilterRef = useRef<BiquadFilterNode | null>(null);
  
  // Audio Analysis Ref
  const audioDataArrayRef = useRef<Uint8Array | null>(null);

  // Interaction State
  const lastIndexRef = useRef<number>(-1); // Left hand / Mouse (Synth)
  const lastRightIndexRef = useRef<number>(-1); // Right hand (Percussion)
  const handsRef = useRef<any>(null); // MediaPipe Hands instance

  // State for UI
  const [density, setDensity] = useState(40);
  const [lineThickness, setLineThickness] = useState(1.0); 
  const [whiteBackground, setWhiteBackground] = useState(true); 
  // audioEnabled removed
  const [instrumentEnabled, setInstrumentEnabled] = useState(false); // Mode
  const [handsEnabled, setHandsEnabled] = useState(false); // Hand Control Mode
  const [backingTrackLoaded, setBackingTrackLoaded] = useState(false); // User Music
  const [vertical, setVertical] = useState(false); // Orientation
  const [sensitivity, setSensitivity] = useState(50);
  const [revealRadius, setRevealRadius] = useState(150); 
  const [amplitude, setAmplitude] = useState(50); // Interaction Amplitude (was Flux)
  const [lineColor, setLineColor] = useState('#000000'); // Color of the scan lines
  
  // Volume States
  const [volTrack, setVolTrack] = useState(0.8);
  const [volSynth, setVolSynth] = useState(0.5);
  
  // For coordinates display
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Use a ref for values accessed inside the animation loop to prevent closure staleness
  const settingsRef = useRef({ 
    density: 40,
    baseDensity: 40, // Store original density to restore after interaction
    lineThickness: 1.0,
    whiteBackground: true, 
    instrumentEnabled: false,
    handsEnabled: false,
    backingTrackLoaded: false,
    vertical: false, 
    sensitivity: 50,
    revealRadius: 150,
    amplitude: 50,
    smoothedAudio: 0,
    activeIndex: -1, // Visual highlight row
    volTrack: 0.8,
    volSynth: 0.5,
    lineColor: '#000000',
    // Tracking multiple interaction points
    // Added thumb coordinates and dynamic radius for pinch-to-reveal
    leftHand: { x: -1000, y: -1000, thumbX: 0, thumbY: 0, dynamicRadius: 0, active: false, strength: 0, radius: 150, angle: 0 },
    rightHand: { x: -1000, y: -1000, thumbX: 0, thumbY: 0, dynamicRadius: 0, active: false, strength: 0, radius: 150 },
    mouse: { x: -1000, y: -1000, active: false, strength: 0, radius: 150 },
    // Hand Control Specifics
    drumFilterFreq: 1000, // Controls brightness of kick
    drumBpmMod: 0, // Modifies BPM slightly (-1 to 1)
    hasHands: false,
    // Gesture State: Thumb Up (Toggle BG)
    isThumbUp: false,
    thumbUpStartTime: 0,
    thumbUpTriggered: false,
    // Gesture State: Pointing Up (Rotation Lock)
    isPointingUp: false,
    pointingUpStartTime: 0,
    // Gesture State: Love (Density Control)
    isLoveGesture: false,
    loveGestureStartTime: 0,
    // Gesture State: Victory (Thickness Control)
    isVictoryGesture: false,
    victoryGestureStartTime: 0,
    // Rotation
    currentRotation: 0,
    targetRotation: 0
  });

  // --- Audio System Setup ---
  const ensureAudioContext = () => {
    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      
      // Master Analyser (The visualizer heart)
      const masterAnalyser = ctx.createAnalyser();
      masterAnalyser.fftSize = 256;
      masterAnalyser.smoothingTimeConstant = 0.8;
      masterAnalyser.connect(ctx.destination);
      masterAnalyserRef.current = masterAnalyser;
      audioDataArrayRef.current = new Uint8Array(masterAnalyser.frequencyBinCount);

      // Limiter (Compressor)
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -10;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      compressor.connect(masterAnalyser);
      
      // Delay (Atmosphere)
      const delay = ctx.createDelay(5.0);
      delay.delayTime.value = 0.5; 
      const delayFeedback = ctx.createGain();
      delayFeedback.gain.value = 0.5; 
      const delayOutput = ctx.createGain();
      delayOutput.gain.value = 0.2; 
      
      // Main Bus
      const mainBus = ctx.createGain();
      mainBus.connect(compressor);
      mainBus.connect(delay);
      delay.connect(delayFeedback);
      delayFeedback.connect(delay);
      delay.connect(delayOutput);
      delayOutput.connect(compressor);

      // --- SUB BUSSES for Volume Control ---
      const synthBus = ctx.createGain();
      synthBus.gain.value = settingsRef.current.volSynth;
      synthBus.connect(mainBus);
      synthBusRef.current = synthBus;

      const backingBus = ctx.createGain();
      backingBus.gain.value = settingsRef.current.volTrack;
      backingBus.connect(mainBus);
      backingBusRef.current = backingBus;

      // Noise Buffer
      const bufferSize = ctx.sampleRate * 2; 
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      noiseBufferRef.current = buffer;

      audioContextRef.current = ctx;
      mainBusRef.current = mainBus;
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return { 
        ctx: audioContextRef.current, 
        mainBus: mainBusRef.current,
        synthBus: synthBusRef.current,
        backingBus: backingBusRef.current,
        masterAnalyser: masterAnalyserRef.current 
    };
  };

  // Update Volumes
  useEffect(() => {
    if (synthBusRef.current) {
        synthBusRef.current.gain.setTargetAtTime(volSynth, audioContextRef.current?.currentTime || 0, 0.1);
    }
    settingsRef.current.volSynth = volSynth;
  }, [volSynth]);

  useEffect(() => {
    if (backingBusRef.current) {
        backingBusRef.current.gain.setTargetAtTime(volTrack, audioContextRef.current?.currentTime || 0, 0.1);
    }
    settingsRef.current.volTrack = volTrack;
  }, [volTrack]);


  // --- Load User Audio ---
  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        const { ctx } = ensureAudioContext();
        if (!ctx || !event.target?.result) return;
        
        try {
          const arrayBuffer = event.target.result as ArrayBuffer;
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          backingBufferRef.current = audioBuffer;
          setBackingTrackLoaded(true);
          settingsRef.current.backingTrackLoaded = true;
          
          if (instrumentEnabled) {
              startBackingTrack();
          }
        } catch (err) {
            console.error("Error decoding audio", err);
            alert("Could not decode audio file.");
        }
      };
      
      reader.readAsArrayBuffer(file);
    }
  };

  const startBackingTrack = () => {
      const { ctx, backingBus } = ensureAudioContext();
      if (!ctx || !backingBufferRef.current || !backingBus) return;
      
      if (backingSourceRef.current) {
          try { backingSourceRef.current.stop(); } catch(e){}
      }

      const source = ctx.createBufferSource();
      source.buffer = backingBufferRef.current;
      source.loop = true;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 20000;
      
      source.connect(filter);
      filter.connect(backingBus); // Connect to Backing Bus
      // We also need visualizer connection. The bus connects to main, which connects to compressor -> analyser.
      
      source.start(0);
      
      backingSourceRef.current = source;
      backingFilterRef.current = filter;
  };

  const stopBackingTrack = () => {
      if (backingSourceRef.current) {
          try { backingSourceRef.current.stop(); } catch(e){}
          backingSourceRef.current = null;
      }
  };

  // --- Kick Drum Generator (Soft Heartbeat) ---
  const playKick = (time: number) => {
    if (settingsRef.current.backingTrackLoaded) return;

    const { ctx, synthBus } = ensureAudioContext();
    if (!ctx || !synthBus) return;

    // --- PINCH INTERACTION (Right Hand) ---
    // If Right hand is active, use the pinch distance to control softness/volume
    // This makes the beat "comfortable" by allowing the user to dampen it physically.
    let pinchFactor = 1.0;
    if (settingsRef.current.rightHand.active) {
        // Map 0-150px to 0.2-1.0 range (Never go completely silent, keep a heartbeat)
        const rawPinch = settingsRef.current.rightHand.dynamicRadius || 150;
        pinchFactor = Math.min(1, Math.max(0.2, rawPinch / 150));
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter(); 

    // Soft Pulse (Sub-bass)
    const baseCutoff = settingsRef.current.drumFilterFreq; 
    // Apply pinch factor to cutoff (Pinch = Lower frequency/Softer)
    const activeCutoff = baseCutoff * pinchFactor;

    osc.frequency.setValueAtTime(80, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.5);

    // Apply pinch factor to gain (Pinch = Quieter)
    gain.gain.setValueAtTime(0.6 * pinchFactor, time); 
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.8);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(activeCutoff > 800 ? 800 : activeCutoff, time); 
    filter.Q.value = 0.5;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(synthBus); // Connect to Synth Bus

    osc.start(time);
    osc.stop(time + 1.0);
  };

  // --- Percussion Generator ---
  const playPercussion = (index: number, maxIndex: number) => {
    const { ctx, synthBus } = ensureAudioContext();
    if (!ctx || !synthBus) return;

    const now = ctx.currentTime;
    const normalizedPos = index / maxIndex; 
    
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    
    const freq = 1600 - (normalizedPos * 800); 
    osc.frequency.setValueAtTime(freq, now);
    
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.01); 
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15); 

    const panner = ctx.createStereoPanner();
    panner.pan.value = 0.5; 

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(synthBus); // Connect to Synth Bus

    osc.start(now);
    osc.stop(now + 0.2);
  };

  // --- Beat Sequencer ---
  useEffect(() => {
    let isPlaying = instrumentEnabled;
    let timerID: number;
    let nextNoteTime = 0;
    const LOOKAHEAD = 25.0; 
    const SCHEDULE_AHEAD_TIME = 0.1; 
    const BASE_BPM = 80; 

    const scheduler = () => {
      if (!isPlaying) return;
      const ctx = audioContextRef.current;
      if (!ctx) return;
      
      if (!settingsRef.current.backingTrackLoaded) {
          const currentBPM = BASE_BPM + (settingsRef.current.drumBpmMod * 30);
          const secondsPerBeat = 60.0 / Math.max(40, currentBPM); 

          while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_TIME) {
            playKick(nextNoteTime);
            nextNoteTime += secondsPerBeat;
          }
      } else {
           nextNoteTime = ctx.currentTime + SCHEDULE_AHEAD_TIME;
      }
      
      timerID = window.setTimeout(scheduler, LOOKAHEAD);
    };

    if (instrumentEnabled) {
      const { ctx } = ensureAudioContext();
      if (ctx) {
        if (settingsRef.current.backingTrackLoaded && !backingSourceRef.current) {
            startBackingTrack();
        }
        nextNoteTime = ctx.currentTime + 0.1;
        scheduler();
      }
    } else {
        stopBackingTrack();
    }

    return () => {
      isPlaying = false;
      window.clearTimeout(timerID);
      stopBackingTrack();
    };
  }, [instrumentEnabled]);


  // --- Note Triggering ---
  const playNote = (index: number, modPos: number, maxPos: number, isVerticalMode: boolean) => {
    const { ctx, synthBus } = ensureAudioContext();
    if (!ctx || !synthBus) return;

    // --- PINCH INTERACTION (Left Hand) ---
    // If Left hand is controlling melody, use pinch to control tone brightness
    let pinchFactor = 1.0;
    if (settingsRef.current.leftHand.active) {
         const rawPinch = settingsRef.current.leftHand.dynamicRadius || 150;
         pinchFactor = Math.min(1, Math.max(0.1, rawPinch / 200));
    }

    const scaleIndex = Math.floor((modPos / maxPos) * SCALE.length);
    const safeIndex = Math.max(0, Math.min(scaleIndex, SCALE.length - 1));
    const freq = SCALE[safeIndex];
    const now = ctx.currentTime;

    // Filter for Tone Softness
    const noteFilter = ctx.createBiquadFilter();
    noteFilter.type = 'lowpass';
    // Map pinch to frequency: Closed ~150Hz (Very Soft), Open ~3500Hz (Bright)
    noteFilter.frequency.setValueAtTime(150 + (pinchFactor * 3500), now);

    const masterGain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(-0.3, now); 
    
    // Connect Filter Chain: OscGains -> NoteFilter -> MasterGain -> Panner -> SynthBus
    masterGain.connect(panner);
    panner.connect(synthBus); 

    noteFilter.connect(masterGain);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);
    
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, now); 

    const osc1Gain = ctx.createGain();
    const osc2Gain = ctx.createGain();

    osc1Gain.gain.setValueAtTime(0, now);
    osc1Gain.gain.linearRampToValueAtTime(0.4, now + 0.05); 
    osc1Gain.gain.exponentialRampToValueAtTime(0.001, now + 3.0); 

    osc2Gain.gain.setValueAtTime(0, now);
    osc2Gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
    osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

    // Connect oscillators to the tone filter
    osc1.connect(osc1Gain);
    osc1Gain.connect(noteFilter);

    osc2.connect(osc2Gain);
    osc2Gain.connect(noteFilter);

    osc1.start(now);
    osc1.stop(now + 3.0);
    osc2.start(now);
    osc2.stop(now + 3.0);
  };

  // --- Handlers ---
  const handleDensityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setDensity(val);
    settingsRef.current.density = val;
    settingsRef.current.baseDensity = val; // Update base reference
  };

  const handleThicknessChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setLineThickness(val);
    settingsRef.current.lineThickness = val;
  };

  const handleRevealChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setRevealRadius(val);
    settingsRef.current.revealRadius = val;
  };

  const handleAmplitudeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      setAmplitude(val);
      settingsRef.current.amplitude = val;
  };

  const handleSensitivityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setSensitivity(val);
    settingsRef.current.sensitivity = val;
  };
  
  const handleTrackVolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolTrack(Number(e.target.value));
  };

  const handleSynthVolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolSynth(Number(e.target.value));
  };
  
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLineColor(val);
    settingsRef.current.lineColor = val;
  };

  // Improved toggleBackground for safe calling from animation loop
  const toggleBackground = () => {
    setWhiteBackground(prev => {
        const next = !prev;
        settingsRef.current.whiteBackground = next;
        return next;
    });
  };

  const toggleInstrument = () => {
    const newState = !instrumentEnabled;
    setInstrumentEnabled(newState);
    settingsRef.current.instrumentEnabled = newState;
    if (newState) {
      ensureAudioContext();
    }
  };

  const toggleVertical = () => {
    const newState = !vertical;
    setVertical(newState);
    settingsRef.current.vertical = newState;
  };

  const toggleHands = () => {
      const newState = !handsEnabled;
      setHandsEnabled(newState);
      settingsRef.current.handsEnabled = newState;
      
      if (newState && !handsRef.current) {
          initializeHands();
      }
      if (!newState) {
        settingsRef.current.hasHands = false;
        settingsRef.current.leftHand.active = false;
        settingsRef.current.rightHand.active = false;
      }
  };

  // toggleAudio Removed

  // --- Interaction Logic (Mouse Fallback) ---
  const handleMouseMove = (e: React.MouseEvent) => {
    if (settingsRef.current.handsEnabled && settingsRef.current.hasHands) return;

    const { clientX, clientY } = e;
    settingsRef.current.mouse = { x: clientX, y: clientY, active: true, strength: settingsRef.current.amplitude * 2, radius: 150 };
    setMousePos({ x: clientX, y: clientY });
    
    // Mouse interaction for Synth needs to assume unrotated (or standard) mapping for now
    // If lines are rotated, mouse interaction might drift visually if we don't map it.
    // However, mouse fallback is simple horizontal/vertical usually.
    // For now, Mouse Interaction is tied to the Visual Grid.
    
    // We will update the synth trigger inside the draw loop or use a simplified check here
    // based on the *current* rotation state? 
    // Actually, updateSynthInteraction relies on x/y. 
    // If we support rotation, this function needs to know the rotation to map "Line Index".
    // Let's rely on the Draw Loop to trigger notes (Visual triggers Audio).
    // Or keep this simple approximation.
    updateSynthInteraction(clientX, clientY);
    
    settingsRef.current.drumFilterFreq = 1000;
    settingsRef.current.drumBpmMod = 0;
  };

  const updateSynthInteraction = (x: number, y: number) => {
    // Legacy support for synth interaction based on Horizontal/Vertical mode
    // Ideally this should use the new Unified Rotation logic, but for Mouse it's okay to stay simple.
    const isVert = settingsRef.current.vertical;
    const currentDensity = settingsRef.current.density;

    let currentIndex = -1;
    let modulation = 0;
    let maxMod = 1;

    if (!isVert) {
        const lineHeight = window.innerHeight / currentDensity;
        currentIndex = Math.floor(y / lineHeight);
        modulation = x;
        maxMod = window.innerWidth;
    } else {
        const lineWidth = window.innerWidth / currentDensity;
        currentIndex = Math.floor(x / lineWidth);
        modulation = y;
        maxMod = window.innerHeight;
    }
    
    settingsRef.current.activeIndex = currentIndex;

    if (settingsRef.current.instrumentEnabled) {
      if (currentIndex !== lastIndexRef.current && currentIndex >= 0) {
        playNote(currentIndex, modulation, maxMod, isVert);
        lastIndexRef.current = currentIndex;
      }
    } else {
        lastIndexRef.current = currentIndex;
    }
  };

  const handleMouseLeave = () => {
    if (settingsRef.current.handsEnabled) return;
    settingsRef.current.mouse.active = false;
    settingsRef.current.activeIndex = -1;
    lastIndexRef.current = -1;
  };

  // --- MediaPipe Hands Setup ---
  const initializeHands = () => {
    if (!window.Hands) {
        console.error("MediaPipe Hands not loaded.");
        return;
    }
    const hands = new window.Hands({
        locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });
    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    hands.onResults(onHandResults);
    handsRef.current = hands;
  };

  const onHandResults = (results: any) => {
      const { multiHandLandmarks, multiHandedness } = results;
      
      settingsRef.current.leftHand.active = false;
      settingsRef.current.rightHand.active = false;
      
      let leftHandFound = false;
      let rightHandFound = false;
      let rightLandmarks = null;
      
      if (multiHandLandmarks && multiHandLandmarks.length > 0) {
          settingsRef.current.hasHands = true;
          const isVert = settingsRef.current.vertical;
          const currentDensity = settingsRef.current.density;

          for (let i = 0; i < multiHandLandmarks.length; i++) {
              const label = multiHandedness[i].label; // "Left" or "Right"
              const landmarks = multiHandLandmarks[i];
              
              const indexTip = landmarks[8];
              const thumbTip = landmarks[4];
              
              const x = (1 - indexTip.x) * window.innerWidth;
              const y = indexTip.y * window.innerHeight;

              const tx = (1 - thumbTip.x) * window.innerWidth;
              const ty = thumbTip.y * window.innerHeight;
              
              // Calculate pinch distance (radius) in pixels
              const dist = Math.hypot(x - tx, y - ty);

              if (label === 'Left') {
                  leftHandFound = true;
                  // Calculate Angle for Rotation Control
                  const dx = tx - x;
                  const dy = ty - y;
                  const angle = Math.atan2(dy, dx);
                  
                  // --- LEFT HAND: Synth & Melody ---
                  settingsRef.current.leftHand = { x, y, thumbX: tx, thumbY: ty, dynamicRadius: dist, active: true, strength: 0, radius: 150, angle: angle };
                  updateSynthInteraction(x, y);
                  setMousePos({ x, y });

                  // --- GESTURE DETECTION: THUMB UP (Toggle BG) ---
                  const isCurled = (tipIdx: number, pipIdx: number) => {
                      return landmarks[tipIdx].y > landmarks[pipIdx].y;
                  };
                  const indexCurled = isCurled(8, 6);
                  const middleCurled = isCurled(12, 10);
                  const ringCurled = isCurled(16, 14);
                  const pinkyCurled = isCurled(20, 18);
                  const thumbUp = landmarks[4].y < landmarks[3].y && landmarks[4].y < landmarks[5].y;

                  if (indexCurled && middleCurled && ringCurled && pinkyCurled && thumbUp) {
                      if (!settingsRef.current.isThumbUp) {
                          settingsRef.current.thumbUpStartTime = Date.now();
                          settingsRef.current.isThumbUp = true;
                          settingsRef.current.thumbUpTriggered = false;
                      }
                  } else {
                      settingsRef.current.isThumbUp = false;
                      settingsRef.current.thumbUpStartTime = 0;
                      settingsRef.current.thumbUpTriggered = false;
                  }

              } else if (label === 'Right') {
                  rightHandFound = true;
                  rightLandmarks = landmarks;
                  // --- RIGHT HAND: Percussion Strumming (Index) & Rhythm (Thumb) ---
                  settingsRef.current.rightHand = { x, y, thumbX: tx, thumbY: ty, dynamicRadius: dist, active: true, strength: 0, radius: 150 }; // Visual pluck on index
                  
                  // 1. STRUMMING (Index Finger)
                  let rightIndex = -1;
                  let maxRightIndex = 1;
                  if (!isVert) {
                     const lineHeight = window.innerHeight / currentDensity;
                     rightIndex = Math.floor(y / lineHeight);
                     maxRightIndex = currentDensity;
                  } else {
                     const lineWidth = window.innerWidth / currentDensity;
                     rightIndex = Math.floor(x / lineWidth);
                     maxRightIndex = currentDensity;
                  }

                  // Trigger Percussion on Line Cross
                  if (settingsRef.current.instrumentEnabled) {
                      if (rightIndex !== lastRightIndexRef.current && rightIndex >= 0) {
                          playPercussion(rightIndex, maxRightIndex);
                          lastRightIndexRef.current = rightIndex;
                      }
                  } else {
                      lastRightIndexRef.current = rightIndex;
                  }

                  // 2. BACKGROUND RHYTHM CONTROL (Thumb)
                  const thumbVisX = 1 - thumbTip.x;
                  const thumbVisY = thumbTip.y;

                  // Update Refs for Backing Track Control
                  if (settingsRef.current.backingTrackLoaded && backingSourceRef.current && backingFilterRef.current) {
                      const rate = 0.5 + ((1 - thumbVisY) * 1.5);
                      backingSourceRef.current.playbackRate.setTargetAtTime(rate, 0, 0.1);
                      const filterFreq = 100 + (Math.pow(thumbVisX, 2) * 20000);
                      backingFilterRef.current.frequency.setTargetAtTime(filterFreq, 0, 0.1);
                  }

                  const bpmMod = (0.5 - thumbVisY) * 2; // Range -1 to 1
                  settingsRef.current.drumBpmMod = bpmMod;
                  const freq = Math.pow(thumbVisX, 2) * 8000 + 100;
                  settingsRef.current.drumFilterFreq = freq;
              }
          }
      } else {
          settingsRef.current.hasHands = false;
      }
      
      // Handle Gesture Reset if hands lost
      if (!leftHandFound) {
           settingsRef.current.isThumbUp = false;
      }
      
      if (rightHandFound && rightLandmarks) {
          // --- GESTURE: POINTING UP (Rotation Lock) ---
          const indexUp = rightLandmarks[8].y < rightLandmarks[6].y;
          const middleCurled = rightLandmarks[12].y > rightLandmarks[10].y;
          const ringCurled = rightLandmarks[16].y > rightLandmarks[14].y;
          const pinkyCurled = rightLandmarks[20].y > rightLandmarks[18].y;
          
          if (indexUp && middleCurled && ringCurled && pinkyCurled) {
              if (!settingsRef.current.isPointingUp) {
                  settingsRef.current.isPointingUp = true;
                  settingsRef.current.pointingUpStartTime = Date.now();
              }
          } else {
              settingsRef.current.isPointingUp = false;
              settingsRef.current.pointingUpStartTime = 0;
          }

          // --- GESTURE: LOVE (Density Control) ---
          // "I Love You" sign: Thumb, Index, Pinky extended. Middle, Ring curled.
          const pinkyUp = rightLandmarks[20].y < rightLandmarks[18].y;
          
          if (indexUp && pinkyUp && middleCurled && ringCurled) {
             if (!settingsRef.current.isLoveGesture) {
                  settingsRef.current.isLoveGesture = true;
                  settingsRef.current.loveGestureStartTime = Date.now();
             }
          } else {
             if (settingsRef.current.isLoveGesture) {
                 // GESTURE ENDED: HOLD DATA
                 settingsRef.current.isLoveGesture = false;
                 settingsRef.current.loveGestureStartTime = 0;
                 setDensity(settingsRef.current.density);
                 settingsRef.current.baseDensity = settingsRef.current.density;
             }
          }
          
          // --- GESTURE: VICTORY (Thickness Control) ---
          // Victory sign: Index Up, Middle Up. Ring Curled, Pinky Curled.
          const middleUp = rightLandmarks[12].y < rightLandmarks[10].y;
          
          if (indexUp && middleUp && ringCurled && pinkyCurled) {
             if (!settingsRef.current.isVictoryGesture) {
                  settingsRef.current.isVictoryGesture = true;
                  settingsRef.current.victoryGestureStartTime = Date.now();
             }
          } else {
             if (settingsRef.current.isVictoryGesture) {
                  // GESTURE ENDED: HOLD DATA
                  // Sync the UI slider to the held value
                  settingsRef.current.isVictoryGesture = false;
                  settingsRef.current.victoryGestureStartTime = 0;
                  setLineThickness(settingsRef.current.lineThickness);
             }
          }

      } else {
           settingsRef.current.isPointingUp = false;
           settingsRef.current.pointingUpStartTime = 0;
           
           if (settingsRef.current.isLoveGesture) {
               settingsRef.current.isLoveGesture = false;
               settingsRef.current.loveGestureStartTime = 0;
               setDensity(settingsRef.current.density);
               settingsRef.current.baseDensity = settingsRef.current.density;
           }
           
           if (settingsRef.current.isVictoryGesture) {
               settingsRef.current.isVictoryGesture = false;
               settingsRef.current.victoryGestureStartTime = 0;
               setLineThickness(settingsRef.current.lineThickness);
           }
      }
  };

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Setup Camera
  useEffect(() => {
    async function setupCamera() {
      if (!videoRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 1280 }, 
            height: { ideal: 720 },
            facingMode: 'user'
          }
        });
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.error("Error playing video:", e));
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    }
    setupCamera();
  }, []);

  // Drawing Loop
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let frameCount = 0;

    const draw = async () => {
      if (settingsRef.current.handsEnabled && handsRef.current && video.readyState === 4) {
          await handsRef.current.send({image: video});
      }

      requestRef.current = requestAnimationFrame(draw);

      if (video.readyState !== 4) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      if (!bufferCanvasRef.current) {
        bufferCanvasRef.current = document.createElement('canvas');
      }
      const bufCanvas = bufferCanvasRef.current;
      if (bufCanvas.width !== video.videoWidth || bufCanvas.height !== video.videoHeight) {
        bufCanvas.width = video.videoWidth;
        bufCanvas.height = video.videoHeight;
      }
      const bufCtx = bufCanvas.getContext('2d', { willReadFrequently: true });
      if (!bufCtx) return;

      bufCtx.save();
      bufCtx.translate(bufCanvas.width, 0);
      bufCtx.scale(-1, 1);
      bufCtx.drawImage(video, 0, 0);
      bufCtx.restore();

      const frameData = bufCtx.getImageData(0, 0, bufCanvas.width, bufCanvas.height);
      const data = frameData.data;
      const vw = frameData.width;
      const vh = frameData.height;

      let currentAudioLevel = 0;
      
      if (masterAnalyserRef.current && audioDataArrayRef.current) {
        masterAnalyserRef.current.getByteFrequencyData(audioDataArrayRef.current);
        let sum = 0;
        for (let i = 0; i < 20; i++) {
          sum += audioDataArrayRef.current[i];
        }
        currentAudioLevel = (sum / 20) / 255;
      }
      
      settingsRef.current.smoothedAudio += (currentAudioLevel - settingsRef.current.smoothedAudio) * 0.1;
      const audioImpulse = settingsRef.current.smoothedAudio;
      const sens = settingsRef.current.sensitivity / 100;

      const ratio = Math.max(width / vw, height / vh);
      const drawW = vw * ratio;
      const drawH = vh * ratio;
      const offX = (width - drawW) / 2;
      const offY = (height - drawH) / 2;

      const activePoints: any[] = [];
      if (settingsRef.current.handsEnabled && settingsRef.current.hasHands) {
          if (settingsRef.current.leftHand.active) activePoints.push(settingsRef.current.leftHand);
          if (settingsRef.current.rightHand.active) activePoints.push(settingsRef.current.rightHand);
      } else if (settingsRef.current.mouse.active) {
          activePoints.push(settingsRef.current.mouse);
      }
      
      activePoints.forEach(pt => {
          if (pt.dynamicRadius !== undefined) {
              const calculatedAmp = Math.min(100, Math.max(0, (pt.dynamicRadius / 250) * 100));
              pt.strength = calculatedAmp * 2;
              pt.currentAmp = calculatedAmp;
              pt.radius = 40 + pt.dynamicRadius; 
          } else {
              pt.strength = settingsRef.current.amplitude * 2;
              pt.currentAmp = settingsRef.current.amplitude;
              pt.radius = 150;
          }
      });

      // --- DENSITY MODULATION LOGIC (LOVE) ---
      if (settingsRef.current.isLoveGesture && settingsRef.current.loveGestureStartTime > 0) {
          const duration = Date.now() - settingsRef.current.loveGestureStartTime;
          if (duration > 1000) {
              if (settingsRef.current.leftHand.active) {
                  const dist = settingsRef.current.leftHand.dynamicRadius || 0;
                  let newDensity = Math.floor(10 + (dist / 300) * 190);
                  newDensity = Math.max(10, Math.min(200, newDensity));
                  settingsRef.current.density = newDensity;
              }
          }
      }
      
      // --- THICKNESS MODULATION LOGIC (VICTORY) ---
      if (settingsRef.current.isVictoryGesture && settingsRef.current.victoryGestureStartTime > 0) {
          const duration = Date.now() - settingsRef.current.victoryGestureStartTime;
          if (duration > 1000) {
              if (settingsRef.current.leftHand.active) {
                   const dist = settingsRef.current.leftHand.dynamicRadius || 0;
                   // Map Pinch 0-300 to Thickness 0.1 - 10.0
                   let newThick = 0.1 + (dist / 300) * 9.9;
                   newThick = Math.max(0.1, Math.min(10.0, newThick));
                   settingsRef.current.lineThickness = newThick;
              }
          }
      }

      // --- ROTATION LOGIC ---
      // Determine Target Rotation
      // Default: Vertical Mode = 90 deg (PI/2), Horizontal = 0
      let baseRotation = settingsRef.current.vertical ? Math.PI / 2 : 0;
      let targetRot = baseRotation;

      if (settingsRef.current.isPointingUp && settingsRef.current.pointingUpStartTime > 0) {
          const duration = Date.now() - settingsRef.current.pointingUpStartTime;
          if (duration > 1000) {
              // Rotation Controlled by Left Hand Pinch Angle
              if (settingsRef.current.leftHand.active) {
                  // Adjust angle so "Horizontal pinch" maps to 0 if that's the intent, or just raw angle.
                  // Raw angle: 0 = Horizontal right.
                  targetRot = settingsRef.current.leftHand.angle || 0;
              }
          }
      }

      // Smooth Rotation
      const rotDiff = targetRot - settingsRef.current.currentRotation;
      // Handle wrapping if needed? No, standard interpolation is fine here.
      settingsRef.current.currentRotation += rotDiff * 0.1;
      const currentRotation = settingsRef.current.currentRotation;

      // --- BACKGROUND HANDLING (VIDEO REVEAL) ---
      if (settingsRef.current.whiteBackground) {
          if (activePoints.length > 0) {
              if (!maskCanvasRef.current) maskCanvasRef.current = document.createElement('canvas');
              const maskCanvas = maskCanvasRef.current;
              if (maskCanvas.width !== width || maskCanvas.height !== height) {
                  maskCanvas.width = width;
                  maskCanvas.height = height;
              }
              const maskCtx = maskCanvas.getContext('2d');
              
              if (maskCtx) {
                  maskCtx.globalCompositeOperation = 'source-over';
                  maskCtx.fillStyle = 'white';
                  maskCtx.fillRect(0, 0, width, height);
                  
                  maskCtx.globalCompositeOperation = 'destination-out';
                  
                  activePoints.forEach(pt => {
                      const r = pt.dynamicRadius ? Math.max(20, pt.dynamicRadius) : settingsRef.current.revealRadius;
                      const grad = maskCtx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
                      grad.addColorStop(0, 'rgba(0, 0, 0, 1)'); 
                      grad.addColorStop(0.3, 'rgba(0, 0, 0, 1)');
                      grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.9)');
                      grad.addColorStop(0.85, 'rgba(0, 0, 0, 0.4)');
                      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                      maskCtx.fillStyle = grad;
                      maskCtx.beginPath();
                      maskCtx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
                      maskCtx.fill();
                  });
              }

              ctx.drawImage(bufCanvas, offX, offY, drawW, drawH);
              ctx.globalCompositeOperation = 'source-over'; 
              if (maskCanvas) {
                ctx.drawImage(maskCanvas, 0, 0);
              }
              
          } else {
              ctx.fillStyle = 'rgb(255, 255, 255)';
              ctx.fillRect(0, 0, width, height);
          }
      } else {
          ctx.drawImage(bufCanvas, offX, offY, drawW, drawH);
          if (activePoints.length > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen'; 
            activePoints.forEach(pt => {
               let r = 50; 
               if (pt.dynamicRadius !== undefined) {
                   r = 15 + (pt.dynamicRadius * 0.6);
               }
               const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
               grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)'); 
               grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.3)'); 
               grad.addColorStop(1, 'rgba(255, 255, 255, 0)'); 
               ctx.fillStyle = grad;
               ctx.beginPath();
               ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
               ctx.fill();
            });
            ctx.restore();
          }
      }

      // Draw Connection Line for Hands (Visualizing the pinch distance)
      if (settingsRef.current.handsEnabled) {
        ctx.save();
        activePoints.forEach(pt => {
            if (pt.thumbX !== undefined && pt.thumbY !== undefined && pt.dynamicRadius) {
                ctx.beginPath();
                ctx.moveTo(pt.x, pt.y); 
                ctx.lineTo(pt.thumbX, pt.thumbY); 
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]); 
                ctx.stroke();
                
                ctx.beginPath();
                ctx.arc(pt.thumbX, pt.thumbY, 3, 0, Math.PI*2);
                ctx.fillStyle = 'rgba(0,0,0,0.8)';
                ctx.fill();
                
                const midX = (pt.x + pt.thumbX) / 2;
                const midY = (pt.y + pt.thumbY) / 2;
                
                const dx = pt.thumbX - pt.x;
                const dy = pt.thumbY - pt.y;
                let angle = Math.atan2(dy, dx);
                let degrees = Math.round(angle * (180 / Math.PI));
                
                ctx.save();
                ctx.translate(midX, midY);
                if (Math.abs(angle) > Math.PI / 2) {
                    angle += Math.PI;
                }
                ctx.rotate(angle);
                ctx.fillStyle = lineColor;
                ctx.font = '9px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom'; 
                ctx.fillText(`AMP:${(pt.currentAmp || 0).toFixed(0)}`, 0, -5);
                ctx.textBaseline = 'top';
                ctx.fillText(`DEG:${degrees}`, 0, 5);
                ctx.restore();
            }
        });
        ctx.restore();
      }

      // --- THUMB UP GESTURE INDICATOR ---
      if (settingsRef.current.isThumbUp) {
          const elapsed = Date.now() - settingsRef.current.thumbUpStartTime;
          const progress = Math.min(1, elapsed / 1000);
          if (progress >= 1 && !settingsRef.current.thumbUpTriggered) {
               toggleBackground(); 
               settingsRef.current.thumbUpTriggered = true;
          }
          const sqSize = 14;
          const sqX = 30; 
          const sqY = 64; 
          ctx.save();
          ctx.strokeStyle = 'black';
          ctx.lineWidth = 1;
          ctx.strokeRect(sqX, sqY, sqSize, sqSize);
          ctx.fillStyle = 'black';
          const fillH = sqSize * progress;
          ctx.fillRect(sqX, sqY + (sqSize - fillH), sqSize, fillH);
          ctx.font = '9px monospace';
          ctx.fillStyle = 'black';
          ctx.textBaseline = 'middle';
          ctx.fillText('SW_BG', sqX + sqSize + 5, sqY + sqSize / 2);
          ctx.restore();
      }

      // --- ROTATION LOCK GESTURE INDICATOR (TRIANGLE) ---
      if (settingsRef.current.isPointingUp) {
          const elapsed = Date.now() - settingsRef.current.pointingUpStartTime;
          const progress = Math.min(1, elapsed / 1000);
          
          const triSize = 14;
          const triX = 30;
          const triY = 64 + 24; // 24px below SW_BG
          
          ctx.save();
          ctx.strokeStyle = 'black';
          ctx.lineWidth = 1;
          
          const topX = triX + triSize/2;
          const topY = triY;
          const botLeftX = triX;
          const botLeftY = triY + triSize;
          const botRightX = triX + triSize;
          const botRightY = triY + triSize;
          
          ctx.beginPath();
          ctx.moveTo(topX, topY);
          ctx.lineTo(botRightX, botRightY);
          ctx.lineTo(botLeftX, botLeftY);
          ctx.closePath();
          ctx.stroke();
          
          if (progress > 0) {
              ctx.save();
              ctx.clip(); 
              ctx.fillStyle = 'black';
              const fillH = triSize * progress;
              ctx.fillRect(triX, triY + (triSize - fillH), triSize, fillH);
              ctx.restore();
          }
          
          ctx.font = '9px monospace';
          ctx.fillStyle = 'black';
          ctx.textBaseline = 'middle';
          ctx.fillText('ROT_LOCK', triX + triSize + 5, triY + triSize / 2);
          
          ctx.restore();
      }

      // --- DENSITY MODULATION INDICATOR (HEART) ---
      if (settingsRef.current.isLoveGesture) {
           const elapsed = Date.now() - settingsRef.current.loveGestureStartTime;
           const progress = Math.min(1, elapsed / 1000);

           const heartSize = 14;
           const hX = 30;
           const hY = 64 + 24 + 24; // Below triangle
           
           ctx.save();
           ctx.strokeStyle = 'black';
           ctx.lineWidth = 1;
           
           // Heart Path
           const topCurveHeight = heartSize * 0.3;
           ctx.beginPath();
           ctx.moveTo(hX + heartSize / 2, hY + topCurveHeight);
           ctx.bezierCurveTo(
               hX + heartSize / 2, hY, 
               hX, hY, 
               hX, hY + topCurveHeight
           );
           ctx.bezierCurveTo(
               hX + heartSize / 2, hY + (heartSize + topCurveHeight) / 2, 
               hX + heartSize / 2, hY + heartSize, 
               hX + heartSize / 2, hY + heartSize
           );
           ctx.bezierCurveTo(
               hX + heartSize / 2, hY + heartSize, 
               hX + heartSize, hY + (heartSize + topCurveHeight) / 2, 
               hX + heartSize, hY + topCurveHeight
           );
           ctx.bezierCurveTo(
               hX + heartSize, hY, 
               hX + heartSize / 2, hY, 
               hX + heartSize / 2, hY + topCurveHeight
           );
           ctx.stroke();

           // Fill
           if (progress > 0) {
               ctx.save();
               ctx.clip();
               ctx.fillStyle = 'black';
               const fillH = heartSize * progress;
               ctx.fillRect(hX, hY + (heartSize - fillH), heartSize, fillH);
               ctx.restore();
           }

           ctx.font = '9px monospace';
           ctx.fillStyle = 'black';
           ctx.textBaseline = 'middle';
           ctx.fillText('DENSITY_MOD', hX + heartSize + 5, hY + heartSize / 2);
           ctx.restore();
      }

      // --- THICKNESS MODULATION INDICATOR (CIRCLE) ---
      if (settingsRef.current.isVictoryGesture) {
           const elapsed = Date.now() - settingsRef.current.victoryGestureStartTime;
           const progress = Math.min(1, elapsed / 1000);

           const circSize = 14;
           const cX = 30;
           const cY = 64 + 24 + 24 + 24; // Below Heart
           
           ctx.save();
           ctx.strokeStyle = 'black';
           ctx.lineWidth = 1;
           ctx.beginPath();
           ctx.arc(cX + circSize/2, cY + circSize/2, circSize/2, 0, Math.PI * 2);
           ctx.stroke();

           // Fill (Bottom Up)
           if (progress > 0) {
               ctx.save();
               ctx.clip(); // Clip to circle
               ctx.fillStyle = 'black';
               const fillH = circSize * progress;
               ctx.fillRect(cX, cY + (circSize - fillH), circSize, fillH);
               ctx.restore();
           }

           ctx.font = '9px monospace';
           ctx.fillStyle = 'black';
           ctx.textBaseline = 'middle';
           ctx.fillText('THICK_MOD', cX + circSize + 5, cY + circSize / 2);
           ctx.restore();
      }
      
      // --- LINESCAN DRAWING (ROTATABLE) ---
      ctx.lineCap = 'round';
      const currentDensity = settingsRef.current.density;
      const currentThickness = settingsRef.current.lineThickness;
      const currentColor = settingsRef.current.lineColor; 
      
      const cx = width / 2;
      const cy = height / 2;
      const diag = Math.sqrt(width * width + height * height);
      
      // Setup Rotation
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(currentRotation);
      
      const lineHeight = height / currentDensity; // Base density spacing
      const lineSpan = 10;
      
      const start = -diag / 2;
      const end = diag / 2;
      
      const cosR = Math.cos(currentRotation);
      const sinR = Math.sin(currentRotation);

      // Iterate relative to center
      for (let ly = start; ly <= end; ly += lineHeight) {
          let pCol = 1;
          
          // Default stroke style
          ctx.strokeStyle = currentColor;
          
          for (let lx = start; lx <= end; lx += lineSpan) {
              
              // 1. Transform Local(lx, ly) -> Global(screenX, screenY) for color sampling
              // Rotate by +Rotation, then translate +Center
              const screenX = Math.floor(lx * cosR - ly * sinR + cx);
              const screenY = Math.floor(lx * sinR + ly * cosR + cy);

              // 2. Sample Video Color
              // Map screen coord to video buffer coord
              const vx = Math.floor((screenX - width / 2) / ratio + vw / 2);
              const vy = Math.floor(vh / 2 - (height / 2 - screenY) / ratio);
              
              let col = 0;
              if (vx >= 0 && vx < vw && vy >= 0 && vy < vh) {
                  const index = (vy * vw + vx) * 4;
                  const br = Math.max(data[index], data[index + 1], data[index + 2]);
                  col = 1 - (br / 255);
              }
              col = Math.pow(col, 4);
              
              let sw = col * (lineHeight * 0.5 - 0.01) + 0.01;

              // Noise (Sample in local space so it rotates with lines)
              const nVal = noise(lx + frameCount / 10000, ly);
              const noiseInfluence = 0.05 + (audioImpulse * sens * 0.5); 
              sw += (nVal - 0.5) * lineHeight * noiseInfluence;
              const beatJitter = (audioImpulse * sens * 40) * (nVal - 0.5); 
              
              let totalPushOffset = 0;
              let totalPluckJitter = 0;

              // 3. Interaction with Hands
              activePoints.forEach(pt => {
                  // Transform Point(screen) -> Local(plx, ply)
                  // Translate -Center, Rotate -Rotation
                  const dxS = pt.x - cx;
                  const dyS = pt.y - cy;
                  // Inverse rotation
                  const plx = dxS * cosR + dyS * sinR;
                  const ply = -dxS * sinR + dyS * cosR;

                  const localStrength = pt.strength || 0;
                  const localRadius = pt.radius || 150;
                  
                  // Distance in local space
                  const ddx = lx - plx;
                  const ddy = ly - ply;
                  
                  if (Math.abs(ddx) < localRadius && Math.abs(ddy) < localRadius) {
                       const distSq = ddx*ddx + ddy*ddy;
                       if (distSq < localRadius * localRadius) {
                           const dist = Math.sqrt(distSq);
                           const force = Math.pow((localRadius - dist) / localRadius, 2) * localStrength;
                           // Push direction is Y-relative to the line (perpendicular to scan dir)
                           // Our scan lines are along X (lx), spacing along Y (ly)
                           // So push happens in Y direction
                           const dirY = ddy / (dist || 1);
                           totalPushOffset += dirY * force;
                       }
                  }
                  
                  // Pluck (Synth Trigger Visualization)
                  if (settingsRef.current.instrumentEnabled) {
                      // Check if this line (ly) is being touched
                      // Approximate check in local Y
                      if (Math.abs(ly - ply) < (lineHeight/2 + 5)) {
                           const dist = Math.abs(lx - plx);
                           const attenuation = Math.max(0, 1 - dist / 400);
                           const jitterAmp = (localStrength / 100) * 0.4;
                           totalPluckJitter += (Math.sin(lx * 0.1 + frameCount * 0.5) * lineHeight * jitterAmp) * attenuation;
                           sw += attenuation * 2;
                      }
                  }
              });

              // Apply offsets to Y (perpendicular to line direction)
              const y1 = ly + 30 * pCol + beatJitter + totalPluckJitter + totalPushOffset;
              const y2 = ly + 30 * col + beatJitter + totalPluckJitter + totalPushOffset;
              
              const calculatedThickness = Math.max(0.1, sw * currentThickness);
              ctx.lineWidth = calculatedThickness;

              ctx.strokeStyle = currentColor;
              ctx.shadowBlur = 0;

              ctx.beginPath();
              ctx.moveTo(lx, y1);
              ctx.lineTo(lx + lineSpan, y2);
              ctx.stroke();

              pCol = col;
          }
      }
      ctx.restore(); // Restore from rotation

      // --- CURSOR VISUALS (Wave Animation + Guides) ---
      if (activePoints.length > 0) {
        ctx.save();
        activePoints.forEach(pt => {
           let type = "GENERIC";
           if (pt === settingsRef.current.rightHand && settingsRef.current.backingTrackLoaded) type = "RHYTHM";
           else if (pt === settingsRef.current.leftHand || pt === settingsRef.current.mouse) type = "MELODY";
           
           ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
           ctx.fillStyle = 'rgba(0, 0, 0, 1)';
           ctx.lineWidth = 1;
           ctx.setLineDash([2, 4]);
           ctx.beginPath();
           ctx.moveTo(pt.x, 0); ctx.lineTo(pt.x, height); 
           ctx.moveTo(0, pt.y); ctx.lineTo(width, pt.y);
           ctx.stroke();
           ctx.setLineDash([]);
           
           if (type === 'RHYTHM') {
                const speedVal = 0.5 + ((1 - (pt.y/height)) * 1.5); 
                const time = Date.now() / 1000;
                const pulse = (Math.sin(time * speedVal * 8) + 1) / 2; 
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 16 + (pulse * 8), 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(0, 0, 0, ${0.3 + pulse * 0.4})`;
                ctx.lineWidth = 1.5;
                ctx.stroke();
           }
        });
        ctx.restore();
      }

      // 2. Draw Wave Cursor
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      activePoints.forEach(pt => {
          ctx.beginPath();
          const segments = 90;
          const baseR = 24; 
          const amp = 3 + (audioImpulse * 20); 
          const waveCount = 3 + (audioImpulse * 15); 
          const speed = frameCount * 0.15;

          for (let i = 0; i <= segments; i++) {
              const theta = (i / segments) * Math.PI * 2;
              const wave = Math.sin(theta * waveCount + speed) * amp;
              const nx = Math.cos(theta) + (pt.x * 0.01) + (frameCount * 0.02);
              const ny = Math.sin(theta) + (pt.y * 0.01) + (frameCount * 0.02);
              const n = noise(nx, ny);
              const noiseVal = (n - 0.5) * (5 + audioImpulse * 10);
              const r = baseR + wave + noiseVal;
              const px = pt.x + Math.cos(theta) * r;
              const py = pt.y + Math.sin(theta) * r;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
      });
      
      frameCount++;
    };

    requestRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(requestRef.current);
    };
  }, [dimensions]);

  return (
    <div 
        className="fixed inset-0 overflow-hidden bg-white font-sans text-black cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
    >
        <video
            ref={videoRef}
            className="hidden"
            playsInline
            muted
            autoPlay
        />
        <canvas
            ref={canvasRef}
            width={dimensions.width}
            height={dimensions.height}
            className="block"
        />

        {/* --- ARTISTIC UI OVERLAY --- */}
        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileLoad} 
            className="hidden" 
            accept="audio/*,video/*"
        />

        <div 
            className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-black flex items-center justify-between px-6 z-50"
            onMouseMove={(e) => e.stopPropagation()} 
        >
            <div className="flex items-center space-x-4">
                <div 
                    onClick={toggleBackground}
                    className="w-3 h-3 bg-black cursor-pointer hover:scale-125 transition-transform"
                    title="Toggle Background"
                ></div>
                <h1 className="text-2xl font-bold tracking-tight whitespace-nowrap" style={{ fontFamily: '"DIN Condensed", "Oswald", sans-serif' }}>AOE studio</h1>
            </div>

            <div className="hidden md:flex items-center space-x-6 font-mono text-xs">
                {/* Sliders... */}
                <div className="flex items-center space-x-2 group">
                    <label className="uppercase tracking-widest text-[0.6rem]">Density</label>
                    <div className="relative w-16 h-4 flex items-center">
                         <input
                            type="range"
                            min="10"
                            max="200"
                            step="1"
                            value={density}
                            onChange={handleDensityChange}
                            className="w-full h-[1px] bg-black appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black"
                         />
                    </div>
                </div>

                <div className="w-[1px] h-4 bg-black opacity-20"></div>

                 <div className="flex items-center space-x-2 group">
                    <label className="uppercase tracking-widest text-[0.6rem]">Thick</label>
                    <div className="relative w-16 h-4 flex items-center">
                         <input
                            type="range"
                            min="0.1"
                            max="5.0"
                            step="0.1"
                            value={lineThickness}
                            onChange={handleThicknessChange}
                            className="w-full h-[1px] bg-black appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black"
                         />
                    </div>
                </div>

                <div className="w-[1px] h-4 bg-black opacity-20"></div>

                <div className="flex items-center space-x-2 group">
                    <label className="uppercase tracking-widest text-[0.6rem]">Track Vol</label>
                    <div className="relative w-16 h-4 flex items-center">
                         <input
                            type="range"
                            min="0"
                            max="1.5"
                            step="0.1"
                            value={volTrack}
                            onChange={handleTrackVolChange}
                            className="w-full h-[1px] bg-black appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black"
                         />
                    </div>
                </div>

                <div className="flex items-center space-x-2 group">
                    <label className="uppercase tracking-widest text-[0.6rem]">Heal Vol</label>
                    <div className="relative w-16 h-4 flex items-center">
                         <input
                            type="range"
                            min="0"
                            max="1.0"
                            step="0.1"
                            value={volSynth}
                            onChange={handleSynthVolChange}
                            className="w-full h-[1px] bg-black appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black"
                         />
                    </div>
                </div>

                <div className="w-[1px] h-4 bg-black opacity-20"></div>

                <div className="flex items-center space-x-2 group">
                    <label className="uppercase tracking-widest text-[0.6rem]">Mask</label>
                    <div className="relative w-16 h-4 flex items-center">
                         <input
                            type="range"
                            min="50"
                            max="500"
                            step="10"
                            value={revealRadius}
                            onChange={handleRevealChange}
                            className="w-full h-[1px] bg-black appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black"
                         />
                    </div>
                </div>

                <div className="flex items-center space-x-2 group">
                    <label className="uppercase tracking-widest text-[0.6rem]">Amp</label>
                    <div className="relative w-16 h-4 flex items-center">
                         <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={amplitude}
                            onChange={handleAmplitudeChange}
                            className="w-full h-[1px] bg-black appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black"
                         />
                    </div>
                </div>
                
                 <div className={`flex items-center space-x-2 transition-opacity duration-300 ${instrumentEnabled || backingTrackLoaded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                     <label className="uppercase tracking-widest text-[0.6rem]">SENS</label>
                     <div className="relative w-16 h-4 flex items-center">
                        <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={sensitivity}
                            onChange={handleSensitivityChange}
                            className="w-full h-[1px] bg-black appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black"
                        />
                     </div>
                </div>
            </div>

            <div className="flex items-center space-x-2 font-mono text-[0.65rem] font-bold tracking-wider">
                 {/* Orientation Toggle: Vertical (|||) / Horizontal (===) */}
                 <button 
                    onClick={toggleVertical}
                    className="h-8 w-8 border border-black hover:bg-black hover:text-white transition-all flex items-center justify-center"
                    title={vertical ? "Set Horizontal" : "Set Vertical"}
                 >
                    {vertical ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 3v18M8 3v18M16 3v18"/></svg>
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 12h18M3 8h18M3 16h18"/></svg>
                    )}
                 </button>
                 
                 {/* File Upload: Upload Icon or Music Note when Loaded */}
                 <button 
                    onClick={() => fileInputRef.current?.click()}
                    className={`h-8 w-8 border border-black transition-all flex items-center justify-center ${backingTrackLoaded ? 'bg-black text-white' : 'hover:bg-black hover:text-white'}`}
                    title="Load Audio Track"
                 >
                    {backingTrackLoaded ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    )}
                 </button>

                 {/* Instrument: Pulse Icon */}
                 <button 
                    onClick={toggleInstrument}
                    className={`h-8 w-8 border border-black transition-all flex items-center justify-center ${instrumentEnabled ? 'bg-black text-white' : 'hover:bg-black hover:text-white'}`}
                    title="Healing Audio Mode"
                 >
                    {instrumentEnabled ? (
                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    ) : (
                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    )}
                 </button>

                 {/* Hand Tracking: Hand Icon */}
                 <button 
                    onClick={toggleHands}
                    className={`h-8 w-8 border border-black transition-all flex items-center justify-center ${handsEnabled ? 'bg-black text-white' : 'hover:bg-black hover:text-white'}`}
                    title="Hand Tracking"
                 >
                    {handsEnabled ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5l2.75 8h10.5L20 16v-5a2 2 0 0 0-2-2v0z"/></svg>
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5l2.75 8h10.5L20 16v-5a2 2 0 0 0-2-2v0z"/></svg>
                    )}
                 </button>
            </div>
        </div>

        {/* --- DECORATIVE ELEMENTS --- */}

        <div className="fixed right-6 bottom-20 z-40 font-mono text-[0.6rem] text-black tracking-widest writing-vertical-rl pointer-events-none select-none opacity-60">
             POS_X: {mousePos.x.toFixed(0).padStart(4, '0')} // POS_Y: {mousePos.y.toFixed(0).padStart(4, '0')}
        </div>
        
        <div className="fixed bottom-0 left-0 right-0 h-8 border-t border-black bg-white flex items-center justify-between px-6 font-mono text-[0.6rem] uppercase tracking-wider z-40 select-none">
            <div className="flex space-x-8">
                {handsEnabled ? (
                  <span className="flex space-x-4 text-black">
                     <span>👍:BG</span>
                     <span>☝️:ROT</span>
                     <span>🤟:DNS</span>
                     <span>✌️:THK</span>
                  </span>
                ) : (
                  <>
                    <span>System: Active</span>
                    <span>Mode: {instrumentEnabled ? 'Audio_Reactive' : 'Visual_Only'}</span>
                  </>
                )}
                <div className="flex items-center space-x-2 pointer-events-auto">
                    <span>COLOR:</span>
                    <input 
                        type="text" 
                        value={lineColor}
                        onChange={handleColorChange}
                        className="w-16 bg-transparent border-b border-black outline-none text-center font-mono text-[0.6rem] uppercase"
                    />
                    <div className="w-2 h-2 border border-black" style={{ backgroundColor: lineColor }}></div>
                </div>
            </div>
            <div className="flex space-x-8">
                <span>Input: {handsEnabled ? 'MediaPipe_Hands_v1' : 'Mouse_Pointer'}</span>
                <span>Track: {backingTrackLoaded ? 'External_File' : 'Internal_Synth'}</span>
                <span>Res: {dimensions.width}x{dimensions.height}</span>
            </div>
        </div>

    </div>
  );
}