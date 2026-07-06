import { EngineState, EngineEvent } from './types';

export function applyEvent(state: EngineState, event: EngineEvent): EngineState {
  // Deep clone state to ensure reducer is pure
  const nextState: EngineState = JSON.parse(JSON.stringify(state));
  nextState.eventLog.push(event);

  switch (event.type) {
    case 'DICE_ROLLED':
      nextState.moduleState.lastDiceValue = event.payload.value;
      // Deterministic PRNG tick progression tracked in state
      nextState.prngState += 1;
      break;

    case 'PIECE_MOVED':
      const pid = event.playerId!;
      const currentPos = nextState.moduleState.playerPositions[pid] || 0;
      nextState.moduleState.playerPositions[pid] = currentPos + event.payload.spaces;
      break;

    case 'PHASE_CHANGED':
      nextState.turn.phase = event.payload.phase;
      break;

    case 'TURN_ENDED':
      const playerIds = Object.keys(nextState.players);
      const currentIndex = playerIds.indexOf(nextState.turn.currentPlayerId);
      const nextIndex = (currentIndex + 1) % playerIds.length;
      nextState.turn.currentPlayerId = playerIds[nextIndex];
      nextState.turn.phase = 'StartTurn';
      break;
  }

  return nextState;
}
