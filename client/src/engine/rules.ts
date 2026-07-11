import { EngineState, EngineCommand, EngineEvent } from './types';
import { PRNG } from './prng';
import ludoModule from '../sandbox/modules/ludo_go.json';
import monopolyModule from '../sandbox/modules/monopoly_go.json';

export function validateCommand(
  state: EngineState,
  command: EngineCommand,
  prng: PRNG
): EngineEvent[] {
  // Spectator enforcement (exempt role toggle command)
  const player = state.players[command.playerId];
  if (player && player.isSpectator && command.type !== 'TOGGLE_SPECTATOR_ROLE') {
    throw new Error('Spectators cannot take actions.');
  }

  // Lobby actions validation
  if (
    command.type === 'SELECT_LOBBY_GAME' ||
    command.type === 'UPDATE_LOBBY_SETTINGS' ||
    command.type === 'CHANGE_PAWN_COLOR' ||
    command.type === 'START_GAME' ||
    command.type === 'QUIT_MATCH'
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
    if (command.type === 'QUIT_MATCH') {
      return [{
        type: 'MATCH_QUIT',
        playerId: command.playerId,
        timestamp: Date.now()
      }];
    }
    if (command.type === 'START_GAME') {
      const activeGame = state.activeModule || 'ludo-go-classic';
      const payload: any = {};

      if (activeGame === 'uno-go') {
        const colors = ['red', 'blue', 'green', 'yellow'];
        let idCounter = 0;
        const unoDeck: any[] = [];
        const unoDiscardPile: any[] = [];

        colors.forEach(color => {
          // Numbered cards: One '0'
          unoDeck.push({ id: `c-${idCounter++}`, color, value: '0' });
          // Two of '1' through '9'
          for (let num = 1; num <= 9; num++) {
            unoDeck.push({ id: `c-${idCounter++}`, color, value: String(num) });
            unoDeck.push({ id: `c-${idCounter++}`, color, value: String(num) });
          }

          // Action cards: Two of Skip, Reverse, Draw Two
          const actions = ['SKIP', 'REVERSE', 'DRAW_TWO'];
          actions.forEach(action => {
            unoDeck.push({ id: `c-${idCounter++}`, color, value: action });
            unoDeck.push({ id: `c-${idCounter++}`, color, value: action });
          });
        });

        // Wild cards: Four Wild and four Wild Draw Four
        for (let i = 0; i < 4; i++) {
          unoDeck.push({ id: `c-${idCounter++}`, color: 'wild', value: 'WILD' });
          unoDeck.push({ id: `c-${idCounter++}`, color: 'wild', value: 'WILD_DRAW_FOUR' });
        }

        // Deterministic shuffle using Fisher-Yates with the passed PRNG
        for (let i = unoDeck.length - 1; i > 0; i--) {
          const j = Math.floor(prng.next() * (i + 1));
          const temp = unoDeck[i];
          unoDeck[i] = unoDeck[j];
          unoDeck[j] = temp;
        }

        unoDiscardPile.push(unoDeck.shift());

        payload.unoDeck = unoDeck;
        payload.unoDiscardPile = unoDiscardPile;
        payload.clockwise = true;

        // Deal starting hands deterministically
        const startHands: Record<string, any[]> = {};
        const playerIds = Object.keys(state.players);
        playerIds.forEach(pid => {
          const p = state.players[pid];
          if (!p.isSpectator) {
            startHands[pid] = [];
            for (let i = 0; i < 7; i++) {
              if (unoDeck.length > 0) {
                startHands[pid].push(unoDeck.shift());
              }
            }
          }
        });
        payload.startHands = startHands;
      }

      return [{
        type: 'GAME_STARTED',
        playerId: command.playerId,
        payload,
        timestamp: Date.now()
      }];
    }
  }

  if (command.type === 'PIN_CHAT') {
    if (!player?.isHost) {
      throw new Error('Only the host can pin messages.');
    }
    const alreadyPinned = state.pinnedChats?.some(c => c.id === command.payload.chat?.id);
    if (alreadyPinned) {
      throw new Error('Message is already pinned.');
    }
    return [{
      type: 'CHAT_PINNED',
      playerId: command.playerId,
      payload: { chat: command.payload.chat },
      timestamp: Date.now()
    }];
  }
  if (command.type === 'UNPIN_CHAT') {
    if (!player?.isHost) {
      throw new Error('Only the host can unpin messages.');
    }
    return [{
      type: 'CHAT_UNPINNED',
      playerId: command.playerId,
      payload: { chatId: command.payload.chatId },
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

  // Turn enforcement (exempt out-of-turn actions)
  const exemptCommands = ['PIN_DISCORD', 'PIN_CHAT', 'UNPIN_CHAT', 'TOGGLE_SPECTATOR_ROLE'];
  if (!exemptCommands.includes(command.type) && state.turn.currentPlayerId !== command.playerId) {
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

function validateUnoCommand(state: EngineState, command: EngineCommand, prng: PRNG): EngineEvent[] {
  const events: EngineEvent[] = [];

  switch (command.type) {
    case 'CALL_UNO': {
      events.push({
        type: 'UNO_CALLED',
        playerId: command.playerId,
        timestamp: Date.now()
      });
      break;
    }

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
        const requiredColor = state.moduleState.activeColor || topCard.color;
        const matchesColor = card.color === 'wild' || requiredColor === 'wild' || card.color === requiredColor;
        const matchesValue = card.value === topCard.value;
        if (!matchesColor && !matchesValue) {
          throw new Error('Card color or value does not match discard pile.');
        }
      }

      // Wild card color choice validation
      let chosenColor = command.payload.chosenColor;
      if (card.color === 'wild') {
        if (!chosenColor || !['red', 'blue', 'green', 'yellow'].includes(chosenColor.toLowerCase())) {
          throw new Error('Choosing a color is required for Wild cards.');
        }
        chosenColor = chosenColor.toLowerCase();
      }

      events.push({
        type: 'CARD_PLAYED',
        playerId: command.playerId,
        payload: { card, chosenColor },
        timestamp: Date.now()
      });

      // Turn Order & Special Card Effects
      const playerIds = Object.keys(state.players).filter(pid => !state.players[pid].isSpectator);
      const currentIndex = playerIds.indexOf(command.playerId);
      const isClockwise = state.moduleState.clockwise !== false;
      
      let newClockwise = isClockwise;
      let step = isClockwise ? 1 : -1;
      let nextIndex = (currentIndex + step + playerIds.length) % playerIds.length;

      let localDeck = [...(state.moduleState.unoDeck || [])];
      let localDiscard = [...discard];

      // Helper to draw cards with automatic reshuffling
      const drawCardsForPlayer = (victimId: string, count: number) => {
        for (let i = 0; i < count; i++) {
          if (localDeck.length === 0 && localDiscard.length > 1) {
            // Reshuffle discard pile except top card
            const top = localDiscard.pop(); // Keep top card
            const newShuffled = [...localDiscard];
            for (let x = newShuffled.length - 1; x > 0; x--) {
              const y = Math.floor(prng.next() * (x + 1));
              const t = newShuffled[x];
              newShuffled[x] = newShuffled[y];
              newShuffled[y] = t;
            }
            events.push({
              type: 'UNO_DECK_RESHUFFLED',
              payload: { newDeck: newShuffled, topCard: top },
              timestamp: Date.now()
            });
            localDeck = newShuffled;
            localDiscard = [top];
          }

          if (localDeck.length > 0) {
            const drawn = localDeck.shift();
            events.push({
              type: 'CARD_DRAWN',
              playerId: victimId,
              payload: { card: drawn },
              timestamp: Date.now()
            });
          }
        }
      };

      if (card.value === 'SKIP') {
        events.push({
          type: 'UNO_SKIPPED',
          playerId: playerIds[nextIndex],
          timestamp: Date.now()
        });
        nextIndex = (nextIndex + step + playerIds.length) % playerIds.length;
      } else if (card.value === 'REVERSE') {
        events.push({
          type: 'UNO_REVERSED',
          playerId: command.playerId,
          payload: { clockwise: !isClockwise },
          timestamp: Date.now()
        });
        if (playerIds.length === 2) {
          // In 2-player game, Reverse acts as Skip
          nextIndex = (nextIndex + step + playerIds.length) % playerIds.length;
        } else {
          newClockwise = !isClockwise;
          step = newClockwise ? 1 : -1;
          nextIndex = (currentIndex + step + playerIds.length) % playerIds.length;
        }
      } else if (card.value === 'DRAW_TWO') {
        const victimId = playerIds[nextIndex];
        drawCardsForPlayer(victimId, 2);
        nextIndex = (nextIndex + step + playerIds.length) % playerIds.length;
      } else if (card.value === 'WILD_DRAW_FOUR') {
        const victimId = playerIds[nextIndex];
        drawCardsForPlayer(victimId, 4);
        nextIndex = (nextIndex + step + playerIds.length) % playerIds.length;
      }

      // Check win condition
      // (hand size before card is played was 1, meaning now it becomes 0)
      if (playerHand.length === 1) {
        events.push({
          type: 'PLAYER_WON',
          playerId: command.playerId,
          timestamp: Date.now()
        });
      } else if (playerHand.length === 2) {
        // Playing second-to-last card leaving them with 1 card.
        // Check if they called UNO.
        const p = state.players[command.playerId];
        if (!p.calledUno) {
          // Penalty: draw 2 cards!
          drawCardsForPlayer(command.playerId, 2);
        }
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
      let localDeck = [...(state.moduleState.unoDeck || [])];
      let localDiscard = [...(state.moduleState.unoDiscardPile || [])];

      if (localDeck.length === 0 && localDiscard.length > 1) {
        const top = localDiscard.pop(); // Keep top card
        const newShuffled = [...localDiscard];
        for (let x = newShuffled.length - 1; x > 0; x--) {
          const y = Math.floor(prng.next() * (x + 1));
          const t = newShuffled[x];
          newShuffled[x] = newShuffled[y];
          newShuffled[y] = t;
        }
        events.push({
          type: 'UNO_DECK_RESHUFFLED',
          payload: { newDeck: newShuffled, topCard: top },
          timestamp: Date.now()
        });
        localDeck = newShuffled;
        localDiscard = [top];
      }

      if (localDeck.length === 0) {
        throw new Error('Draw deck is empty.');
      }

      const drawnCard = localDeck.shift();
      events.push({
        type: 'CARD_DRAWN',
        playerId: command.playerId,
        payload: { card: drawnCard },
        timestamp: Date.now()
      });

      // End turn automatically after drawing
      const playerIds = Object.keys(state.players).filter(pid => !state.players[pid].isSpectator);
      const currentIndex = playerIds.indexOf(command.playerId);
      const isClockwise = state.moduleState.clockwise !== false;
      const step = isClockwise ? 1 : -1;
      const nextIndex = (currentIndex + step + playerIds.length) % playerIds.length;

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
