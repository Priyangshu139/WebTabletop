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
});
