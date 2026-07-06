import seedrandom from 'seedrandom';

export class PRNG {
  private rng: seedrandom.PRNG;

  constructor(seed: string, stateOffset: number = 0) {
    // Initialize with seed
    this.rng = seedrandom(seed);
    // Advance by stateOffset to support deterministic re-entry
    for (let i = 0; i < stateOffset; i++) {
      this.rng();
    }
  }

  public next(): number {
    return this.rng();
  }
}
