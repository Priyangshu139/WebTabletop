import { describe, it, expect } from 'vitest';
import { applyEvent } from './reducer';
import { EngineState, EngineEvent, EngineCommand } from './types';
import { validateCommand } from './rules';

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

  it('verifies PLAYER_JOINED resolves color conflicts automatically', () => {
    // Add P1 with color #ef4444
    const joinEvent1: EngineEvent = {
      type: 'PLAYER_JOINED',
      playerId: 'P1',
      payload: { color: '#ef4444' },
      timestamp: 3001
    };
    let state = applyEvent(initialTestState, joinEvent1);
    expect(state.players['P1'].color).toBe('#ef4444');

    // Add P2 with same color #ef4444 - should be auto-assigned next free color (e.g. #3b82f6)
    const joinEvent2: EngineEvent = {
      type: 'PLAYER_JOINED',
      playerId: 'P2',
      payload: { color: '#ef4444' },
      timestamp: 3002
    };
    state = applyEvent(state, joinEvent2);
    expect(state.players['P2'].color).not.toBe('#ef4444');
    expect(state.players['P2'].color).toBe('#3b82f6');
  });

  it('verifies spectator joining resolves color conflicts with existing players and other spectators', () => {
    const joinP1: EngineEvent = {
      type: 'PLAYER_JOINED',
      playerId: 'P1',
      payload: { color: '#ef4444', isSpectator: false },
      timestamp: 5001
    };
    let state = applyEvent(initialTestState, joinP1);

    const joinP2: EngineEvent = {
      type: 'PLAYER_JOINED',
      playerId: 'P2',
      payload: { color: '#ef4444', isSpectator: true },
      timestamp: 5002
    };
    state = applyEvent(state, joinP2);
    expect(state.players['P2'].color).not.toBe('#ef4444');
    expect(state.players['P2'].color).toBe('#3b82f6');

    const joinP3: EngineEvent = {
      type: 'PLAYER_JOINED',
      playerId: 'P3',
      payload: { color: '#3b82f6', isSpectator: true },
      timestamp: 5003
    };
    state = applyEvent(state, joinP3);
    expect(state.players['P3'].color).not.toBe('#3b82f6');
    expect(state.players['P3'].color).toBe('#22c55e');
  });

  it('verifies QUIT_MATCH command validation and MATCH_QUIT state resetting', () => {
    let state = applyEvent(initialTestState, {
      type: 'LOBBY_GAME_SELECTED',
      playerId: 'P1',
      payload: { game: 'monopoly-go' },
      timestamp: 6001
    });
    state = applyEvent(state, {
      type: 'GAME_STARTED',
      playerId: 'P1',
      timestamp: 6002
    });
    expect(state.lobbyStarted).toBe(true);

    const nonHostCmd: EngineCommand = {
      type: 'QUIT_MATCH',
      playerId: 'P2'
    };
    expect(() => validateCommand(state, nonHostCmd)).toThrow('Only the lobby Host can modify settings.');

    const hostCmd: EngineCommand = {
      type: 'QUIT_MATCH',
      playerId: 'P1'
    };
    const events = validateCommand(state, hostCmd);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('MATCH_QUIT');

    const resultState = applyEvent(state, events[0]);
    expect(resultState.lobbyStarted).toBe(false);
    expect(resultState.turn.phase).toBe('StartTurn');
    expect(resultState.moduleState.playerPositions['P1']).toBe(0);
    expect(resultState.players['P1'].money).toBe(1500);
  });

  it('verifies CHAT_PINNED and SPECTATOR_ROLE_TOGGLED updates state correctly', () => {
    // Add P1
    const joinEvent: EngineEvent = {
      type: 'PLAYER_JOINED',
      playerId: 'P1',
      payload: { color: '#ef4444' },
      timestamp: 4001
    };
    let state = applyEvent(initialTestState, joinEvent);

    // Toggle Role to Spectator
    const toggleEvent: EngineEvent = {
      type: 'SPECTATOR_ROLE_TOGGLED',
      playerId: 'P1',
      timestamp: 4002
    };
    state = applyEvent(state, toggleEvent);
    expect(state.players['P1'].isSpectator).toBe(true);

    // Toggle Role back to Player
    state = applyEvent(state, toggleEvent);
    expect(state.players['P1'].isSpectator).toBe(false);

    // Pin Chats (multiple, max 3, unpinning)
    const chatMsg1 = { id: 'chat-1', senderId: 'P1', text: 'Hello World 1' };
    state = applyEvent(state, {
      type: 'CHAT_PINNED',
      playerId: 'P1',
      payload: { chat: chatMsg1 },
      timestamp: 4003
    });
    expect(state.pinnedChats).toContainEqual(chatMsg1);

    // Pin second and third
    state = applyEvent(state, {
      type: 'CHAT_PINNED',
      playerId: 'P1',
      payload: { chat: { id: 'chat-2', senderId: 'P1', text: 'Hello 2' } },
      timestamp: 4004
    });
    state = applyEvent(state, {
      type: 'CHAT_PINNED',
      playerId: 'P1',
      payload: { chat: { id: 'chat-3', senderId: 'P1', text: 'Hello 3' } },
      timestamp: 4005
    });
    expect(state.pinnedChats?.length).toBe(3);

    // Pin fourth (shifts oldest out)
    state = applyEvent(state, {
      type: 'CHAT_PINNED',
      playerId: 'P1',
      payload: { chat: { id: 'chat-4', senderId: 'P1', text: 'Hello 4' } },
      timestamp: 4006
    });
    expect(state.pinnedChats?.length).toBe(3);
    expect(state.pinnedChats?.some(c => c.id === 'chat-1')).toBe(false); // shifted out!

    // Unpin chat-2
    state = applyEvent(state, {
      type: 'CHAT_UNPINNED',
      playerId: 'P1',
      payload: { chatId: 'chat-2' },
      timestamp: 4007
    });
    expect(state.pinnedChats?.length).toBe(2);
    expect(state.pinnedChats?.some(c => c.id === 'chat-2')).toBe(false);
  });
});
