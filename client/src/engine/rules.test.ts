import { describe, it, expect } from 'vitest';
import { validateCommand } from './rules';
import { EngineState, EngineCommand } from './types';
import { PRNG } from './prng';

const initialTestState: EngineState = {
  seed: 'test-seed',
  prngState: 0,
  activeModule: 'ludo-go-classic',
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

  it('validates Monopoly BUY_PROPERTY logic in OptionalActions phase', () => {
    const monopolyState: EngineState = {
      seed: 'test-seed',
      prngState: 0,
      activeModule: 'monopoly-go',
      players: {
        'P1': { id: 'P1', color: 'Red', skinTone: 'light', emojiFace: '😀', isHost: true, money: 1500 }
      },
      turn: { currentPlayerId: 'P1', phase: 'OptionalActions' },
      eventLog: [],
      moduleState: {
        lastDiceValue: 2,
        playerPositions: { 'P1': 1 }, // Med. Avenue cost $60
        propertiesOwned: {}
      }
    };

    const command: EngineCommand = { type: 'BUY_PROPERTY', playerId: 'P1' };
    const prng = new PRNG(monopolyState.seed, monopolyState.prngState);
    const events = validateCommand(monopolyState, command, prng);

    expect(events.length).toBe(2);
    expect(events[0].type).toBe('PROPERTY_BOUGHT');
    expect(events[0].payload.tileIndex).toBe(1);
    expect(events[0].payload.cost).toBe(60);
    expect(events[1].type).toBe('PHASE_CHANGED');
    expect(events[1].payload.phase).toBe('EndTurn');
  });

  it('validates Uno CARD_PLAYED matching color rules', () => {
    const unoState: EngineState = {
      seed: 'test-seed',
      prngState: 0,
      activeModule: 'uno-go',
      players: {
        'P1': {
          id: 'P1',
          color: 'Red',
          skinTone: 'light',
          emojiFace: '😀',
          isHost: true,
          hand: [{ id: 'card-1', color: 'red', value: '7' }, { id: 'card-2', color: 'blue', value: '4' }]
        },
        'P2': { id: 'P2', color: 'Blue', skinTone: 'medium', emojiFace: '😎', isHost: false }
      },
      turn: { currentPlayerId: 'P1', phase: 'StartTurn' },
      eventLog: [],
      moduleState: {
        lastDiceValue: 0,
        playerPositions: {},
        unoDiscardPile: [{ id: 'card-top', color: 'red', value: '2' }],
        unoDeck: []
      }
    };

    const prng = new PRNG(unoState.seed, unoState.prngState);

    // Play card that matches color (Red 7 matches Red 2)
    const validCmd: EngineCommand = {
      type: 'PLAY_CARD',
      playerId: 'P1',
      payload: { card: { id: 'card-1', color: 'red', value: '7' } }
    };
    const events = validateCommand(unoState, validCmd, prng);
    expect(events[0].type).toBe('CARD_PLAYED');
    expect(events[0].payload.card.value).toBe('7');

    // Play card that fails color match (Blue 4 does not match Red 2)
    const invalidCmd: EngineCommand = {
      type: 'PLAY_CARD',
      playerId: 'P1',
      payload: { card: { id: 'card-2', color: 'blue', value: '4' } }
    };
    expect(() => validateCommand(unoState, invalidCmd, prng)).toThrow('Card color or value does not match discard pile.');
  });

  it('rejects commands executed by spectators', () => {
    const spectatorState: EngineState = {
      seed: 'test-seed',
      prngState: 0,
      activeModule: 'uno-go',
      players: {
        'P1': { id: 'P1', color: 'Red', skinTone: 'light', emojiFace: '😀', isHost: true },
        'P2': { id: 'P2', color: 'Blue', skinTone: 'medium', emojiFace: '😎', isHost: false, isSpectator: true }
      },
      turn: { currentPlayerId: 'P2', phase: 'StartTurn' },
      eventLog: [],
      moduleState: {
        lastDiceValue: 0,
        playerPositions: {},
        unoDiscardPile: [],
        unoDeck: []
      }
    };
    const command: EngineCommand = { type: 'DRAW_CARD', playerId: 'P2' };
    const prng = new PRNG(spectatorState.seed, spectatorState.prngState);

    expect(() => validateCommand(spectatorState, command, prng)).toThrow('Spectators cannot take actions.');
  });

  it('validates PIN_CHAT, UNPIN_CHAT, and TOGGLE_SPECTATOR_ROLE regardless of turn', () => {
    const state: EngineState = {
      seed: 'test-seed',
      prngState: 0,
      activeModule: 'ludo-go-classic',
      players: {
        'P1': { id: 'P1', color: 'Red', skinTone: 'light', emojiFace: '😀', isHost: true },
        'P2': { id: 'P2', color: 'Blue', skinTone: 'medium', emojiFace: '😎', isHost: false }
      },
      turn: { currentPlayerId: 'P2', phase: 'Roll' }, // It is P2's turn, not P1's
      eventLog: [],
      moduleState: { lastDiceValue: 0, playerPositions: { 'P1': 0, 'P2': 0 } }
    };
    const prng = new PRNG(state.seed, state.prngState);

    // Host P1 pins chat message during P2's turn
    const pinCmd: EngineCommand = {
      type: 'PIN_CHAT',
      playerId: 'P1',
      payload: { chat: { id: 'chat-1', senderId: 'P2', text: 'Hello' } }
    };
    const events1 = validateCommand(state, pinCmd, prng);
    expect(events1.length).toBe(1);
    expect(events1[0].type).toBe('CHAT_PINNED');

    // Host P1 unpins chat message during P2's turn
    const unpinCmd: EngineCommand = {
      type: 'UNPIN_CHAT',
      playerId: 'P1',
      payload: { chatId: 'chat-1' }
    };
    const events2 = validateCommand(state, unpinCmd, prng);
    expect(events2.length).toBe(1);
    expect(events2[0].type).toBe('CHAT_UNPINNED');

    // Peer P2 toggles role during their turn
    const toggleCmd: EngineCommand = {
      type: 'TOGGLE_SPECTATOR_ROLE',
      playerId: 'P2'
    };
    const events3 = validateCommand(state, toggleCmd, prng);
    expect(events3.length).toBe(1);
    expect(events3[0].type).toBe('SPECTATOR_ROLE_TOGGLED');
  });

  it('validates standard Uno rules: actions, wilds, direction reversal, deck reshuffling, and Call UNO penalties', () => {
    const prng = new PRNG('test-seed');
    const baseState: EngineState = {
      seed: 'test-seed',
      prngState: 0,
      activeModule: 'uno-go',
      players: {
        'P1': { id: 'P1', color: 'Red', skinTone: 'light', emojiFace: '😀', isHost: true, hand: [{ id: 'w1', color: 'wild', value: 'WILD' }] },
        'P2': { id: 'P2', color: 'Blue', skinTone: 'medium', emojiFace: '😎', isHost: false, hand: [{ id: 'num-2', color: 'red', value: '2' }] },
        'P3': { id: 'P3', color: 'Green', skinTone: 'dark', emojiFace: '🤔', isHost: false, hand: [{ id: 'num-3', color: 'red', value: '3' }] }
      },
      turn: { currentPlayerId: 'P1', phase: 'StartTurn' },
      eventLog: [],
      moduleState: {
        lastDiceValue: 0,
        playerPositions: {},
        unoDiscardPile: [{ id: 'top-1', color: 'red', value: '1' }],
        unoDeck: [{ id: 'draw-1', color: 'red', value: '4' }, { id: 'draw-2', color: 'blue', value: '5' }],
        clockwise: true
      }
    };

    // 1. Play wild card without chosenColor -> throws
    const invalidWild: EngineCommand = {
      type: 'PLAY_CARD',
      playerId: 'P1',
      payload: { card: { id: 'w1', color: 'wild', value: 'WILD' } }
    };
    expect(() => validateCommand(baseState, invalidWild, prng)).toThrow('Choosing a color is required for Wild cards.');

    // 2. Play wild card with chosenColor -> updates activeColor to green, next player is P2
    const validWild: EngineCommand = {
      type: 'PLAY_CARD',
      playerId: 'P1',
      payload: { card: { id: 'w1', color: 'wild', value: 'WILD' }, chosenColor: 'green' }
    };
    const events1 = validateCommand(baseState, validWild, prng);
    expect(events1[0].type).toBe('CARD_PLAYED');
    expect(events1[0].payload.chosenColor).toBe('green');
    expect(events1[events1.length - 1].payload.nextPlayerId).toBe('P2');

    // 3. Test Reverse card
    const stateWithReverse = {
      ...baseState,
      players: {
        ...baseState.players,
        'P1': { ...baseState.players['P1'], hand: [{ id: 'rev-1', color: 'red', value: 'REVERSE' }] }
      }
    };
    const reverseCmd: EngineCommand = {
      type: 'PLAY_CARD',
      playerId: 'P1',
      payload: { card: { id: 'rev-1', color: 'red', value: 'REVERSE' } }
    };
    const events2 = validateCommand(stateWithReverse, reverseCmd, prng);
    // Direction toggles, next player is P3 (counter-clockwise)
    expect(events2.some(e => e.type === 'UNO_REVERSED')).toBe(true);
    expect(events2[events2.length - 1].payload.nextPlayerId).toBe('P3');

    // 4. Test Call UNO penalty
    const stateWithTwoCards = {
      ...baseState,
      players: {
        ...baseState.players,
        'P1': { ...baseState.players['P1'], hand: [{ id: 'card-a', color: 'red', value: '8' }, { id: 'card-b', color: 'red', value: '9' }] }
      }
    };
    const playWithoutUnoCmd: EngineCommand = {
      type: 'PLAY_CARD',
      playerId: 'P1',
      payload: { card: { id: 'card-a', color: 'red', value: '8' } }
    };
    const events3 = validateCommand(stateWithTwoCards, playWithoutUnoCmd, prng);
    // Should draw 2 penalty cards because calledUno is falsy
    const drawEvents = events3.filter(e => e.type === 'CARD_DRAWN');
    expect(drawEvents.length).toBe(2);
  });
});
