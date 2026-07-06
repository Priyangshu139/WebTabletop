import { describe, it, expect } from 'vitest';
import { applyEvent } from './reducer';
import { EngineState, EngineEvent } from './types';

const initialTestState: EngineState = {
  seed: 'test-seed',
  prngState: 0,
  players: {
    'P1': { id: 'P1', color: 'Red', skinTone: 'light', emojiFace: '😀', isHost: true },
    'P2': { id: 'P2', color: 'Blue', skinTone: 'medium', emojiFace: '😎', isHost: false }
  },
  turn: {
    currentPlayerId: 'P1',
    phase: 'StartTurn'
  },
  eventLog: [],
  moduleState: {
    lastDiceValue: 0,
    playerPositions: { 'P1': 0, 'P2': 0 }
  }
};

describe('Pure State Reducer', () => {
  it('updates lastDiceValue on DICE_ROLLED event', () => {
    const event: EngineEvent = {
      type: 'DICE_ROLLED',
      playerId: 'P1',
      payload: { value: 5 },
      timestamp: 1000
    };
    const resultState = applyEvent(initialTestState, event);

    expect(resultState.moduleState.lastDiceValue).toBe(5);
    expect(resultState.eventLog.length).toBe(1);
    expect(resultState).not.toBe(initialTestState); // Purity check
  });

  it('updates position and rotates turns on events', () => {
    const moveEvent: EngineEvent = {
      type: 'PIECE_MOVED',
      playerId: 'P1',
      payload: { spaces: 4 },
      timestamp: 1001
    };
    const resultState = applyEvent(initialTestState, moveEvent);
    expect(resultState.moduleState.playerPositions['P1']).toBe(4);

    const turnEndEvent: EngineEvent = {
      type: 'TURN_ENDED',
      playerId: 'P1',
      timestamp: 1002
    };
    const nextTurnState = applyEvent(resultState, turnEndEvent);
    expect(nextTurnState.turn.currentPlayerId).toBe('P2');
    expect(nextTurnState.turn.phase).toBe('StartTurn');
  });
});
