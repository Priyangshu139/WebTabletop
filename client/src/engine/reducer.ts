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
      nextState.players[newPid] = {
        id: newPid,
        color: event.payload.color || '#3b82f6',
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
