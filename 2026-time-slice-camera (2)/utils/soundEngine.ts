// Simple Web Audio API Synthesizer for Nature Sounds

export class SoundEngine {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  
  // Throttle control to prevent sound chaos
  lastDropTime: number = 0;
  lastBellTime: number = 0;
  lastClopTime: number = 0;
  lastPanTime: number = 0;

  // Ocean Ambience State
  oceanSource: AudioBufferSourceNode | null = null;
  oceanGain: GainNode | null = null;
  isOceanPlaying: boolean = false;

  constructor() {
    try {
      const CtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (CtxClass) {
        this.ctx = new CtxClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.gain.value = 0.4; // Global volume
      }
    } catch (e) {
      console.warn("Web Audio API not supported");
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // --- 0. Freeze Sound (Dreamy Piano Chord) ---
  // Replaces the mechanical shutter sound
  playFreezeChord() {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;

    // C Major 9 (C, E, G, B, D) - Dreamy and open
    const notes = [261.63, 329.63, 392.00, 493.88, 587.33];
    
    notes.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        
        // Use Triangle wave for a "piano-like" body, or Sine for "Rhodes-like"
        osc.type = 'triangle';
        osc.frequency.value = freq;

        osc.connect(gain);
        gain.connect(this.masterGain!);

        // Strum effect: slightly offset start times (30ms apart)
        const startTime = t + (i * 0.03);
        const duration = 2.0;

        // Envelope: ADSR
        gain.gain.setValueAtTime(0, startTime);
        // Attack (Hammer hit)
        gain.gain.linearRampToValueAtTime(0.4 / notes.length, startTime + 0.02);
        // Decay to Sustain
        gain.gain.exponentialRampToValueAtTime(0.1 / notes.length, startTime + 0.3);
        // Release (Long tail)
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.start(startTime);
        osc.stop(startTime + duration);
    });
  }

  // --- 1. Water Drop (Sine sweep) ---
  playWaterDrop(intensity: number = 1.0) {
    if (!this.ctx || !this.masterGain) return;
    
    const now = this.ctx.currentTime;
    if (now - this.lastDropTime < 0.1) return; 
    this.lastDropTime = now;

    const t = now;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.type = 'sine';
    const startFreq = 600 + Math.random() * 400; 
    const endFreq = 200 + Math.random() * 100;
    
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + 0.2);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(intensity * 0.5, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.start(t);
    osc.stop(t + 0.3);
  }

  // --- 2. Distant Bell (FM Synthesis) ---
  playDistantBell(intensity: number = 1.0) {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    if (now - this.lastBellTime < 0.15) return;
    this.lastBellTime = now;

    const t = now;
    const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
    const fundamental = scale[Math.floor(Math.random() * scale.length)];
    const duration = 2.5; 

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.frequency.value = fundamental;
    osc2.frequency.value = fundamental * 1.5;

    osc1.type = 'sine';
    osc2.type = 'sine';

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(intensity * 0.3, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + duration);
    osc2.stop(t + duration);
  }

  // --- 3. Wind / Rustle (Filtered Noise) ---
  playWindBurst(intensity: number = 1.0) {
    if (!this.ctx || !this.masterGain) return;
    
    const t = this.ctx.currentTime;
    const duration = 0.5;
    const buffer = this.createNoiseBuffer(duration);
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.linearRampToValueAtTime(800 * intensity, t + 0.2); 
    filter.frequency.linearRampToValueAtTime(200, t + duration);

    const gain = this.ctx.createGain();
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(intensity * 0.2, t + 0.1);
    gain.gain.linearRampToValueAtTime(0, t + duration);

    noise.start(t);
  }

  // --- 4. Handpan / Hang Drum (FM Synthesis) ---
  // Uses Frequency Modulation to create metallic, resonant tones
  playHandpanNote(normalizedX: number, normalizedY: number, intensity: number = 1.0) {
     if (!this.ctx || !this.masterGain) return;

     // Limit polyphony
     const now = this.ctx.currentTime;
     if (now - this.lastPanTime < 0.08) return; 
     this.lastPanTime = now;

     const t = now;
     
     // Pentatonic Scale (D Minor Pentatonicish): D3, F3, G3, A3, C4, D4, F4, G4
     const scale = [146.83, 174.61, 196.00, 220.00, 261.63, 293.66, 349.23, 392.00];
     
     // Map X to note index
     const noteIdx = Math.floor(normalizedX * scale.length);
     const safeIdx = Math.max(0, Math.min(noteIdx, scale.length - 1));
     const freq = scale[safeIdx];

     // Carrier (The fundamental tone)
     const carrier = this.ctx.createOscillator();
     carrier.frequency.value = freq;
     
     // Modulator (Creates the metallic overtones)
     const modulator = this.ctx.createOscillator();
     // Handpan usually has non-integer harmonic ratios for that "misty" sound
     const harmonicRatio = 2.0 + (normalizedY * 0.5); // Y changes the timbre slightly
     modulator.frequency.value = freq * harmonicRatio;

     // Modulation Gain (How strong the metallic ringing is)
     const modGain = this.ctx.createGain();
     modGain.gain.value = freq * 0.5; // Modulation index

     const outputGain = this.ctx.createGain();
     
     // FM Routing: Modulator -> ModGain -> Carrier.frequency
     modulator.connect(modGain);
     modGain.connect(carrier.frequency);
     
     carrier.connect(outputGain);
     outputGain.connect(this.masterGain);

     // Envelope
     outputGain.gain.setValueAtTime(0, t);
     outputGain.gain.linearRampToValueAtTime(intensity * 0.6, t + 0.01); // Instant attack
     // Long decay for resonant handpan feel
     outputGain.gain.exponentialRampToValueAtTime(0.001, t + 1.5); 

     carrier.start(t);
     modulator.start(t);
     carrier.stop(t + 1.5);
     modulator.stop(t + 1.5);
  }

  // --- 5. Horse Clop (Woodblock-ish) ---
  // Bandpass filtered square/noise wave
  playHorseClop(intensity: number = 1.0) {
      if (!this.ctx || !this.masterGain) return;
      
      const now = this.ctx.currentTime;
      // Rhythm check: Don't trigger too fast
      if (now - this.lastClopTime < 0.15) return;
      this.lastClopTime = now;
      
      const t = now;

      // Create a noise burst or square wave
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle'; // Triangle gives a hollower sound than square
      osc.frequency.setValueAtTime(800, t); // Base pitch
      osc.frequency.exponentialRampToValueAtTime(400, t + 0.1); // Pitch drop

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1000;
      filter.Q.value = 1.0;

      const gain = this.ctx.createGain();
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      // Short, percussive envelope
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(intensity * 0.7, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

      osc.start(t);
      osc.stop(t + 0.1);
  }

  // --- 6. Ocean Ambience (Pink Noise + LFO Filter) ---
  startOceanSound() {
      if (!this.ctx || !this.masterGain || this.isOceanPlaying) return;

      // 1. Create Pink Noise Buffer (looping 5 seconds)
      const bufferLen = 5.0;
      const buffer = this.createNoiseBuffer(bufferLen); // Reusing white noise for simplicity, works for waves if filtered
      
      this.oceanSource = this.ctx.createBufferSource();
      this.oceanSource.buffer = buffer;
      this.oceanSource.loop = true;

      // 2. Filter for wave crashing effect
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;

      // 3. LFO to modulate filter (The "Waves")
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.15; // Slow wave roughly every 7 seconds
      
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 300; // Modulate frequency by +/- 300Hz

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      // 4. Volume Gain
      this.oceanGain = this.ctx.createGain();
      this.oceanGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.oceanGain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 2); // Fade in soft

      this.oceanSource.connect(filter);
      filter.connect(this.oceanGain);
      this.oceanGain.connect(this.masterGain);

      this.oceanSource.start();
      lfo.start();
      
      // Store LFO ref to stop it? For simple cleanup we just disconnect graph usually, 
      // but strictly we should stop nodes. 
      // Simplified: We will just stop oceanSource and disconnect gain.
      
      this.isOceanPlaying = true;
  }

  stopOceanSound() {
      if (!this.isOceanPlaying || !this.ctx) return;

      const t = this.ctx.currentTime;
      
      // Fade out
      if (this.oceanGain) {
          this.oceanGain.gain.cancelScheduledValues(t);
          this.oceanGain.gain.setValueAtTime(this.oceanGain.gain.value, t);
          this.oceanGain.gain.linearRampToValueAtTime(0, t + 1.0);
      }

      setTimeout(() => {
          if (this.oceanSource) {
              try { this.oceanSource.stop(); } catch(e) {}
              this.oceanSource.disconnect();
          }
          if (this.oceanGain) this.oceanGain.disconnect();
          this.oceanSource = null;
          this.oceanGain = null;
          this.isOceanPlaying = false;
      }, 1100);
  }

  private createNoiseBuffer(duration: number): AudioBuffer | null {
      if (!this.ctx) return null;
      const bufferSize = this.ctx.sampleRate * duration;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        // Simple white noise
        data[i] = Math.random() * 2 - 1;
      }
      return buffer;
  }
}