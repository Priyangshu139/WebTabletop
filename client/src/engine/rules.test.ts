import { describe, it, expect } from 'vitest';
import { validateCommand } from './rules';
import { EngineState, EngineCommand } from './types';
import { PRNG } from './prng';

const initialTestState: EngineState = {
  seed: 'test-seed',
  prngState: 0,
  players: {
    'P1': { id: 'P1', color: 'Red', skinTone: 'light', emojiFace: '😀', isHost: true },
    'P2': { id: 'P2', color: 'Blue', skinTone: 'medium', emojiFace: '😎', isHost: false }
  },
  turn: {
    currentPlayerId: 'P1',
    phase: 'Roll'
  },
  eventLog: [],
  moduleState: {
    lastDiceValue: 0,
    playerPositions: { 'P1': 0, 'P2': 0 }
  }
};

describe('Rule Validation Engine', () => {
  it('throws error if it is not the players turn', () => {
    const command: EngineCommand = { type: 'ROLL_DICE', playerId: 'P2' };
    const prng = new PRNG(initialTestState.seed, initialTestState.prngState);

    expect(() => validateCommand(initialTestState, command, prng)).toThrow('Not your turn.');
  });

  it('generates DICE_ROLLED and PHASE_CHANGED events on valid ROLL_DICE', () => {
    const command: EngineCommand = { type: 'ROLL_DICE', playerId: 'P1' };
    const prng = new PRNG(initialTestState.seed, initialTestState.prngState);
    const events = validateCommand(initialTestState, command, prng);

    expect(events.length).toBe(2);
    expect(events[0].type).toBe('DICE_ROLLED');
    expect(events[0].playerId).toBe('P1');
    expect(events[0].payload.value).toBeGreaterThanOrEqual(1);
    expect(events[0].payload.value).toBeLessThanOrEqual(6);
    expect(events[1].type).toBe('PHASE_CHANGED');
    expect(events[1].payload.phase).toBe('Move');
  });

  it('throws error if player tries to move in Roll phase', () => {
    const command: EngineCommand = { type: 'MOVE_PIECE', playerId: 'P1', payload: { spaces: 3 } };
    const prng = new PRNG(initialTestState.seed, initialTestState.prngState);

    expect(() => validateCommand(initialTestState, command, prng)).toThrow('You cannot move at this phase.');
  });
});
