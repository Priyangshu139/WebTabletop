class SoundManager {
  private ctx: AudioContext | null = null;
  private soundMode: 'on' | 'game-only' | 'meme-only' | 'off' = 'on';

  constructor() {
    const saved = localStorage.getItem('webtabletop-sound-mode');
    if (saved) {
      this.soundMode = saved as any;
    }
  }

  public setSoundMode(mode: 'on' | 'game-only' | 'meme-only' | 'off') {
    this.soundMode = mode;
    localStorage.setItem('webtabletop-sound-mode', mode);
  }

  public getSoundMode() {
    return this.soundMode;
  }

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Play a quick wood card slap sound
  public playCardPlace() {
    if (this.soundMode !== 'on' && this.soundMode !== 'game-only') return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  // Play a card slide/draw sound
  public playCardDraw() {
    if (this.soundMode !== 'on' && this.soundMode !== 'game-only') return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.12);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.13);
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  // Play a card flip tick/flutter
  public playCardFlip() {
    if (this.soundMode !== 'on' && this.soundMode !== 'game-only') return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1100, now);
      osc.frequency.setValueAtTime(850, now + 0.03);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  // Play a warm arpeggio chime fanfare for calling UNO!
  public playUnoFanfare() {
    if (this.soundMode !== 'on' && this.soundMode !== 'game-only') return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Arpeggio notes: C5, E5, G5, C6
      const freqs = [523.25, 659.25, 783.99, 1046.50];
      freqs.forEach((freq, idx) => {
        const noteTime = now + idx * 0.07;
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0.22, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.01, noteTime + 0.28);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(noteTime);
        osc.stop(noteTime + 0.29);
      });
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  // Play a low error/rejection warning buzz
  public playErrorBuzz() {
    if (this.soundMode !== 'on' && this.soundMode !== 'game-only') return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.linearRampToValueAtTime(95, now + 0.22);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.23);
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  // Play a meme sound ogg file statically hosted on backend
  public playMemeSound(filename: string, baseUrl?: string) {
    if (this.soundMode !== 'on' && this.soundMode !== 'meme-only') return;
    try {
      const host = baseUrl || `http://${window.location.hostname}:3000`;
      const audio = new Audio(`${host}/meme/${encodeURIComponent(filename)}`);
      audio.volume = 1.0;
      audio.play().catch(err => {
        console.warn('Meme sound play failed:', err);
      });
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }
}

export const soundManager = new SoundManager();
