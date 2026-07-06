export interface Player {
  id: string;
  color: string;
  skinTone: string;
  emojiFace: string;
  isHost: boolean;
}

export interface EngineState {
  seed: string;
  prngState: number;
  players: Record<string, Player>;
  turn: {
    currentPlayerId: string;
    phase: 'StartTurn' | 'Roll' | 'Move' | 'ResolveTile' | 'OptionalActions' | 'EndTurn';
  };
  eventLog: EngineEvent[];
  moduleState: {
    lastDiceValue: number;
    playerPositions: Record<string, number>;
  };
}

export interface EngineCommand {
  type: 'ROLL_DICE' | 'MOVE_PIECE' | 'END_TURN' | 'RESOLVE_TILE';
  playerId: string;
  payload?: any;
}

export interface EngineEvent {
  type: 'DICE_ROLLED' | 'PIECE_MOVED' | 'PHASE_CHANGED' | 'TURN_ENDED' | 'PLAYER_JOINED' | 'PLAYER_WON';
  playerId?: string;
  payload?: any;
  timestamp: number;
}
