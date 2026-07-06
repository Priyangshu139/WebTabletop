import { describe, it, expect, vi } from 'vitest';
import { ReplayEngine, ReplayPayload } from './replay';

describe('ReplayEngine', () => {
  const mockPayload: ReplayPayload = {
    moduleId: 'ludo-go-classic',
    seed: 'seed-xyz',
    players: {
      'P1': { id: 'P1', color: 'red', skinTone: 'light', emojiFace: '🦊', isHost: true },
      'P2': { id: 'P2', color: 'blue', skinTone: 'medium', emojiFace: '🐼', isHost: false }
    },
    eventLog: [
      { type: 'DICE_ROLLED', playerId: 'P1', payload: { value: 3 }, timestamp: 1000 },
      { type: 'PHASE_CHANGED', payload: { phase: 'Move' }, timestamp: 1005 }
    ]
  };

  it('initializes to index -1 and correctly rehydrates states on stepForward', () => {
    const onUpdate = vi.fn();
    const engine = new ReplayEngine(mockPayload, onUpdate);

    expect(engine.currentIndex).toBe(-1);
    expect(engine.state.moduleState.lastDiceValue).toBe(0);

    // Step forward 1
    const ok = engine.stepForward();
    expect(ok).toBe(true);
    expect(engine.currentIndex).toBe(0);
    expect(engine.state.moduleState.lastDiceValue).toBe(3);
    expect(onUpdate).toHaveBeenCalled();
  });

  it('correctly handles stepBackward rehydration', () => {
    const onUpdate = vi.fn();
    const engine = new ReplayEngine(mockPayload, onUpdate);

    engine.stepForward(); // index 0 (DICE_ROLLED)
    engine.stepForward(); // index 1 (PHASE_CHANGED)
    expect(engine.state.turn.phase).toBe('Move');

    // Step backward
    const ok = engine.stepBackward();
    expect(ok).toBe(true);
    expect(engine.currentIndex).toBe(0);
    // Rehydrated state should show phase reset to StartTurn (from initial state)
    expect(engine.state.turn.phase).toBe('StartTurn');
  });

  it('scrubs timeline with goToEvent', () => {
    const onUpdate = vi.fn();
    const engine = new ReplayEngine(mockPayload, onUpdate);

    engine.goToEvent(1);
    expect(engine.state.turn.phase).toBe('Move');
    expect(engine.state.moduleState.lastDiceValue).toBe(3);

    engine.goToEvent(-1);
    expect(engine.state.moduleState.lastDiceValue).toBe(0);
  });
});
