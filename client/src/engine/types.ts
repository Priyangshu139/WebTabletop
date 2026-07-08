export interface Player {
  id: string;
  color: string;
  skinTone: string;
  emojiFace: string;
  isHost: boolean;
  money?: number;
  hand?: any[];
  isSpectator?: boolean;
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
  activeModule?: 'ludo-go-classic' | 'monopoly-go' | 'uno-go';
  moduleState: {
    lastDiceValue: number;
    playerPositions: Record<string, number>;
    propertiesOwned?: Record<string, string>; // tileIndex -> ownerId
    unoDeck?: any[];
    unoDiscardPile?: any[];
  };
  discordInviteLink?: string;
  timerLimit?: number; // in seconds
  turnStartedAt?: number; // timestamp
  lobbyStarted?: boolean;
  selectedGame?: 'ludo-go-classic' | 'monopoly-go' | 'uno-go';
  lobbySettings?: Record<string, any>;
  pinnedChat?: any;
}

export interface EngineCommand {
  type: 'ROLL_DICE' | 'MOVE_PIECE' | 'END_TURN' | 'RESOLVE_TILE' | 'PIN_DISCORD' | 'BUY_PROPERTY' | 'PLAY_CARD' | 'DRAW_CARD' | 'SELECT_LOBBY_GAME' | 'UPDATE_LOBBY_SETTINGS' | 'CHANGE_PAWN_COLOR' | 'START_GAME' | 'PIN_CHAT' | 'TOGGLE_SPECTATOR_ROLE';
  playerId: string;
  payload?: any;
}

export interface EngineEvent {
  type: 'DICE_ROLLED' | 'PIECE_MOVED' | 'PHASE_CHANGED' | 'TURN_ENDED' | 'PLAYER_JOINED' | 'PLAYER_WON' | 'DISCORD_PINNED' | 'PROPERTY_BOUGHT' | 'RENT_PAID' | 'CARD_PLAYED' | 'CARD_DRAWN' | 'UNO_REVERSED' | 'UNO_SKIPPED' | 'SALARY_COLLECTED' | 'CHANCE_BONUS' | 'TAX_PAID' | 'LOBBY_GAME_SELECTED' | 'LOBBY_SETTINGS_UPDATED' | 'PAWN_COLOR_CHANGED' | 'GAME_STARTED' | 'CHAT_PINNED' | 'SPECTATOR_ROLE_TOGGLED';
  playerId?: string;
  payload?: any;
  timestamp: number;
}
