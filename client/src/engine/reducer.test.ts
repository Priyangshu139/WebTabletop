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

  it('adds player to state on PLAYER_JOINED event', () => {
    const joinEvent: EngineEvent = {
      type: 'PLAYER_JOINED',
      playerId: 'P3',
      payload: { color: 'green', skinTone: 'dark', emojiFace: '🤖' },
      timestamp: 1003
    };
    const resultState = applyEvent(initialTestState, joinEvent);

    expect(resultState.players['P3']).toBeDefined();
    expect(resultState.players['P3'].color).toBe('green');
    expect(resultState.players['P3'].emojiFace).toBe('🤖');
    expect(resultState.moduleState.playerPositions['P3']).toBe(0);
  });

  it('verifies turn timer epoch resets on TURN_ENDED', () => {
    const turnEndEvent: EngineEvent = {
      type: 'TURN_ENDED',
      playerId: 'P1',
      timestamp: 1002
    };
    const resultState = applyEvent(initialTestState, turnEndEvent);
    expect(resultState.turnStartedAt).toBeDefined();
    expect(resultState.turnStartedAt).toBeGreaterThan(0);
  });

  it('verifies spectator isSpectator flag registration on PLAYER_JOINED', () => {
    const joinEvent: EngineEvent = {
      type: 'PLAYER_JOINED',
      playerId: 'P3',
      payload: { color: 'green', emojiFace: '🤖', isSpectator: true },
      timestamp: 1003
    };
    const resultState = applyEvent(initialTestState, joinEvent);
    expect(resultState.players['P3'].isSpectator).toBe(true);
    // Spectators do not have positions on Ludo/Monopoly boards
    expect(resultState.moduleState.playerPositions['P3']).toBeUndefined();
  });

  it('verifies game selection and lobby start updates state correctly', () => {
    // Select Game
    const selectEvent: EngineEvent = {
      type: 'LOBBY_GAME_SELECTED',
      playerId: 'P1',
      payload: { game: 'monopoly-go' },
      timestamp: 2001
    };
    let state = applyEvent(initialTestState, selectEvent);
    expect(state.selectedGame).toBe('monopoly-go');
    expect(state.activeModule).toBe('monopoly-go');

    // Change Color
    const colorEvent: EngineEvent = {
      type: 'PAWN_COLOR_CHANGED',
      playerId: 'P1',
      payload: { color: '#ef4444' },
      timestamp: 2002
    };
    state = applyEvent(state, colorEvent);
    expect(state.players['P1'].color).toBe('#ef4444');

    // Start Game
    const startEvent: EngineEvent = {
      type: 'GAME_STARTED',
      playerId: 'P1',
      timestamp: 2003
    };
    state = applyEvent(state, startEvent);
    expect(state.lobbyStarted).toBe(true);
    expect(state.moduleState.playerPositions['P1']).toBe(0);
  });
});
