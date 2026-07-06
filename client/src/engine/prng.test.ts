import { describe, it, expect } from 'vitest';
import { PRNG } from './prng';

describe('Deterministic PRNG', () => {
  it('generates the same sequences given the same seed', () => {
    const prng1 = new PRNG('test-seed');
    const prng2 = new PRNG('test-seed');

    const values1 = [prng1.next(), prng1.next(), prng1.next()];
    const values2 = [prng2.next(), prng2.next(), prng2.next()];

    expect(values1).toEqual(values2);
  });

  it('generates different sequences for different seeds', () => {
    const prng1 = new PRNG('seed-a');
    const prng2 = new PRNG('seed-b');

    const values1 = [prng1.next(), prng1.next(), prng1.next()];
    const values2 = [prng2.next(), prng2.next(), prng2.next()];

    expect(values1).not.toEqual(values2);
  });

  it('supports stateOffset to advance the sequence and allow re-entry', () => {
    const prng1 = new PRNG('offset-seed', 0);
    // Advance prng1 twice
    prng1.next();
    prng1.next();
    const val1 = prng1.next();

    // Create prng2 initialized with stateOffset = 2
    const prng2 = new PRNG('offset-seed', 2);
    const val2 = prng2.next();

    expect(val1).toEqual(val2);
  });
});
