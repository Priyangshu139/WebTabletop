class SoundManager {
  private ctx: AudioContext | null = null;
  private soundMode: 'on' | 'game-only' | 'meme-only' | 'off' = 'on';

  // Local audio cache: filename -> blob URL (ready to play instantly)
  private audioCache: Map<string, string> = new Map();
  // Raw base64 cache for exporting to peers
  private rawCache: Map<string, string> = new Map();

  constructor() {
    try {
      const saved = localStorage.getItem('webtabletop-sound-mode');
      if (saved) {
        this.soundMode = saved as any;
      }
    } catch (_) {
      // localStorage unavailable (e.g. Node test environment)
    }
  }

  public setSoundMode(mode: 'on' | 'game-only' | 'meme-only' | 'off') {
    this.soundMode = mode;
    localStorage.setItem('webtabletop-sound-mode', mode);
  }

  public getSoundMode() {
    return this.soundMode;
  }

  /** Host-only: pre-fetch all ogg files from backend server into local cache */
  public async preloadFromServer(baseUrl: string, filenames: string[]): Promise<void> {
    const batchSize = 4; // Fetch 4 at a time to avoid overwhelming
    for (let i = 0; i < filenames.length; i += batchSize) {
      const batch = filenames.slice(i, i + batchSize);
      await Promise.all(batch.map(async (fn) => {
        try {
          const res = await fetch(`${baseUrl}/meme/${encodeURIComponent(fn)}`);
          if (!res.ok) return;
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          this.audioCache.set(fn, blobUrl);

          // Also store as base64 for WebRTC transfer to peers
          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let j = 0; j < bytes.length; j++) {
            binary += String.fromCharCode(bytes[j]);
          }
          this.rawCache.set(fn, btoa(binary));
        } catch (e) {
          console.warn(`Failed to preload meme: ${fn}`, e);
        }
      }));
    }
    console.log(`[SoundManager] Preloaded ${this.audioCache.size}/${filenames.length} meme sounds from server`);
  }

  /** Cache a single sound from base64 data (peer receives from host via WebRTC) */
  public cacheFromBase64(filename: string, base64Data: string): void {
    if (this.audioCache.has(filename)) return; // Already cached
    try {
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/ogg' });
      const blobUrl = URL.createObjectURL(blob);
      this.audioCache.set(filename, blobUrl);
      this.rawCache.set(filename, base64Data);
    } catch (e) {
      console.warn(`Failed to cache meme from base64: ${filename}`, e);
    }
  }

  /** Export all cached sounds as { filename, base64 } entries for WebRTC transfer */
  public exportCachedEntries(): Array<{ filename: string; data: string }> {
    const entries: Array<{ filename: string; data: string }> = [];
    this.rawCache.forEach((data, filename) => {
      entries.push({ filename, data });
    });
    return entries;
  }

  /** Check how many sounds are cached */
  public getCacheSize(): number {
    return this.audioCache.size;
  }

  public isCached(filename: string): boolean {
    return this.audioCache.has(filename);
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

  // Play a meme sound from local cache (no network fetch)
  public playMemeSound(filename: string, _baseUrl?: string) {
    if (this.soundMode !== 'on' && this.soundMode !== 'meme-only') return;
    const cached = this.audioCache.get(filename);
    if (cached) {
      try {
        const audio = new Audio(cached);
        audio.volume = 1.0;
        audio.play().catch(err => {
          console.warn('Meme sound play failed:', err);
        });
      } catch (e) {
        console.warn('Audio play failed:', e);
      }
    } else {
      console.warn(`[SoundManager] Meme not cached: ${filename}`);
    }
  }
}

export const soundManager = new SoundManager();
