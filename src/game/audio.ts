import type { BiomeId, SurfaceType, WeaponId } from './types';

export type MusicMode = 'none' | 'menu' | 'forest' | 'boss';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private driveNode: WaveShaperNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  private muted = false;
  private musicVolume = 0.72;
  private sfxVolume = 0.85;
  private musicMode: MusicMode = 'none';
  private biomeId: BiomeId = 'pine_forest';
  private combatIntensity = 0.35;
  private musicTimer: number | null = null;
  private ambientChirpTimer: number | null = null;
  private stepIndex = 0;
  private nextNoteTime = 0;

  public isMuted(): boolean {
    return this.muted;
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }

  public setCombatIntensity(intensity: number): void {
    this.combatIntensity = Math.max(0, Math.min(1, intensity));
  }

  public setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicVolume * 0.68, this.ctx.currentTime, 0.04);
    }
  }

  public setSfxVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVolume * 0.78, this.ctx.currentTime, 0.04);
    }
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(this.sfxVolume * 0.3, this.ctx.currentTime, 0.04);
    }
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.8, this.ctx.currentTime, 0.04);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private createSaturationCurve(amount: number): Float32Array<ArrayBuffer> {
    const samples = 1024;
    const curve = new Float32Array(new ArrayBuffer(samples * 4));
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  public unlock(fromUserGesture = true): void {
    if (typeof window === 'undefined') return;
    if (!fromUserGesture && !this.ctx) return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.8;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume * 0.68;
      this.musicGain.connect(this.masterGain);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = this.sfxVolume * 0.3;
      this.ambientGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume * 0.78;
      this.sfxGain.connect(this.masterGain);

      this.driveNode = this.ctx.createWaveShaper();
      this.driveNode.curve = this.createSaturationCurve(28);
      this.driveNode.oversample = '2x';
      const driveOut = this.ctx.createGain();
      driveOut.gain.value = 0.85;
      this.driveNode.connect(driveOut);
      driveOut.connect(this.sfxGain);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
      this.startForestWindLoop();
    }

    if (this.ctx && this.ctx.state === 'suspended' && fromUserGesture) {
      void this.ctx.resume().then(() => {
        if (this.ctx && this.musicMode !== 'none') {
          this.nextNoteTime = this.ctx.currentTime + 0.03;
          this.schedulerTick();
        }
      });
    }
    if (this.ctx && this.musicMode !== 'none') {
      if (this.nextNoteTime < this.ctx.currentTime) {
        this.nextNoteTime = this.ctx.currentTime + 0.03;
      }
      if (this.ctx.state === 'running') {
        this.schedulerTick();
      }
    }
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.1848) * 0.2));
    }
    return buffer;
  }

  private startForestWindLoop(): void {
    if (!this.ctx || !this.noiseBuffer || !this.ambientGain || this.windSource) return;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.85;

    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.14;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const windGain = this.ctx.createGain();
    windGain.gain.value = 0.0001;

    src.connect(filter);
    filter.connect(windGain);
    windGain.connect(this.ambientGain);

    src.start();
    lfo.start();

    this.windSource = src;
    this.windFilter = filter;
    this.windGain = windGain;
  }

  public setBiome(biomeId: BiomeId): void {
    this.biomeId = biomeId;
    if (this.windFilter && this.ctx) {
      const freqMap: Record<BiomeId, number> = {
        pine_forest: 440,
        misty_swamp: 280,
        birch_hollow: 490,
        autumn_trail: 580,
        foggy_moor: 350,
        winter_woods: 680,
        frozen_lake: 760,
        cursed_graveyard: 340,
        fungal_grove: 310,
        thorny_thicket: 460,
        obsidian_canyon: 300,
        ash_ruins: 320,
        scorched_fort: 380,
        abyss_rift: 260,
        plague_heart: 270,
        blood_citadel: 240,
      };
      this.windFilter.frequency.setTargetAtTime(freqMap[biomeId], this.ctx.currentTime, 0.5);
    }
  }

  public setMusicMode(mode: MusicMode): void {
    if (this.musicMode === mode) return;
    this.musicMode = mode;

    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ambientChirpTimer !== null) {
      window.clearInterval(this.ambientChirpTimer);
      this.ambientChirpTimer = null;
    }

    this.stepIndex = 0;

    if (this.windGain && this.ctx) {
      const targetWind =
        mode === 'forest' ? 0.34 : mode === 'menu' ? 0.28 : mode === 'boss' ? 0.16 : 0.0001;
      this.windGain.gain.setTargetAtTime(targetWind, this.ctx.currentTime, 0.35);
    }

    if (mode === 'menu' || mode === 'forest' || mode === 'boss') {
      if (this.ctx) {
        this.nextNoteTime = this.ctx.currentTime + 0.03;
      }
      // Precision Web Audio lookahead scheduler (sample-accurate clock, zero rhythm drift)
      this.musicTimer = window.setInterval(() => this.schedulerTick(), 25);
      if (this.ctx && this.ctx.state === 'running') {
        this.schedulerTick();
      }
    }

    if (mode === 'menu') {
      this.ambientChirpTimer = window.setInterval(() => this.tickForestAmbience(), 3400);
    } else if (mode === 'forest') {
      this.ambientChirpTimer = window.setInterval(() => this.tickForestAmbience(), 3200);
    }
  }

  private schedulerTick(): void {
    if (!this.ctx || !this.musicGain || this.muted || this.ctx.state !== 'running') return;
    if (this.musicMode !== 'menu' && this.musicMode !== 'forest' && this.musicMode !== 'boss') return;

    const lookahead = 0.16;
    const stepDur =
      this.musicMode === 'menu' ? 0.19 : this.musicMode === 'forest' ? 0.136 : 0.125;

    // Resync gracefully if tab was backgrounded
    if (this.nextNoteTime < this.ctx.currentTime - 0.15) {
      this.nextNoteTime = this.ctx.currentTime + 0.03;
    }

    let steps = 0;
    while (this.nextNoteTime < this.ctx.currentTime + lookahead && steps < 16) {
      if (this.musicMode === 'menu') {
        this.scheduleMenuStep(this.nextNoteTime, this.stepIndex, stepDur);
      } else if (this.musicMode === 'forest') {
        this.scheduleForestCombatStep(this.nextNoteTime, this.stepIndex, stepDur);
      } else {
        this.scheduleBossStep(this.nextNoteTime, this.stepIndex, stepDur);
      }
      this.nextNoteTime += stepDur;
      this.stepIndex += 1;
      steps += 1;
    }

    if (steps >= 16 && this.nextNoteTime < this.ctx.currentTime) {
      this.nextNoteTime = this.ctx.currentTime + 0.04;
    }
  }

  private playPadTone(
    freq: number,
    type: OscillatorType,
    startTime: number,
    duration: number,
    volume: number,
    dest: AudioNode,
    cutoff?: number
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    // Smooth crossfading sustain envelope so pads never drop out between bars
    const attack = Math.min(0.18, duration * 0.15);
    const releaseStart = Math.max(startTime + attack, startTime + duration - 0.35);
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + attack);
    gain.gain.setValueAtTime(volume, releaseStart);
    gain.gain.linearRampToValueAtTime(0.001, startTime + duration);

    if (cutoff) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.03);
  }

  private scheduleMenuStep(t: number, rawStep: number, stepDur: number): void {
    if (!this.musicGain) return;
    const step = rawStep % 64;
    const bar = Math.floor(step / 16);
    const local = step % 16;
    const barDur = stepDur * 16;

    // Tense dark-survival Phrygian progression: Dm -> Eb(sus) -> Gm/D -> A7b9
    const roots = [73.42, 77.78, 65.41, 55.0];
    const padChords = [
      [146.83, 220.0, 277.18], // Dm(maj7) dark tension
      [155.56, 220.0, 293.66], // Eb lydian / Phrygian clash
      [130.81, 196.0, 233.08], // Cm7
      [110.0, 174.61, 220.0],  // A7b9 ominous turnaround
    ];
    const root = roots[bar];
    const chord = padChords[bar];

    // 1. Deep ominous brooding drone + tense dark string pad
    if (local === 0) {
      this.playPadTone(root, 'sawtooth', t, barDur + 0.25, 0.17, this.musicGain, 320);
      this.playPadTone(chord[1], 'sawtooth', t, barDur + 0.25, 0.095, this.musicGain, 640);
      this.playPadTone(chord[2] * 1.004, 'triangle', t, barDur + 0.25, 0.085, this.musicGain, 950);
    }

    // 2. Heartbeat double-kick ("lub-dub") + distant metallic industrial tick
    if (local === 0 || local === 3 || local === 8 || (bar >= 2 && local === 11)) {
      const isStrong = local === 0 || local === 8;
      this.playKick(t, isStrong ? 0.34 : 0.2, this.musicGain);
    }
    if (local === 4 || local === 12) {
      this.playNoiseBurst(t, 0.06, 1750, 2.5, 0.09, this.musicGain);
    }
    if (local % 2 === 1 && (bar >= 1 || local >= 8)) {
      this.playNoiseBurst(t, 0.022, 4800, 3.0, 0.045, this.musicGain);
    }

    // 3. Creeping suspense bass pulse on eighth-note grid
    if (local % 2 === 0) {
      const bassMult = local === 6 || local === 14 ? 1.5 : 1;
      this.playTone(root * bassMult, 'sawtooth', t, stepDur * 1.4, 0.16, this.musicGain, 420);
    }

    // 4. Haunting tense horror ostinato (minor-second & tritone dread)
    const motifBars = [
      // Bar 0: Dm creepy motif
      [587.33, 0, 622.25, 0, 587.33, 0, 554.37, 0, 587.33, 0, 0, 440.0, 466.16, 0, 440.0, 0],
      // Bar 1: Eb Phrygian climb
      [622.25, 0, 587.33, 0, 466.16, 0, 440.0, 0, 622.25, 0, 698.46, 0, 622.25, 0, 587.33, 0],
      // Bar 2: Tightening pressure
      [523.25, 0, 587.33, 0, 622.25, 0, 698.46, 0, 622.25, 0, 587.33, 0, 466.16, 440.0, 0, 0],
      // Bar 3: Ominous harmonic tension drop
      [554.37, 0, 440.0, 0, 466.16, 0, 440.0, 0, 349.23, 0, 329.63, 0, 440.0, 0, 554.37, 0],
    ];
    const leadNote = motifBars[bar][local];
    if (leadNote > 0) {
      this.playTone(leadNote, 'triangle', t, stepDur * 1.9, 0.145, this.musicGain, 2100);
      this.playTone(leadNote * 0.5, 'sawtooth', t, stepDur * 1.5, 0.055, this.musicGain, 900);
    }
  }

  private scheduleForestCombatStep(t: number, rawStep: number, stepDur: number): void {
    if (!this.musicGain) return;
    const step = rawStep % 64;
    const bar = Math.floor(step / 16);
    const local = step % 16;
    const barDur = stepDur * 16;

    // Driving dark action survival progression: Em -> C -> Am -> B7
    const roots = [82.41, 65.41, 110.0, 61.74];
    const padNotes = [
      [164.81, 246.94], // E5 power chord
      [130.81, 196.0],  // C5
      [110.0, 164.81],  // A5
      [123.47, 185.0],  // B5
    ];
    const root = roots[bar];

    // 1. Sustaining gritty power-chord bed so combat ALWAYS has full-bodied musical energy
    if (local === 0) {
      this.playPadTone(padNotes[bar][0], 'sawtooth', t, barDur + 0.1, 0.12, this.musicGain, 760);
      this.playPadTone(padNotes[bar][1], 'sawtooth', t, barDur + 0.1, 0.08, this.musicGain, 980);
    }

    // 2. Heavy 16th pulsing octave bassline (loud enough on both desktop and phone speakers)
    const octave = local % 4 === 2 ? 2 : 1;
    this.playTone(
      root * octave,
      'sawtooth',
      t,
      stepDur * 0.88,
      0.24,
      this.musicGain,
      720 + this.combatIntensity * 380
    );

    // 3. Punchy four-on-the-floor kick + syncopated urgency fills
    if (local % 4 === 0 || (local === 14 && (bar === 3 || this.combatIntensity > 0.35))) {
      this.playKick(t, 0.42, this.musicGain);
    }
    // Snappy layered snare on 4 & 12 (+ dramatic fill on bar 3 step 15)
    if (local === 4 || local === 12 || (bar === 3 && local === 15)) {
      this.playSnare(t, 0.25, this.musicGain);
      this.playTone(195, 'triangle', t, 0.06, 0.14, this.musicGain);
    }
    // Crisp driving hi-hats
    if (local % 2 === 1 || this.combatIntensity > 0.45) {
      this.playNoiseBurst(
        t,
        0.028,
        6400,
        2.0,
        local % 2 === 1 ? 0.095 : 0.05,
        this.musicGain
      );
    }

    // 4. Urgent high-energy combat lead riff
    const leadBar0 = [329.63, 0, 392.0, 0, 493.88, 0, 440.0, 392.0, 329.63, 0, 392.0, 493.88, 523.25, 0, 493.88, 0];
    const leadBar1 = [261.63, 0, 329.63, 0, 392.0, 0, 329.63, 293.66, 261.63, 0, 329.63, 392.0, 440.0, 0, 392.0, 0];
    const leadBar2 = [440.0, 0, 392.0, 0, 329.63, 0, 293.66, 0, 329.63, 392.0, 440.0, 0, 493.88, 0, 440.0, 0];
    const leadBar3 = [493.88, 0, 440.0, 392.0, 369.99, 0, 329.63, 0, 293.66, 329.63, 369.99, 440.0, 493.88, 0, 659.25, 0];
    const leads = [leadBar0, leadBar1, leadBar2, leadBar3];
    const leadNote = leads[bar][local];
    if (leadNote > 0) {
      this.playTone(
        leadNote,
        'square',
        t,
        stepDur * 1.25,
        0.13 + this.combatIntensity * 0.06,
        this.musicGain,
        1850 + this.combatIntensity * 900
      );
      this.playTone(
        leadNote * 0.5,
        'sawtooth',
        t,
        stepDur * 1.15,
        0.075,
        this.musicGain,
        1200
      );
    }
  }

  private scheduleBossStep(t: number, rawStep: number, stepDur: number): void {
    if (!this.musicGain) return;
    const step = rawStep % 32;

    const bassPattern = [
      82.41, 82.41, 164.81, 82.41, 87.31, 82.41, 98.0, 82.41,
      82.41, 82.41, 164.81, 82.41, 110.0, 98.0, 87.31, 77.78,
    ];
    const bassFreq = bassPattern[step % 16];
    this.playTone(bassFreq, 'sawtooth', t, stepDur * 0.9, 0.28, this.musicGain, 760);

    if (step % 4 === 0 || step % 16 === 14) {
      this.playKick(t, 0.45, this.musicGain);
    }
    if (step % 4 === 2) {
      this.playSnare(t, 0.28, this.musicGain);
      this.playTone(180, 'triangle', t, 0.06, 0.15, this.musicGain);
    }

    const leadPattern = [
      329.63, 0, 349.23, 329.63, 493.88, 0, 440.0, 392.0,
      349.23, 0, 329.63, 293.66, 329.63, 392.0, 440.0, 523.25,
      659.25, 0, 587.33, 523.25, 493.88, 0, 440.0, 493.88,
      523.25, 493.88, 440.0, 392.0, 349.23, 329.63, 293.66, 261.63,
    ];
    const leadFreq = leadPattern[step];
    if (leadFreq > 0) {
      this.playTone(leadFreq, 'square', t, stepDur * 1.1, 0.18, this.musicGain, 2100);
    }
  }

  private tickForestAmbience(): void {
    if (!this.ctx || !this.ambientGain || this.muted || this.ctx.state !== 'running') return;
    if (this.musicMode === 'none' || this.musicMode === 'boss') return;

    const t = this.ctx.currentTime;
    const roll = Math.random();

    if (roll < 0.55) {
      const baseFreq = this.biomeId === 'misty_swamp' ? 2100 : 3400 + Math.random() * 600;
      for (let i = 0; i < 3; i++) {
        this.playTone(baseFreq, 'sine', t + i * 0.055, 0.035, 0.04, this.ambientGain);
      }
    } else if (roll < 0.8) {
      if (
        this.biomeId === 'autumn_trail' ||
        this.biomeId === 'ash_ruins' ||
        this.biomeId === 'scorched_fort' ||
        this.biomeId === 'obsidian_canyon' ||
        this.biomeId === 'abyss_rift' ||
        this.biomeId === 'blood_citadel'
      ) {
        this.playTone(540, 'sawtooth', t, 0.16, 0.045, this.ambientGain, 900);
        this.playTone(490, 'sawtooth', t + 0.22, 0.18, 0.04, this.ambientGain, 850);
      } else {
        this.playTone(390, 'sine', t, 0.22, 0.06, this.ambientGain);
        this.playTone(330, 'sine', t + 0.34, 0.42, 0.055, this.ambientGain);
      }
    } else {
      this.playNoiseBurst(t, 0.45, 700, 1.2, 0.07, this.ambientGain);
    }
  }

  public playFootstep(surface: SurfaceType): void {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const pitch = 0.92 + Math.random() * 0.16;

    if (surface === 'grass') {
      this.playNoiseBurst(t, 0.08, 1250 * pitch, 1.4, 0.13, this.sfxGain);
      this.playTone(85 * pitch, 'sine', t, 0.05, 0.08, this.sfxGain);
    } else if (surface === 'mud') {
      this.playNoiseBurst(t, 0.12, 580 * pitch, 2.8, 0.2, this.sfxGain);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(190 * pitch, t);
      osc.frequency.exponentialRampToValueAtTime(360 * pitch, t + 0.08);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.1);
    } else if (surface === 'gravel') {
      this.playNoiseBurst(t, 0.055, 2400 * pitch, 1.6, 0.18, this.sfxGain);
      this.playNoiseBurst(t + 0.032, 0.05, 3100 * pitch, 2.0, 0.14, this.sfxGain);
    } else if (surface === 'stone') {
      this.playTone(230 * pitch, 'triangle', t, 0.045, 0.16, this.sfxGain, 900);
      this.playNoiseBurst(t, 0.035, 1900 * pitch, 2.5, 0.13, this.sfxGain);
    } else if (surface === 'wood') {
      this.playTone(155 * pitch, 'triangle', t, 0.07, 0.2, this.sfxGain, 500);
      this.playTone(305 * pitch, 'sine', t, 0.05, 0.1, this.sfxGain);
    }
  }

  private playGunshotLayer(
    startTime: number,
    noiseDur: number,
    noiseFreq: number,
    noiseQ: number,
    noiseVol: number,
    thumpStart: number,
    thumpEnd: number,
    thumpDur: number,
    thumpVol: number,
    thumpWave: OscillatorType = 'triangle',
    useDrive = true
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const dest = useDrive && this.driveNode ? this.driveNode : this.sfxGain;
    this.playNoiseBurst(startTime, noiseDur, noiseFreq, noiseQ, noiseVol, dest);
    this.playSweepTo(thumpStart, thumpEnd, startTime, thumpDur, thumpWave, thumpVol, dest);
  }

  public playGunshot(weaponId: WeaponId): void {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const p = 0.94 + Math.random() * 0.12;
    const drive = this.driveNode ?? this.sfxGain;

    switch (weaponId) {
      case 'rusty_pistol':
        // Dry 9mm Makarov crack + light metallic slide snap
        this.playGunshotLayer(t, 0.075, 1950 * p, 0.85, 0.36, 360 * p, 72, 0.065, 0.24, 'triangle');
        this.playTone(2300 * p, 'square', t + 0.008, 0.02, 0.06, this.sfxGain, 3200);
        break;

      case 'sawed_carbine':
        // Scrap twin-slug pop + metallic pipe rattle
        this.playGunshotLayer(t, 0.095, 1550 * p, 0.72, 0.42, 310 * p, 64, 0.085, 0.3, 'sawtooth');
        this.playNoiseBurst(t + 0.015, 0.04, 3100 * p, 1.3, 0.12, this.sfxGain);
        break;

      case 'shotgun':
        // Wide sawed-off buckshot roar + wood-stock punch
        this.playGunshotLayer(t, 0.21, 950 * p, 0.55, 0.52, 210 * p, 42, 0.16, 0.42, 'sawtooth');
        this.playNoiseBurst(t + 0.015, 0.18, 2600 * p, 0.9, 0.22, drive);
        break;

      case 'revolver':
        // Heavy .357 Magnum bark + sharp brass/steel transient ring
        this.playGunshotLayer(t, 0.13, 1750 * p, 0.75, 0.46, 460 * p, 64, 0.11, 0.35, 'sawtooth');
        this.playNoiseBurst(t + 0.02, 0.16, 3400 * p, 1.4, 0.16, this.sfxGain);
        break;

      case 'burst_smg':
        // Crisp compact PDW rapid snap
        this.playGunshotLayer(t, 0.045, 2700 * p, 1.25, 0.26, 480 * p, 130, 0.04, 0.18, 'triangle');
        this.playTone(1950 * p, 'square', t + 0.012, 0.015, 0.06, this.sfxGain);
        break;

      case 'double_barrel':
        // Massive twin-barrel cannon detonation with staggered double chamber punch
        this.playGunshotLayer(t, 0.28, 760 * p, 0.5, 0.62, 185 * p, 34, 0.22, 0.5, 'sawtooth');
        this.playGunshotLayer(t + 0.022, 0.24, 1500 * p, 0.7, 0.34, 260 * p, 46, 0.18, 0.3, 'triangle');
        break;

      case 'smg':
        // Tight ultra-snappy 9mm SMG pop + fast crisp bolt clatter
        this.playGunshotLayer(t, 0.05, 2450 * p, 1.1, 0.28, 420 * p, 115, 0.045, 0.2, 'square');
        this.playTone(1600 * p, 'triangle', t + 0.018, 0.018, 0.07, this.sfxGain);
        break;

      case 'tactical_pistol':
        // Tactically damped crisp "thwip-crack" + precision mechanical cycle
        this.playGunshotLayer(t, 0.055, 2900 * p, 1.4, 0.26, 520 * p, 95, 0.05, 0.22, 'triangle');
        this.playTone(3200 * p, 'sine', t, 0.022, 0.09, this.sfxGain);
        break;

      case 'pump_shotgun':
        // Deep 12-gauge combat boom + distinct metallic pump rack "chk-chk"
        this.playGunshotLayer(t, 0.23, 880 * p, 0.6, 0.54, 195 * p, 40, 0.18, 0.44, 'sawtooth');
        this.playNoiseBurst(t + 0.13, 0.032, 3300 * p, 2.2, 0.16, this.sfxGain);
        this.playNoiseBurst(t + 0.195, 0.036, 4100 * p, 2.4, 0.18, this.sfxGain);
        break;

      case 'combat_crossbow':
        // Taut steel bowstring twang + heavy wind-whistle bolt snap
        this.playSweepTo(520 * p, 190, t, 0.11, 'triangle', 0.32, this.sfxGain);
        this.playNoiseBurst(t, 0.08, 2800 * p, 1.6, 0.22, this.sfxGain);
        this.playTone(340 * p, 'sine', t + 0.01, 0.08, 0.15, this.sfxGain);
        break;

      case 'assault_rifle':
        // Punchy 5.45/7.62 carbine crack + aggressive mid bark + bolt carrier clack
        this.playGunshotLayer(t, 0.085, 2150 * p, 0.8, 0.38, 390 * p, 82, 0.075, 0.3, 'sawtooth');
        this.playNoiseBurst(t + 0.012, 0.06, 4200 * p, 1.5, 0.15, drive);
        break;

      case 'auto_shotgun':
        // Rapid semi-auto combat shotgun thump + sharp gas-port hiss
        this.playGunshotLayer(t, 0.15, 980 * p, 0.65, 0.48, 230 * p, 52, 0.13, 0.38, 'sawtooth');
        this.playNoiseBurst(t + 0.01, 0.09, 3200 * p, 1.2, 0.18, drive);
        break;

      case 'rifle':
        // Heavy hunting carbine supersonic whip + warm resonant stock thump
        this.playGunshotLayer(t, 0.16, 2500 * p, 0.72, 0.46, 540 * p, 62, 0.13, 0.36, 'sawtooth');
        this.playNoiseBurst(t + 0.03, 0.16, 1100 * p, 1.1, 0.22, this.sfxGain);
        break;

      case 'lmg':
        // Deep 7.62 squad machine gun bark + heavy receiver clatter
        this.playGunshotLayer(t, 0.075, 1650 * p, 0.85, 0.36, 290 * p, 70, 0.068, 0.29, 'sawtooth');
        this.playTone(190 * p, 'square', t, 0.045, 0.11, drive, 750);
        break;

      case 'saw_launcher':
        // Pneumatic launch thunk + spinning circular sawblade metallic zing
        this.playGunshotLayer(t, 0.09, 1400 * p, 1.2, 0.26, 280 * p, 90, 0.07, 0.28, 'triangle');
        this.playSweepTo(720 * p, 1850 * p, t + 0.01, 0.12, 'sawtooth', 0.18, this.sfxGain);
        break;

      case 'plasma_carbine':
        // Energized plasma discharge + high-voltage ionized crackle
        this.playSweepTo(1180 * p, 220, t, 0.11, 'sawtooth', 0.26, drive);
        this.playTone(1640 * p, 'sine', t, 0.06, 0.16, this.sfxGain);
        this.playNoiseBurst(t, 0.07, 4600 * p, 1.8, 0.16, this.sfxGain);
        break;

      case 'cryo_cannon':
        // Pressurized liquid-nitrogen hiss + crystalline frost shatter chime
        this.playNoiseBurst(t, 0.14, 3800 * p, 0.9, 0.3, this.sfxGain);
        this.playSweepTo(2200 * p, 680, t, 0.1, 'sine', 0.22, this.sfxGain);
        this.playTone(2950 * p, 'triangle', t + 0.01, 0.06, 0.14, this.sfxGain);
        break;

      case 'flamethrower':
        // Pressurized ignition pop + roaring turbulent propane flame jet
        this.playNoiseBurst(t, 0.15, 580 * p, 0.55, 0.34, drive);
        this.playNoiseBurst(t + 0.01, 0.13, 1850 * p, 0.9, 0.16, this.sfxGain);
        break;

      case 'sniper_rifle':
        // Deafening .50 cal supersonic crack + chest-thumping shockwave + echoing tail + bolt click
        this.playGunshotLayer(t, 0.26, 2800 * p, 0.65, 0.58, 620 * p, 44, 0.19, 0.48, 'sawtooth');
        this.playNoiseBurst(t + 0.04, 0.25, 1100 * p, 0.9, 0.24, this.sfxGain);
        this.playNoiseBurst(t + 0.19, 0.03, 3900 * p, 2.5, 0.12, this.sfxGain);
        break;

      case 'minigun':
        // Heavy rotary staccato 7.62 punch + mechanical barrel whirr
        this.playGunshotLayer(t, 0.055, 1900 * p, 0.95, 0.34, 310 * p, 78, 0.05, 0.26, 'sawtooth');
        this.playTone(145 * p, 'square', t, 0.04, 0.1, drive, 600);
        break;

      case 'tesla_coil':
        // High-voltage arc snap + crackling thunder whip
        this.playSweepTo(2600 * p, 340, t, 0.09, 'sawtooth', 0.24, drive);
        this.playNoiseBurst(t, 0.1, 5200 * p, 1.4, 0.26, this.sfxGain);
        this.playTone(980 * p, 'square', t + 0.01, 0.05, 0.12, this.sfxGain);
        break;

      case 'railgun':
        // Blinding electromagnetic rail snap + plasma arc thunder + sub-bass shock
        this.playGunshotLayer(t, 0.19, 3600 * p, 1.0, 0.45, 1550 * p, 55, 0.15, 0.36, 'sawtooth');
        this.playSweepTo(2400 * p, 420, t, 0.09, 'triangle', 0.2, this.sfxGain);
        break;

      case 'gauss_cannon':
        // Earth-shaking triple-coil implosion + crystalline harmonic discharge
        this.playGunshotLayer(t, 0.24, 1450 * p, 0.7, 0.56, 920 * p, 36, 0.21, 0.5, 'sawtooth');
        this.playTone(1380 * p, 'sine', t, 0.11, 0.2, this.sfxGain);
        this.playTone(2070 * p, 'triangle', t + 0.015, 0.08, 0.14, this.sfxGain);
        break;

      case 'void_annihilator':
        // Cataclysmic void pulse + sub-bass warp boom + shimmering hyper-beam choir
        this.playGunshotLayer(t, 0.28, 1200 * p, 0.65, 0.58, 780 * p, 30, 0.24, 0.54, 'sawtooth');
        this.playSweepTo(2900 * p, 180, t, 0.16, 'triangle', 0.24, drive);
        this.playTone(1760 * p, 'sine', t + 0.01, 0.14, 0.18, this.sfxGain);
        break;
    }
  }

  public playReload(): void {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.playTone(540, 'square', t, 0.04, 0.1, this.sfxGain, 1200);
    this.playTone(760, 'square', t + 0.12, 0.05, 0.12, this.sfxGain, 1500);
  }

  public playDryFire(): void {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.playTone(900, 'triangle', t, 0.025, 0.12, this.sfxGain);
  }

  public playZombieGroan(isBoss = false): void {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const base = isBoss ? 68 : 115 + Math.random() * 45;
    const dur = isBoss ? 0.55 : 0.28;
    const vol = isBoss ? 0.32 : 0.14;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.linearRampToValueAtTime(base * 0.72, t + dur);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(isBoss ? 220 : 380, t);
    filter.Q.value = 3.2;

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  public playZombieHit(): void {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.playNoiseBurst(t, 0.05, 950, 1.5, 0.16, this.sfxGain);
    this.playTone(120, 'sine', t, 0.05, 0.14, this.sfxGain);
  }

  public playZombieDeath(isBoss = false): void {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const dur = isBoss ? 0.7 : 0.32;
    this.playNoiseBurst(t, isBoss ? 0.35 : 0.14, isBoss ? 520 : 880, 1.1, isBoss ? 0.36 : 0.22, this.sfxGain);
    this.playSweep(isBoss ? 140 : 210, isBoss ? 36 : 55, t, dur, 'sawtooth', isBoss ? 0.3 : 0.18);
  }

  public playCoinPickup(): void {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.playTone(880, 'square', t, 0.05, 0.1, this.sfxGain, 2200);
    this.playTone(1318.5, 'square', t + 0.05, 0.08, 0.1, this.sfxGain, 2600);
  }

  public playUpgrade(): void {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.playTone(523.25, 'triangle', t, 0.07, 0.18, this.sfxGain);
    this.playTone(659.25, 'triangle', t + 0.07, 0.07, 0.18, this.sfxGain);
    this.playTone(783.99, 'triangle', t + 0.14, 0.14, 0.2, this.sfxGain);
  }

  public playPlayerHurt(): void {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.playSweep(180, 62, t, 0.2, 'sawtooth', 0.28);
    this.playNoiseBurst(t, 0.14, 650, 1.0, 0.25, this.sfxGain);
  }

  public playCritHit(): void {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.playNoiseBurst(t, 0.055, 2900, 1.6, 0.2, this.sfxGain);
    this.playTone(980, 'triangle', t, 0.06, 0.14, this.sfxGain);
    this.playTone(1480, 'sine', t + 0.025, 0.07, 0.12, this.sfxGain);
  }

  public playComboUp(tier: number): void {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const base = tier >= 3 ? 659.25 : tier === 2 ? 587.33 : 493.88;
    this.playTone(base, 'triangle', t, 0.08, 0.16, this.sfxGain);
    this.playTone(base * 1.5, 'triangle', t + 0.06, 0.12, 0.16, this.sfxGain);
  }

  public playWaveClear(): void {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const notes = [392.0, 493.88, 587.33, 783.99];
    notes.forEach((f, idx) => {
      this.playTone(f, 'triangle', t + idx * 0.08, 0.18, 0.18, this.sfxGain!);
    });
  }

  public playLevelUp(): void {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      this.playTone(f, 'triangle', t + idx * 0.09, 0.25, 0.22, this.sfxGain!);
    });
  }

  private playTone(
    freq: number,
    type: OscillatorType,
    startTime: number,
    duration: number,
    volume: number,
    dest: AudioNode,
    cutoff?: number
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    const attackTime = Math.min(0.012, Math.max(0.002, duration * 0.4));
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + attackTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + Math.max(attackTime + 0.004, duration));

    if (cutoff) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  private playSweep(
    startFreq: number,
    endFreq: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    volume: number
  ): void {
    if (!this.sfxGain) return;
    this.playSweepTo(startFreq, endFreq, startTime, duration, type, volume, this.sfxGain);
  }

  private playSweepTo(
    startFreq: number,
    endFreq: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    dest: AudioNode
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, endFreq), startTime + duration);

    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  private playNoiseBurst(
    startTime: number,
    duration: number,
    centerFreq: number,
    q: number,
    volume: number,
    dest: AudioNode
  ): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const maxSafeFreq = Math.max(1000, this.ctx.sampleRate * 0.45);
    filter.frequency.setValueAtTime(Math.max(40, Math.min(maxSafeFreq, centerFreq)), startTime);
    filter.Q.value = q;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(startTime);
    src.stop(startTime + duration + 0.02);
  }

  private playKick(startTime: number, volume: number, dest: AudioNode): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, startTime);
    osc.frequency.exponentialRampToValueAtTime(38, startTime + 0.09);
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.11);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + 0.12);
  }

  private playSnare(startTime: number, volume: number, dest: AudioNode): void {
    this.playNoiseBurst(startTime, 0.09, 2200, 0.9, volume, dest);
  }
}

export const soundEngine = new SoundEngine();
