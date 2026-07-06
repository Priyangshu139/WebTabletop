export class PRNG {
  private state: number;
  private callsCount: number;

  constructor(seed: string, stateOffset: number = 0) {
    this.callsCount = stateOffset;
    // FNV-1a 32-bit hash algorithm to hash the string seed to a 32-bit state
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    this.state = hash >>> 0;

    // Advance by stateOffset to support deterministic re-entry
    for (let i = 0; i < stateOffset; i++) {
      this.nextStateOnly();
    }
  }

  /**
   * Internal state transition function.
   */
  private nextStateOnly(): void {
    this.state = (this.state + 0x9e3779b9) | 0;
    let z = this.state;
    z ^= z >>> 16;
    z = Math.imul(z, 0x21f0aa7c);
    z ^= z >>> 15;
    z = Math.imul(z, 0x735a2d97);
    z ^= z >>> 15;
  }

  /**
   * Generates a deterministic pseudo-random float in the range [0, 1)
   * using the SplitMix32 algorithm.
   */
  public next(): number {
    this.callsCount++;
    this.state = (this.state + 0x9e3779b9) | 0;
    let z = this.state;
    z ^= z >>> 16;
    z = Math.imul(z, 0x21f0aa7c);
    z ^= z >>> 15;
    z = Math.imul(z, 0x735a2d97);
    z ^= z >>> 15;
    return (z >>> 0) / 4294967296;
  }

  public getOffset(): number {
    return this.callsCount;
  }

  public getState(): number {
    return this.state;
  }
}
