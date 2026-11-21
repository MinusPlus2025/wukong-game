import type { EnemySpawnSpec } from '../data/ChaptersData';
import * as Tone from 'tone';

/**
 * Warm, Cinematic Eastern Acoustic Audio Engine (Guqin + Bamboo Xiao + Felt Tanggu + Air-Whoosh Foley).
 * Zero harsh sawtooth or screeching metallic synths — filtered through warm lowpass + concert hall reverb.
 */
export class WukongAudio {
  public isReady = false;
  public muted = false;
  public inCombat = false;
  public bgmEnabled = true;
  private synthBgm = false;

  private master!: Tone.Gain;
  private effectsBus!: Tone.Gain;
  private dialoguePriority = 0;
  private warmthFilter!: Tone.Filter;
  private hallReverb!: Tone.Reverb;
  private stereoDelay!: Tone.FeedbackDelay;

  private guqin!: Tone.PolySynth;
  private xiaoFlute!: Tone.MonoSynth;
  private warmPad!: Tone.PolySynth;
  private tangguDrum!: Tone.MembraneSynth;
  private chimeHarmonic!: Tone.PolySynth;

  private whooshNoise!: Tone.NoiseSynth;
  private whooshFilter!: Tone.Filter;
  private staffMetal!: Tone.Synth;
  private impactNoise!: Tone.NoiseSynth;
  private bossRoar!: Tone.MonoSynth;
  private activeVoice: Tone.Player | null = null;
  private voiceDuckTimer = 0;
  private phaseActive = false;
  private audioTimes = new Map<string, number>();
  private voices: Record<string, Tone.Player> = {};
  private bgmPlayer: Tone.Player | null = null;
  private ambientPlayer: Tone.Player | null = null;
  private ambientIndex = -1;
  private ambientPending = -1;
  private sfxPlayers: Record<string, Tone.Player> = {};

  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private step = 0;

  // Lush D-Major Pentatonic (宫商角徵羽: D E F# A B) — warm, noble, never dissonant
  private readonly calmPhrase = [
    'D4', null, 'A4', null, 'F#4', null, 'E4', null,
    'B3', null, 'D4', 'E4', 'A3', null, null, null,
    'E4', null, 'F#4', 'A4', 'B4', null, 'A4', null,
    'F#4', null, 'E4', null, 'D4', null, null, null,
  ];

  private readonly battleBass = ['D2', 'D2', 'A1', 'D2', 'B1', 'B1', 'G1', 'A1'];
  private readonly battlePluck = ['D3', 'A3', 'D4', 'E4', 'F#4', 'A4', 'B3', 'A3'];

  public async init(): Promise<void> {
    if (this.isReady) return;
    await Tone.start();

    const rawCtx = Tone.getContext().rawContext as AudioContext;
    this.recordDest = rawCtx.createMediaStreamDestination();

    this.master = new Tone.Gain(0.58);
    this.effectsBus = new Tone.Gain(1).connect(this.master);
    this.master.connect(new Tone.Limiter(-1).toDestination());
    // Recording and speakers share the same peak protection.
    const recordLimiter = new Tone.Limiter(-1);
    this.master.connect(recordLimiter);
    Tone.connect(recordLimiter, this.recordDest);

    // Master analog warmth filter removes all harsh digital highs above 2.6 kHz
    this.warmthFilter = new Tone.Filter({
      type: 'lowpass',
      frequency: 2650,
      rolloff: -12,
      Q: 0.6,
    }).connect(this.effectsBus);

    this.hallReverb = new Tone.Reverb({ decay: 4.6, preDelay: 0.03, wet: 0.44 });
    await this.hallReverb.generate();
    this.hallReverb.connect(this.warmthFilter);

    this.stereoDelay = new Tone.FeedbackDelay({
      delayTime: '4n.',
      feedback: 0.24,
      wet: 0.2,
    }).connect(this.hallReverb);

    // 1. Silk-string Guqin / Guzheng (FM plucked harmonics)
    this.guqin = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2.0,
      modulationIndex: 3.2,
      oscillator: { type: 'sine' },
      modulation: { type: 'triangle' },
      envelope: { attack: 0.008, decay: 1.35, sustain: 0.08, release: 2.2 },
      modulationEnvelope: { attack: 0.005, decay: 0.28, sustain: 0, release: 0.4 },
      volume: -10,
    }).connect(this.stereoDelay);

    // 2. Soft Bamboo Xiao Flute (warm sine/triangle glide)
    this.xiaoFlute = new Tone.MonoSynth({
      oscillator: { type: 'sine' },
      portamento: 0.09,
      filter: { Q: 1, type: 'lowpass', rolloff: -12 },
      envelope: { attack: 0.35, decay: 0.6, sustain: 0.65, release: 1.8 },
      filterEnvelope: {
        attack: 0.3,
        decay: 0.5,
        sustain: 0.6,
        release: 1.5,
        baseFrequency: 320,
        octaves: 2.2,
      },
      volume: -14,
    }).connect(this.hallReverb);

    // 3. Deep Warm Cello / Silk Drone Pad
    this.warmPad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 1.6, decay: 1.2, sustain: 0.7, release: 3.2 },
      volume: -18,
    }).connect(this.hallReverb);

    // 4. Deep Felt-Mallet Tanggu / Cinematic Sub-Taiko (deep & round, never clicky)
    this.tangguDrum = new Tone.MembraneSynth({
      pitchDecay: 0.08,
      octaves: 3.2,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.006, decay: 0.62, sustain: 0, release: 0.65 },
      volume: -6,
    }).connect(this.hallReverb);

    // 5. Pure Temple Singing Bowl Harmonics (for spells & pickups)
    this.chimeHarmonic = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.015, decay: 1.8, sustain: 0.05, release: 2.6 },
      volume: -13,
    }).connect(this.hallReverb);

    // 6. Realistic Martial Staff Air-Whoosh Foley (bandpass-filtered pink noise)
    this.whooshFilter = new Tone.Filter({
      type: 'bandpass',
      frequency: 360,
      Q: 1.4,
    }).connect(this.warmthFilter);

    this.whooshNoise = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.018, decay: 0.16, sustain: 0, release: 0.09 },
      volume: -12,
    }).connect(this.whooshFilter);

    // Metallic staff transient: a short, bright ring layered over the air whoosh.
    this.staffMetal = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.11, sustain: 0, release: 0.06 },
      volume: -17,
    }).connect(this.warmthFilter);

    // Heavy impact debris / ground crack noise.
    this.impactNoise = new Tone.NoiseSynth({
      noise: { type: 'brown' },
      envelope: { attack: 0.002, decay: 0.26, sustain: 0, release: 0.12 },
      volume: -16,
    }).connect(this.warmthFilter);

    // Boss phase-2 roar: low, rough, not a pretty synth.
    this.bossRoar = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { type: 'lowpass', Q: 2, rolloff: -24 },
      filterEnvelope: { attack: 0.02, decay: 0.6, sustain: 0.3, release: 1.2, baseFrequency: 90, octaves: 2.2 },
      envelope: { attack: 0.02, decay: 0.8, sustain: 0.4, release: 1.4 },
      volume: -12,
    }).connect(this.hallReverb);

    const voiceMap: Record<string, string> = {
      start: 'audio/staff-performance/start.wav',
      combo: 'audio/battle-voices/combo.wav',
      heavy: 'audio/staff-performance/heavy.wav',
      dodge: 'audio/battle-voices/dodge.wav',
      ding: 'audio/battle-voices/ding.wav',
      fan: 'audio/battle-voices/fan.wav',
      phase: 'audio/battle-voices/phase.wav',
      victory: 'audio/battle-voices/victory.wav',
      death: 'audio/battle-voices/death.wav',
      choice: 'audio/battle-voices/choice.wav',
      'ending-good': 'audio/battle-voices/ending-good.wav',
      'ending-bad': 'audio/battle-voices/ending-bad.wav',
      'boss-intro': 'audio/staff-performance/boss-intro.wav',
      'low-hp': 'audio/battle-voices/low-hp.wav',
    };
    for (const [k, url] of Object.entries(voiceMap)) {
      this.voices[k] = new Tone.Player({ url, volume: 0 }).connect(this.master);
    }
    const sfxMap: Record<string, string> = {
      whoosh_light: 'audio/sfx/whoosh_light.wav',
      whoosh_heavy: 'audio/sfx/whoosh_heavy.wav',
      tap: 'audio/staff-performance/tap.wav',
      thrust: 'audio/staff-performance/thrust.wav',
      crusher: 'audio/staff-performance/crusher.wav',
      impact: 'audio/sfx/impact.wav',
      impact_heavy: 'audio/sfx/impact_heavy.wav',
      slam: 'audio/sfx/slam.wav',
      parry: 'audio/sfx/parry.wav',
      gong: 'audio/sfx/gong.wav',
      taiko: 'audio/sfx/taiko.wav',
    };
    for (const surface of ['hide','bone','gel','bronze','horn','scale']) {
      sfxMap[surface] = 'audio/battle-voices/' + surface + '.wav';
    }
    for (const [k, url] of Object.entries(sfxMap)) {
      const contact = ['hide', 'bone', 'gel', 'bronze', 'horn', 'scale'].includes(k);
      this.sfxPlayers[k] = new Tone.Player({ url, volume: -5 }).connect(contact ? this.master : this.effectsBus);
    }

    this.isReady = true;
    if (this.ambientPending >= 0) this.setAmbient(this.ambientPending);

    Tone.getTransport().bpm.value = 104;

    new Tone.Loop((time) => {
      if (this.muted || !this.bgmEnabled || !this.synthBgm) return;
      const s = this.step++;

      // Sustain warm harmonic foundation every 2 bars
      if (s % 32 === 0) {
        this.warmPad.triggerAttackRelease(['D2', 'A2', 'F#3'], '1m', time, 0.42);
      } else if (s % 32 === 16) {
        this.warmPad.triggerAttackRelease(['B1', 'F#2', 'D3'], '1m', time, 0.38);
      }

      if (this.inCombat) {
        // Spacious, heroic Eastern Taiko + Low Guqin pulse (104 BPM, noble & cinematic)
        if (s % 8 === 0) {
          const bassNote = this.battleBass[(s / 8) % this.battleBass.length];
          this.tangguDrum.triggerAttackRelease(bassNote, '4n', time, 0.78);
        } else if (s % 8 === 6) {
          this.tangguDrum.triggerAttackRelease('A1', '8n', time, 0.42);
        }

        if (s % 2 === 0) {
          const n = this.battlePluck[(s / 2) % this.battlePluck.length];
          this.guqin.triggerAttackRelease(n, '8n', time, 0.34);
        }

        if (s % 16 === 4) {
          this.xiaoFlute.triggerAttackRelease('A4', '2n', time, 0.32);
        } else if (s % 16 === 12) {
          this.xiaoFlute.triggerAttackRelease('F#4', '2n', time, 0.28);
        }
      } else {
        // Serene Huaguoshan / Celestial Guqin & Xiao meditation
        const note = this.calmPhrase[s % this.calmPhrase.length];
        if (note && s % 2 === 0) {
          this.guqin.triggerAttackRelease(note, '2n', time, 0.32);
        }
        if (s % 32 === 8) {
          this.xiaoFlute.triggerAttackRelease('A4', '1m', time, 0.26);
        } else if (s % 32 === 24) {
          this.xiaoFlute.triggerAttackRelease('E4', '1m', time, 0.24);
        }
      }
    }, '8n').start(0);

    Tone.getTransport().start();
    this.isReady = true;
    await Tone.loaded();
  }

  public getAudioStream(): MediaStream | null {
    return this.recordDest?.stream ?? null;
  }

  private nextAudioTime(channel: string): number {
    const time = Math.max(Tone.now(), (this.audioTimes.get(channel) ?? 0) + 0.005);
    this.audioTimes.set(channel, time);
    return time;
  }

  private playSfx(name: string, volume = -5, rate = 1): void {
    if (this.muted) return;
    const p = this.sfxPlayers[name];
    if (!p || !p.loaded) return;
    try { p.stop(); } catch { /* not started */ }
    p.playbackRate = rate;
    p.volume.value = volume;
    p.start(this.nextAudioTime('player:' + name));
  }

  public playLightSwing(comboIdx: number): void {
    if (!this.isReady || this.muted) return;
    // Realistic heavy staff cutting air (pitch-swept pink noise whoosh)
    const freqs = [340, 420, 510];
    this.whooshFilter.frequency.setValueAtTime(freqs[comboIdx % 3], Tone.now());
    this.whooshFilter.frequency.exponentialRampToValueAtTime(160, Tone.now() + 0.15);
    this.playSfx(comboIdx >= 2 ? 'whoosh_heavy' : 'whoosh_light', -7);
    this.whooshNoise.triggerAttackRelease('16n', this.nextAudioTime('whoosh'));

  }

  public playStaffHit(heavy = false, comboStep = 0): void {
    if (!this.isReady || this.muted) return;
    this.playSfx(heavy ? 'impact_heavy' : 'impact', heavy ? -5 : -7, heavy ? 0.94 : [1, 1.06, 0.96, 0.9][comboStep % 4]);
    this.playSfx(heavy ? 'crusher' : comboStep === 3 ? 'thrust' : 'tap', heavy ? -8 : -10);
    if (heavy) {
      this.tangguDrum.triggerAttackRelease('C1', '16n', this.nextAudioTime('drum'), 0.42);
    }
    this.impactNoise.triggerAttackRelease(heavy ? '16n' : '32n', this.nextAudioTime('impact'), heavy ? 0.32 : 0.17);

  }

  private readonly surfaceTimes = new Map<string, number>();

  public playSurface(surface: EnemySpawnSpec['surface'], heavy: boolean): void {
    if (!this.isReady || this.muted) return;
    const now = Tone.now();
    if (now - (this.surfaceTimes.get(surface) ?? -1) < 0.055) return;
    this.surfaceTimes.set(surface, now);
    this.playSfx(surface, heavy ? -6 : -9, heavy ? 0.9 : 1);
  }

  public playGroundStrike(): void {
    if (!this.isReady || this.muted) return;
    this.playSfx('slam', -6, 0.87);
  }

  public playDingShenSpell(): void {
    if (!this.isReady || this.muted) return;
    // Sacred golden singing bowl chord ("定!")
    this.playSfx('gong', -8);
    this.chimeHarmonic.triggerAttackRelease(['D5', 'A5', 'F#6'], '1n', undefined, 0.62);
    this.tangguDrum.triggerAttackRelease('D1', '4n', this.nextAudioTime('drum'), 0.55);
  }

  public playCloneSpell(): void {
    if (!this.isReady || this.muted) return;
    ['D4', 'F#4', 'A4', 'D5'].forEach((n, i) => {
      setTimeout(() => {
        if (!this.muted) this.guqin.triggerAttackRelease(n, '4n', undefined, 0.42);
      }, i * 65);
    });
  }

  public playWindFan(): void {
    if (!this.isReady || this.muted) return;
    this.whooshFilter.frequency.setValueAtTime(680, Tone.now());
    this.whooshFilter.frequency.exponentialRampToValueAtTime(140, Tone.now() + 0.55);
    this.playSfx('whoosh_heavy', -6);
    this.whooshNoise.triggerAttackRelease('2n', this.nextAudioTime('whoosh'));
    this.chimeHarmonic.triggerAttackRelease(['E4', 'B4', 'F#5'], '2n', undefined, 0.42);
  }

  public playPerfectDodge(): void {
    if (!this.isReady || this.muted) return;
    this.playSfx('parry', -3);
    this.chimeHarmonic.triggerAttackRelease(['A4', 'E5', 'A5'], '2n', undefined, 0.52);
  }

  public playVictory(): void {
    if (!this.isReady || this.muted) return;
    this.playSfx('gong', -4);
    this.tangguDrum.triggerAttackRelease('D1', '1n', this.nextAudioTime('drum'), 0.8);
    ['D4', 'E4', 'F#4', 'A4', 'B4', 'D5'].forEach((n, i) => {
      setTimeout(() => {
        if (!this.muted) this.guqin.triggerAttackRelease(n, '1n', undefined, 0.52);
      }, i * 110);
    });
  }

  public playDodge(): void {
    if (!this.isReady || this.muted) return;
    this.playSfx('whoosh_light', -8);
    this.whooshFilter.frequency.setValueAtTime(980, Tone.now());
    this.whooshFilter.frequency.exponentialRampToValueAtTime(220, Tone.now() + 0.22);
    this.whooshNoise.triggerAttackRelease('32n', this.nextAudioTime('whoosh'));
  }

  public playBossRoar(): void {
    if (!this.isReady || this.muted) return;
    this.playSfx('slam', -5);
    this.bossRoar.triggerAttackRelease('C2', '2n', this.nextAudioTime('roar'), 0.8);
    this.tangguDrum.triggerAttackRelease('C1', '2n', this.nextAudioTime('drum'), 0.9);
    this.impactNoise.triggerAttackRelease('2n', this.nextAudioTime('impact'), 0.7);
  }

  private scoreGeneration = 0;
  private phaseLayer: Tone.Player | null = null;
  private arrivalCue: Tone.Player | null = null;
  private shiftCue: Tone.Player | null = null;
  private pendingCue: 'arrival' | 'shift' | null = null;

  public playChapterCue(kind: 'arrival' | 'shift'): void {
    const player = kind === 'arrival' ? this.arrivalCue : this.shiftCue;
    if (!player?.loaded) { this.pendingCue = kind; return; }
    this.pendingCue = null;
    if (this.muted) return;
    player.stop();
    player.start(this.nextAudioTime('chapter:' + kind));
  }

  public setAmbient(index: number): void {
    if (!this.isReady) { this.ambientPending = index; return; }
    if (this.ambientIndex === index && this.bgmPlayer) return;
    const generation = ++this.scoreGeneration;
    this.ambientIndex = index;
    this.pendingCue = null;
    for (const previous of [this.bgmPlayer, this.phaseLayer, this.ambientPlayer, this.arrivalCue, this.shiftCue]) {
      if (previous) { previous.stop(); previous.dispose(); }
    }
    const chapter = ['forest', 'fire', 'heaven'][index];
    const player = (loop: boolean, volume: number) => new Tone.Player({ loop, volume, fadeIn: loop ? 0.12 : 0.005, fadeOut: 0.05 });
    const score = this.bgmPlayer = player(true, this.activeVoice ? -23 : -17).connect(this.master);
    const phase = this.phaseLayer = player(true, this.phaseActive ? -17 : -70).connect(this.effectsBus);
    const air = this.ambientPlayer = player(true, this.activeVoice ? -26 : -17).connect(this.master);
    const arrival = this.arrivalCue = player(false, -12).connect(this.effectsBus);
    const shift = this.shiftCue = player(false, -13).connect(this.effectsBus);
    const load = (p: Tone.Player, part: string) => p.load('audio/chapters/' + chapter + '-' + part + '.mp3');
    void Promise.all([load(score,'score'),load(phase,'phase')]).then(() => {
      if (generation !== this.scoreGeneration || !this.bgmEnabled) return;
      const time = Tone.now() + 0.04;
      score.start(time); phase.start(time);
    }).catch(() => {});
    void load(air,'air').then(() => { if (generation === this.scoreGeneration) air.start(); }).catch(() => {});
    for (const [p, kind] of [[arrival,'arrival'],[shift,'shift']] as const) {
      void load(p,kind).then(() => {
        if (generation === this.scoreGeneration && this.pendingCue === kind) this.playChapterCue(kind);
      }).catch(() => {});
    }
  }

  public playVoice(name: string): number {
    if (!this.isReady || this.muted) return 0;
    const p = this.voices[name];
    if (!p || !p.loaded) return 0;
    const priority = name.startsWith('ending-') ? 5 : ['death', 'victory'].includes(name) ? 4
      : ['low-hp', 'choice'].includes(name) ? 3 : ['phase', 'boss-intro'].includes(name) ? 2 : 1;
    if (this.activeVoice && priority <= this.dialoguePriority) return -1;
    this.dialoguePriority = priority;
    // One dialogue lane: a new subtitle must never accompany two overlapping lines.
    this.activeVoice?.stop();
    this.activeVoice = p;
    window.clearTimeout(this.voiceDuckTimer);
    p.start(this.nextAudioTime('player:' + name));
    const duration = p.buffer.duration / p.playbackRate;
    this.effectsBus.gain.rampTo(0.58, 0.035);
    this.bgmPlayer?.volume.rampTo(-23, 0.06);
    this.ambientPlayer?.volume.rampTo(-26, 0.06);
    this.voiceDuckTimer = window.setTimeout(() => {
      this.activeVoice = null;
      this.effectsBus.gain.rampTo(1, 0.24);
      this.bgmPlayer?.volume.rampTo(this.inCombat ? (this.phaseActive ? -17 : -16) : -22, 0.6);
      this.ambientPlayer?.volume.rampTo(-17, 0.6);
    }, duration * 1000 + 100);
    return duration;
  }

  public setCombat(active: boolean): void {
    if (this.inCombat === active) return;
    this.inCombat = active;
    if (!this.activeVoice) this.bgmPlayer?.volume.rampTo(active ? (this.phaseActive ? -17 : -16) : -22, 1.2);
  }

  public playAttackCue(kind: 'dragon' | 'boss' | 'minion'): void {
    if (!this.isReady || this.muted) return;
    this.staffMetal.triggerAttackRelease(kind === 'dragon' ? 'D3' : kind === 'boss' ? 'A2' : 'A4', '16n', this.nextAudioTime('metal'), 0.22);
  }

  public playEnemyImpact(boss: boolean): void {
    if (!this.isReady || this.muted) return;
    this.playSfx(boss ? 'slam' : 'whoosh_light', boss ? -10 : -14);
  }

  public setBossPhase(on: boolean): void {
    if (!this.isReady) return;
    Tone.getTransport().bpm.rampTo(on ? 118 : 104, 1.2);
    this.phaseActive = on;
    this.phaseLayer?.volume.rampTo(on ? -17 : -70, 0.55);
    if (!this.activeVoice) this.bgmPlayer?.volume.rampTo(this.inCombat ? (on ? -17 : -16) : -22, 1);
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.isReady) this.master.gain.rampTo(this.muted ? 0 : 0.58, 0.15);
    return this.muted;
  }
}
