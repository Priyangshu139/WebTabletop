import { EngineState, EngineCommand, EngineEvent } from './types';
import { PRNG } from './prng';
import ludoModule from '../sandbox/modules/ludo_go.json';
import monopolyModule from '../sandbox/modules/monopoly_go.json';

export function validateCommand(
  state: EngineState,
  command: EngineCommand,
  prng: PRNG
): EngineEvent[] {
  // Spectator enforcement
  const player = state.players[command.playerId];
  if (player && player.isSpectator) {
    throw new Error('Spectators cannot take actions.');
  }

  // Lobby actions validation
  if (
    command.type === 'SELECT_LOBBY_GAME' ||
    command.type === 'UPDATE_LOBBY_SETTINGS' ||
    command.type === 'CHANGE_PAWN_COLOR' ||
    command.type === 'START_GAME'
  ) {
    if (command.type !== 'CHANGE_PAWN_COLOR' && !player?.isHost) {
      throw new Error('Only the lobby Host can modify settings.');
    }

    if (command.type === 'SELECT_LOBBY_GAME') {
      return [{
        type: 'LOBBY_GAME_SELECTED',
        playerId: command.playerId,
        payload: { game: command.payload.game },
        timestamp: Date.now()
      }];
    }
    if (command.type === 'UPDATE_LOBBY_SETTINGS') {
      return [{
        type: 'LOBBY_SETTINGS_UPDATED',
        playerId: command.playerId,
        payload: { settings: command.payload.settings },
        timestamp: Date.now()
      }];
    }
    if (command.type === 'CHANGE_PAWN_COLOR') {
      return [{
        type: 'PAWN_COLOR_CHANGED',
        playerId: command.playerId,
        payload: { color: command.payload.color },
        timestamp: Date.now()
      }];
    }
    if (command.type === 'START_GAME') {
      return [{
        type: 'GAME_STARTED',
        playerId: command.playerId,
        timestamp: Date.now()
      }];
    }
    if (command.type === 'PIN_CHAT') {
      if (!player?.isHost) {
        throw new Error('Only the host can pin messages.');
      }
      return [{
        type: 'CHAT_PINNED',
        playerId: command.playerId,
        payload: { chat: command.payload.chat },
        timestamp: Date.now()
      }];
    }
    if (command.type === 'TOGGLE_SPECTATOR_ROLE') {
      return [{
        type: 'SPECTATOR_ROLE_TOGGLED',
        playerId: command.playerId,
        timestamp: Date.now()
      }];
    }
  }

  // Turn enforcement (exempt PIN_DISCORD command)
  if (command.type !== 'PIN_DISCORD' && state.turn.currentPlayerId !== command.playerId) {
    throw new Error('Not your turn.');
  }

  const activeModule = state.activeModule || 'ludo-go-classic';

  if (activeModule === 'monopoly-go') {
    return validateMonopolyCommand(state, command, prng);
  } else if (activeModule === 'uno-go') {
    return validateUnoCommand(state, command, prng);
  } else {
    return validateLudoCommand(state, command, prng);
  }
}

function validateLudoCommand(state: EngineState, command: EngineCommand, prng: PRNG): EngineEvent[] {
  const events: EngineEvent[] = [];

  switch (command.type) {
    case 'ROLL_DICE': {
      if (state.turn.phase !== 'Roll' && state.turn.phase !== 'StartTurn') {
        throw new Error('You cannot roll at this phase.');
      }
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

function validateMonopolyCommand(state: EngineState, command: EngineCommand, prng: PRNG): EngineEvent[] {
  const events: EngineEvent[] = [];

  switch (command.type) {
    case 'ROLL_DICE': {
      if (state.turn.phase !== 'Roll' && state.turn.phase !== 'StartTurn') {
        throw new Error('You cannot roll at this phase.');
      }
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
      const spaces = command.payload.spaces;
      const currentPos = state.moduleState.playerPositions[command.playerId] || 0;
      const nextPos = (currentPos + spaces) % 16;

      events.push({
        type: 'PIECE_MOVED',
        playerId: command.playerId,
        payload: { spaces },
        timestamp: Date.now()
      });

      // Crossing GO salary
      if (nextPos < currentPos) {
        events.push({
          type: 'SALARY_COLLECTED',
          playerId: command.playerId,
          timestamp: Date.now()
        });
      }

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
      const tile = monopolyModule.board.tiles[currentPos];

      if (!tile) {
        throw new Error('Invalid board space index.');
      }

      let nextPhase: 'EndTurn' | 'OptionalActions' = 'EndTurn';

      if (tile.type === 'PROPERTY') {
        const owner = state.moduleState.propertiesOwned?.[currentPos];
        if (!owner) {
          // Unowned property: host moves to OptionalActions to buy
          nextPhase = 'OptionalActions';
        } else if (owner !== command.playerId) {
          // Pay rent
          const rent = tile.payload.rent;
          events.push({
            type: 'RENT_PAID',
            playerId: command.playerId,
            payload: { ownerId: owner, rent },
            timestamp: Date.now()
          });
        }
      } else if (tile.type === 'TAX') {
        events.push({
          type: 'TAX_PAID',
          playerId: command.playerId,
          payload: { amount: tile.payload.amount },
          timestamp: Date.now()
        });
      } else if (tile.type === 'CHANCE') {
        events.push({
          type: 'CHANCE_BONUS',
          playerId: command.playerId,
          payload: { bonus: tile.payload.bonus },
          timestamp: Date.now()
        });
      }

      events.push({
        type: 'PHASE_CHANGED',
        payload: { phase: nextPhase },
        timestamp: Date.now()
      });
      break;
    }

    case 'BUY_PROPERTY': {
      if (state.turn.phase !== 'OptionalActions') {
        throw new Error('You cannot buy property at this phase.');
      }

      const currentPos = state.moduleState.playerPositions[command.playerId] || 0;
      const tile = monopolyModule.board.tiles[currentPos];
      if (!tile || tile.type !== 'PROPERTY') {
        throw new Error('Not standing on a purchasable property.');
      }

      const owner = state.moduleState.propertiesOwned?.[currentPos];
      if (owner) {
        throw new Error('Property already owned.');
      }

      const cost = tile.payload?.cost ?? 0;
      const playerMoney = state.players[command.playerId]?.money || 0;
      if (playerMoney < cost) {
        throw new Error('Insufficient funds to buy property.');
      }

      events.push({
        type: 'PROPERTY_BOUGHT',
        playerId: command.playerId,
        payload: { tileIndex: currentPos, cost },
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
      if (state.turn.phase !== 'EndTurn' && state.turn.phase !== 'OptionalActions') {
        throw new Error('You must resolve actions before ending turn.');
      }

      // Check winning conditions: if player money exceeds $2500
      const money = state.players[command.playerId]?.money || 0;
      if (money >= monopolyModule.rules.winningMoney) {
        events.push({
          type: 'PLAYER_WON',
          playerId: command.playerId,
          timestamp: Date.now()
        });
      }

      events.push({
        type: 'TURN_ENDED',
        playerId: command.playerId,
        timestamp: Date.now()
      });
      break;
    }

    case 'PIN_DISCORD': {
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

function validateUnoCommand(state: EngineState, command: EngineCommand, _prng: PRNG): EngineEvent[] {
  const events: EngineEvent[] = [];

  switch (command.type) {
    case 'PLAY_CARD': {
      const card = command.payload.card;
      const playerHand = state.players[command.playerId]?.hand || [];
      const hasCard = playerHand.some((c: any) => c.id === card.id);
      if (!hasCard) {
        throw new Error('Card not in hand.');
      }

      // Check match color/value of top card
      const discard = state.moduleState.unoDiscardPile || [];
      const topCard = discard[discard.length - 1];

      if (topCard) {
        const matchesColor = card.color === topCard.color;
        const matchesValue = card.value === topCard.value;
        if (!matchesColor && !matchesValue) {
          throw new Error('Card color or value does not match discard pile.');
        }
      }

      events.push({
        type: 'CARD_PLAYED',
        playerId: command.playerId,
        payload: { card },
        timestamp: Date.now()
      });

      // Special card effects: SKIP, REVERSE, DRAW_TWO
      const playerIds = Object.keys(state.players);
      const currentIndex = playerIds.indexOf(command.playerId);
      let nextIndex = (currentIndex + 1) % playerIds.length;

      if (card.value === 'SKIP') {
        events.push({
          type: 'UNO_SKIPPED',
          playerId: playerIds[nextIndex],
          timestamp: Date.now()
        });
        // Skip player by adding 1 extra step
        nextIndex = (nextIndex + 1) % playerIds.length;
      } else if (card.value === 'REVERSE') {
        events.push({
          type: 'UNO_REVERSED',
          playerId: command.playerId,
          timestamp: Date.now()
        });
        // Reverse direction: next index goes backward
        nextIndex = (currentIndex - 1 + playerIds.length) % playerIds.length;
      } else if (card.value === 'DRAW_TWO') {
        const victimId = playerIds[nextIndex];
        const deck = state.moduleState.unoDeck || [];
        // Force draw 2 cards
        for (let i = 0; i < Math.min(2, deck.length); i++) {
          events.push({
            type: 'CARD_DRAWN',
            playerId: victimId,
            payload: { card: deck[i] },
            timestamp: Date.now()
          });
        }
        // Skip their turn
        nextIndex = (nextIndex + 1) % playerIds.length;
      }

      // Check win condition
      if (playerHand.length === 1) {
        events.push({
          type: 'PLAYER_WON',
          playerId: command.playerId,
          timestamp: Date.now()
        });
      }

      events.push({
        type: 'TURN_ENDED',
        playerId: command.playerId,
        payload: { nextPlayerId: playerIds[nextIndex] },
        timestamp: Date.now()
      });
      break;
    }

    case 'DRAW_CARD': {
      const deck = state.moduleState.unoDeck || [];
      if (deck.length === 0) {
        throw new Error('Draw deck is empty.');
      }

      const drawnCard = deck[0];
      events.push({
        type: 'CARD_DRAWN',
        playerId: command.playerId,
        payload: { card: drawnCard },
        timestamp: Date.now()
      });

      // End turn automatically after drawing
      const playerIds = Object.keys(state.players);
      const currentIndex = playerIds.indexOf(command.playerId);
      const nextIndex = (currentIndex + 1) % playerIds.length;

      events.push({
        type: 'TURN_ENDED',
        playerId: command.playerId,
        payload: { nextPlayerId: playerIds[nextIndex] },
        timestamp: Date.now()
      });
      break;
    }

    case 'PIN_DISCORD': {
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
