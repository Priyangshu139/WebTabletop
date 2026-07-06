import { EngineState, EngineCommand, EngineEvent } from './types';
import { PRNG } from './prng';
import ludoModule from '../sandbox/modules/ludo_go.json';

export function validateCommand(
  state: EngineState,
  command: EngineCommand,
  prng: PRNG
): EngineEvent[] {
  // 1. Turn enforcement (exempt PIN_DISCORD)
  if (command.type !== 'PIN_DISCORD' && state.turn.currentPlayerId !== command.playerId) {
    throw new Error('Not your turn.');
  }

  const events: EngineEvent[] = [];

  switch (command.type) {
    case 'ROLL_DICE': {
      if (state.turn.phase !== 'Roll' && state.turn.phase !== 'StartTurn') {
        throw new Error('You cannot roll at this phase.');
      }
      // Roll dice (1-6) using seedable PRNG influenced by flick speed payload
      const flickSpeed = command.payload?.speed || 0;
      const offset = Math.floor(flickSpeed * 100) % 7;
      for (let i = 0; i < offset; i++) {
        prng.next();
      }
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
        payload: { phase: 'ResolveTile' },
        timestamp: Date.now()
      });
      break;
    }

    case 'RESOLVE_TILE': {
      if (state.turn.phase !== 'ResolveTile') {
        throw new Error('You cannot resolve tiles at this phase.');
      }

      const currentPos = state.moduleState.playerPositions[command.playerId] || 0;
      const tile = ludoModule.board.tiles.find(t => t.index === currentPos);
      let finalPos = currentPos;

      if (tile) {
        if (tile.type === 'BOOST' && tile.payload?.spaces) {
          events.push({
            type: 'PIECE_MOVED',
            playerId: command.playerId,
            payload: { spaces: tile.payload.spaces },
            timestamp: Date.now()
          });
          finalPos += tile.payload.spaces;
        } else if (tile.type === 'TRAP' && tile.payload?.spaces) {
          events.push({
            type: 'PIECE_MOVED',
            playerId: command.playerId,
            payload: { spaces: tile.payload.spaces },
            timestamp: Date.now()
          });
          finalPos += tile.payload.spaces;
        }
      }

      if (finalPos >= ludoModule.rules.winningTile) {
        events.push({
          type: 'PLAYER_WON',
          playerId: command.playerId,
          timestamp: Date.now()
        });
      }

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

    case 'PIN_DISCORD': {
      const sender = state.players[command.playerId];
      if (!sender || !sender.isHost) {
        throw new Error('Only the authoritative host can pin a Discord link.');
      }
      events.push({
        type: 'DISCORD_PINNED',
        playerId: command.playerId,
        payload: { link: command.payload.link },
        timestamp: Date.now()
      });
      break;
    }

    default:
      throw new Error(`Unknown command: ${(command as any).type}`);
  }

  return events;
}
