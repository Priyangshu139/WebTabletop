import { EngineState, EngineEvent } from './types';

export function applyEvent(state: EngineState, event: EngineEvent): EngineState {
  // Deep clone state to ensure reducer is pure
  const nextState: EngineState = JSON.parse(JSON.stringify(state));
  nextState.eventLog.push(event);

  switch (event.type) {
    case 'LOBBY_GAME_SELECTED':
      nextState.selectedGame = event.payload.game;
      nextState.activeModule = event.payload.game;
      break;

    case 'LOBBY_SETTINGS_UPDATED':
      nextState.lobbySettings = nextState.lobbySettings || {};
      nextState.lobbySettings = { ...nextState.lobbySettings, ...event.payload.settings };
      if (event.payload.settings.timerLimit !== undefined) {
        nextState.timerLimit = event.payload.settings.timerLimit;
      }
      break;

    case 'PAWN_COLOR_CHANGED': {
      const p = nextState.players[event.playerId!];
      if (p) {
        p.color = event.payload.color;
      }
      break;
    }

    case 'CHAT_PINNED': {
      if (!nextState.pinnedChats) {
        nextState.pinnedChats = [];
      }
      // Deduplicate
      if (!nextState.pinnedChats.find(c => c.id === event.payload.chat.id)) {
        nextState.pinnedChats.push(event.payload.chat);
        // Keep at most 3 pinned chats, remove oldest (first item)
        if (nextState.pinnedChats.length > 3) {
          nextState.pinnedChats.shift();
        }
      }
      break;
    }

    case 'CHAT_UNPINNED': {
      if (nextState.pinnedChats) {
        nextState.pinnedChats = nextState.pinnedChats.filter(c => c.id !== event.payload.chatId);
      }
      break;
    }

    case 'SPECTATOR_ROLE_TOGGLED': {
      const p = nextState.players[event.playerId!];
      if (p) {
        p.isSpectator = !p.isSpectator;
        if (p.isSpectator) {
          p.money = undefined;
          p.hand = undefined;
          delete nextState.moduleState.playerPositions[event.playerId!];
        } else {
          nextState.moduleState.playerPositions[event.playerId!] = 0;
        }
      }
      break;
    }

    case 'GAME_STARTED': {
      nextState.lobbyStarted = true;
      nextState.turnStartedAt = Date.now();
      nextState.turn.phase = 'StartTurn';

      const activeGame = nextState.selectedGame || 'ludo-go-classic';
      
      // Enforce game limits: all current games support max 4 players
      const limit = 4;
      const sortedPids = Object.keys(nextState.players).sort((a, b) => {
        const numA = parseInt(a.replace('P', '')) || 0;
        const numB = parseInt(b.replace('P', '')) || 0;
        return numA - numB;
      });

      let activeCount = 0;
      sortedPids.forEach(pid => {
        const p = nextState.players[pid];
        if (p.isSpectator) {
          p.isSpectator = true;
          p.money = undefined;
          p.hand = undefined;
        } else {
          if (activeCount < limit) {
            p.isSpectator = false;
            activeCount++;
          } else {
            p.isSpectator = true;
            p.money = undefined;
            p.hand = undefined;
          }
        }
      });

      const firstActive = sortedPids.find(pid => !nextState.players[pid].isSpectator) || 'P1';
      nextState.turn.currentPlayerId = firstActive;

      if (activeGame === 'uno-go') {
        nextState.moduleState.unoDeck = event.payload.unoDeck;
        nextState.moduleState.unoDiscardPile = event.payload.unoDiscardPile;

        Object.keys(nextState.players).forEach(pid => {
          const p = nextState.players[pid];
          if (!p.isSpectator) {
            p.hand = event.payload.startHands?.[pid] || [];
          }
        });
      } else {
        nextState.moduleState.playerPositions = {};
        Object.keys(nextState.players).forEach(pid => {
          const p = nextState.players[pid];
          if (!p.isSpectator) {
            nextState.moduleState.playerPositions[pid] = 0;
            p.money = activeGame === 'monopoly-go' ? 1500 : undefined;
          }
        });
        nextState.moduleState.propertiesOwned = activeGame === 'monopoly-go' ? {} : undefined;
      }
      break;
    }

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

    case 'TURN_ENDED': {
      const playerIds = Object.keys(nextState.players).filter(pid => !nextState.players[pid].isSpectator);
      const targetNextPlayerId = event.payload?.nextPlayerId;
      if (targetNextPlayerId && nextState.players[targetNextPlayerId] && !nextState.players[targetNextPlayerId].isSpectator) {
        nextState.turn.currentPlayerId = targetNextPlayerId;
      } else if (playerIds.length > 0) {
        const currentIndex = playerIds.indexOf(nextState.turn.currentPlayerId);
        const nextIndex = (currentIndex + 1) % playerIds.length;
        nextState.turn.currentPlayerId = playerIds[nextIndex];
      }
      nextState.turn.phase = 'StartTurn';
      nextState.turnStartedAt = Date.now();
      break;
    }

    case 'PLAYER_JOINED': {
      const newPid = event.playerId!;
      const isSpec = !!event.payload.isSpectator;
      
      let baseColor = event.payload.color || '#3b82f6';
      if (!isSpec) {
        const existingColors = Object.values(nextState.players)
          .filter(p => p.id !== newPid && !p.isSpectator)
          .map(p => p.color.toLowerCase());

        const distinctColors = [
          '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7',
          '#f97316', '#ec4899', '#14b8a6', '#06b6d4', '#f43f5e'
        ];

        const matchColor = baseColor.toLowerCase();
        if (existingColors.includes(matchColor)) {
          const freeColor = distinctColors.find(c => !existingColors.includes(c.toLowerCase()));
          if (freeColor) {
            baseColor = freeColor;
          }
        }
      }

      nextState.players[newPid] = {
        id: newPid,
        color: baseColor,
        skinTone: event.payload.skinTone || 'medium',
        emojiFace: event.payload.emojiFace || '🐼',
        isHost: false,
        isSpectator: isSpec,
        money: !isSpec && nextState.activeModule === 'monopoly-go' ? 1500 : undefined,
        hand: !isSpec && nextState.activeModule === 'uno-go' ? event.payload.startHand || [] : undefined
      };
      if (!isSpec) {
        nextState.moduleState.playerPositions[newPid] = 0;
      }
      nextState.turnStartedAt = Date.now();
      break;
    }

    case 'DISCORD_PINNED':
      nextState.discordInviteLink = event.payload.link;
      break;

    case 'PROPERTY_BOUGHT': {
      const pId = event.playerId!;
      const tileIndex = event.payload.tileIndex;
      const cost = event.payload.cost;
      if (nextState.players[pId]) {
        nextState.players[pId].money = (nextState.players[pId].money || 0) - cost;
      }
      if (!nextState.moduleState.propertiesOwned) {
        nextState.moduleState.propertiesOwned = {};
      }
      nextState.moduleState.propertiesOwned[tileIndex] = pId;
      break;
    }

    case 'RENT_PAID': {
      const tenantId = event.playerId!;
      const ownerId = event.payload.ownerId;
      const rent = event.payload.rent;
      if (nextState.players[tenantId]) {
        nextState.players[tenantId].money = (nextState.players[tenantId].money || 0) - rent;
      }
      if (nextState.players[ownerId]) {
        nextState.players[ownerId].money = (nextState.players[ownerId].money || 0) + rent;
      }
      break;
    }

    case 'SALARY_COLLECTED': {
      const pId = event.playerId!;
      if (nextState.players[pId]) {
        nextState.players[pId].money = (nextState.players[pId].money || 0) + 200;
      }
      break;
    }

    case 'CHANCE_BONUS': {
      const pId = event.playerId!;
      const bonus = event.payload.bonus;
      if (nextState.players[pId]) {
        nextState.players[pId].money = (nextState.players[pId].money || 0) + bonus;
      }
      break;
    }

    case 'TAX_PAID': {
      const pId = event.playerId!;
      const amount = event.payload.amount;
      if (nextState.players[pId]) {
        nextState.players[pId].money = (nextState.players[pId].money || 0) - amount;
      }
      break;
    }

    case 'CARD_PLAYED': {
      const pId = event.playerId!;
      const card = event.payload.card;
      if (nextState.players[pId] && nextState.players[pId].hand) {
        nextState.players[pId].hand = nextState.players[pId].hand!.filter((c: any) => c.id !== card.id);
      }
      if (!nextState.moduleState.unoDiscardPile) {
        nextState.moduleState.unoDiscardPile = [];
      }
      nextState.moduleState.unoDiscardPile.push(card);
      break;
    }

    case 'CARD_DRAWN': {
      const pId = event.playerId!;
      const card = event.payload.card;
      if (nextState.players[pId]) {
        if (!nextState.players[pId].hand) nextState.players[pId].hand = [];
        nextState.players[pId].hand!.push(card);
      }
      if (nextState.moduleState.unoDeck) {
        nextState.moduleState.unoDeck = nextState.moduleState.unoDeck.filter((c: any) => c.id !== card.id);
      }
      break;
    }
  }

  return nextState;
}
