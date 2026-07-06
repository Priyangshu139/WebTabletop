import { EngineState, EngineCommand, EngineEvent } from './types';
import { PRNG } from './prng';

export function validateCommand(
  state: EngineState,
  command: EngineCommand,
  prng: PRNG
): EngineEvent[] {
  // 1. Turn enforcement
  if (state.turn.currentPlayerId !== command.playerId) {
    throw new Error('Not your turn.');
  }

  const events: EngineEvent[] = [];

  switch (command.type) {
    case 'ROLL_DICE': {
      if (state.turn.phase !== 'Roll' && state.turn.phase !== 'StartTurn') {
        throw new Error('You cannot roll at this phase.');
      }
      // Roll dice (1-6) using seedable PRNG
      const diceValue = Math.floor(prng.next() * 6) + 1;
      events.push({
        type: 'DICE_ROLLED',
        playerId: command.playerId,
        payload: { value: diceValue },
        timestamp: Date.now()
      });
      events.push({
        type: 'PHASE_CHANGED',
        payload: { phase: 'Move' },
        timestamp: Date.now()
      });
      break;
    }

    case 'MOVE_PIECE': {
      if (state.turn.phase !== 'Move') {
        throw new Error('You cannot move at this phase.');
      }
      events.push({
        type: 'PIECE_MOVED',
        playerId: command.playerId,
        payload: { spaces: command.payload.spaces },
        timestamp: Date.now()
      });
      events.push({
        type: 'PHASE_CHANGED',
        payload: { phase: 'EndTurn' },
        timestamp: Date.now()
      });
      break;
    }

    case 'END_TURN': {
      if (state.turn.phase !== 'EndTurn') {
        throw new Error('You must complete current actions before ending turn.');
      }
      events.push({
        type: 'TURN_ENDED',
        playerId: command.playerId,
        timestamp: Date.now()
      });
      break;
    }

    default:
      throw new Error(`Unknown command: ${(command as any).type}`);
  }

  return events;
}
