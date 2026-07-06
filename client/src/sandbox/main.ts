import { EngineState } from '../engine/types';
import { SyncEngine } from '../network/syncEngine';

// Local State Storage variables
let syncEngine: SyncEngine | null = null;
let activeSeatId = 'P1';

const REST_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

const app = document.getElementById('app');

function renderMatchmaking() {
  if (!app) return;
  app.innerHTML = `
    <div class="sandbox-panel" style="grid-column: span 2; max-width: 600px; margin: 0 auto; width: 100%;">
      <div class="title-header">
        <h1>WebTabletop Multiplayer Lobby</h1>
        <p style="color: var(--text-muted); margin: 0;">Lobby matchmaking and WebRTC peer connection setup.</p>
      </div>

      <div style="display: flex; flex-direction: column; gap: 16px; margin-top: 10px;">
        <div style="border-bottom: 1px solid var(--panel-border); padding-bottom: 16px;">
          <h3>Create a New Lobby</h3>
          <button class="action-btn" id="btn-create-lobby">Host a Game</button>
        </div>

        <div style="border-bottom: 1px solid var(--panel-border); padding-bottom: 16px;">
          <h3>Join an Existing Lobby</h3>
          <div style="display: flex; gap: 10px; align-items: center;">
            <input type="text" id="input-lobby-code" placeholder="Enter Lobby Code" style="background: #1e293b; color: white; border: 1px solid var(--panel-border); padding: 12px; border-radius: 8px; font-size: 14px; text-transform: uppercase; width: 200px;">
            <button class="action-btn" id="btn-join-lobby">Join Game</button>
          </div>
        </div>

        <div>
          <h3>Reconnect to Session</h3>
          <p style="font-size: 12px; color: var(--text-muted);">Paste session details below to reconnect P2P link.</p>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <input type="text" id="recon-lobby" placeholder="Lobby Code" style="background: #1e293b; color: white; border: 1px solid var(--panel-border); padding: 8px; border-radius: 6px;">
            <input type="text" id="recon-player" placeholder="Player ID (e.g. P2)" style="background: #1e293b; color: white; border: 1px solid var(--panel-border); padding: 8px; border-radius: 6px;">
            <input type="text" id="recon-hash" placeholder="Secret Hash" style="background: #1e293b; color: white; border: 1px solid var(--panel-border); padding: 8px; border-radius: 6px;">
            <button class="action-btn" id="btn-reconnect-lobby" style="width: 150px; margin-top: 8px;">Reconnect</button>
          </div>
        </div>

        <div class="error-toast" id="matchmaking-error"></div>
      </div>
    </div>
  `;

  // Bind actions
  document.getElementById('btn-create-lobby')?.addEventListener('click', async () => {
    showError('');
    try {
      const res = await fetch(`${REST_URL}/api/lobby/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traits: { emojiFace: '🦊', color: '#ef4444' } })
      });
      const data = await res.json();
      initializeSync(data.lobbyId, data.playerId, data.secretHash, true);
    } catch (err: any) {
      showError(`Failed to create lobby: ${err.message}`);
    }
  });

  document.getElementById('btn-join-lobby')?.addEventListener('click', async () => {
    showError('');
    const lobbyId = (document.getElementById('input-lobby-code') as HTMLInputElement).value.toUpperCase().trim();
    if (!lobbyId) {
      showError('Please enter a lobby code.');
      return;
    }

    try {
      const res = await fetch(`${REST_URL}/api/lobby/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lobbyId, traits: { emojiFace: '🐼', color: '#3b82f6' } })
      });
      if (!res.ok) {
        showError(await res.text());
        return;
      }
      const data = await res.json();

      // Retrieve state backup
      const stateRes = await fetch(`${REST_URL}/api/lobby/${lobbyId}/state`);
      const stateData = await stateRes.json();

      initializeSync(lobbyId, data.playerId, data.secretHash, false, stateData.state);
    } catch (err: any) {
      showError(`Failed to join lobby: ${err.message}`);
    }
  });

  document.getElementById('btn-reconnect-lobby')?.addEventListener('click', async () => {
    showError('');
    const lobbyId = (document.getElementById('recon-lobby') as HTMLInputElement).value.toUpperCase().trim();
    const playerId = (document.getElementById('recon-player') as HTMLInputElement).value.trim();
    const secretHash = (document.getElementById('recon-hash') as HTMLInputElement).value.trim();

    if (!lobbyId || !playerId || !secretHash) {
      showError('All reconnect fields are required.');
      return;
    }

    try {
      // Retrieve state backup
      const stateRes = await fetch(`${REST_URL}/api/lobby/${lobbyId}/state`);
      if (!stateRes.ok) {
        showError('Session lobby not found.');
        return;
      }
      const stateData = await stateRes.json();
      const isHost = playerId === 'P1';

      initializeSync(lobbyId, playerId, secretHash, isHost, stateData.state);
    } catch (err: any) {
      showError(`Reconnection error: ${err.message}`);
    }
  });
}

function showError(msg: string) {
  const box = document.getElementById('matchmaking-error');
  if (box) {
    if (msg) {
      box.innerText = msg;
      box.style.display = 'block';
    } else {
      box.style.display = 'none';
    }
  }
}

async function initializeSync(lobbyId: string, playerId: string, secretHash: string, isHost: boolean, savedState?: EngineState) {
  activeSeatId = playerId;

  // Setup initial default engine state if not restored
  const initialState: EngineState = savedState || {
    seed: 'tabletop-seed-' + Math.random().toString(36).substring(7),
    prngState: 0,
    players: {
      'P1': { id: 'P1', color: '#ef4444', skinTone: 'light', emojiFace: '🦊', isHost: true }
    },
    turn: {
      currentPlayerId: 'P1',
      phase: 'StartTurn'
    },
    eventLog: [],
    moduleState: {
      lastDiceValue: 0,
      playerPositions: { 'P1': 0 }
    }
  };

  // Add ourselves to players table dynamically if not present
  if (!initialState.players[playerId]) {
    initialState.players[playerId] = {
      id: playerId,
      color: playerId === 'P1' ? '#ef4444' : '#3b82f6',
      skinTone: 'medium',
      emojiFace: playerId === 'P1' ? '🦊' : '🐼',
      isHost: playerId === 'P1'
    };
    initialState.moduleState.playerPositions[playerId] = 0;
  }

  // Setup main layout for game session
  if (app) {
    app.innerHTML = `
      <div class="sandbox-panel">
        <div class="title-header">
          <h1>Lobby Code: <span style="color: #a855f7;">${lobbyId}</span></h1>
          <p style="color: var(--text-muted); margin: 0;">Connected seat: <strong style="color: white;">${playerId}</strong> (${isHost ? 'AUTHORITATIVE HOST' : 'PEER'})</p>
        </div>

        <div style="background: rgba(255,255,255,0.02); border-radius: 8px; padding: 12px; font-size: 11px; font-family: monospace;">
          <strong>RECONNECT KEY:</strong> Copy the below payload to restore session:<br>
          <code style="color: #f43f5e; word-break: break-all;">Lobby: ${lobbyId} | Player: ${playerId} | Hash: ${secretHash}</code>
        </div>

        <div id="migration-banner" style="background: rgba(234,179,8,0.1); border: 1px solid rgba(234,179,8,0.3); padding: 10px; border-radius: 8px; display: none; color: #facc15; font-weight: bold; font-size: 13px;">
          ⚠️ Authoritative Host Disconnected. Migrating hosting authority to next peer...
        </div>

        <div>
          <h3>Lobby Active Seats</h3>
          <div id="player-list"></div>
        </div>

        <div>
          <h3>Gameplay Actions</h3>
          <div id="actions-panel">
            <button class="action-btn" id="btn-roll" disabled>Roll Dice</button>
            <button class="action-btn" id="btn-move" disabled>Move (Simulate Steps)</button>
            <button class="action-btn" id="btn-end" disabled>End Turn</button>
          </div>
          <div class="error-toast" id="error-box"></div>
        </div>

        <div>
          <h3>P2P Match Events</h3>
          <div class="event-feed" id="event-feed"></div>
        </div>
      </div>

      <div class="sandbox-panel">
        <h3>Live Replicated State Inspector</h3>
        <div class="state-inspector" id="state-inspector"></div>
      </div>
    `;

    // Bind event listeners
    document.getElementById('btn-roll')?.addEventListener('click', () => {
      syncEngine?.dispatch('ROLL_DICE');
    });

    document.getElementById('btn-move')?.addEventListener('click', () => {
      const steps = syncEngine?.state.moduleState.lastDiceValue || 4;
      syncEngine?.dispatch('MOVE_PIECE', { spaces: steps });
    });

    document.getElementById('btn-end')?.addEventListener('click', () => {
      syncEngine?.dispatch('END_TURN');
    });
  }

  // Create and start SyncEngine
  syncEngine = new SyncEngine(
    initialState,
    lobbyId,
    playerId,
    secretHash,
    isHost,
    WS_URL,
    REST_URL,
    (updatedState) => {
      // Check if role changed (Host Migration happened)
      if (syncEngine && syncEngine.isHost !== isHost) {
        isHost = syncEngine.isHost;
        const banner = document.getElementById('migration-banner');
        if (banner) banner.style.display = 'none';

        // Re-update headers
        const header = document.querySelector('.title-header p');
        if (header) {
          header.innerHTML = `Connected seat: <strong style="color: white;">${playerId}</strong> (AUTHORITATIVE HOST - TAKEOVER)`;
        }
      }
      updateUI(updatedState);
    },
    (errorMsg) => {
      const errBox = document.getElementById('error-box');
      if (errBox) {
        errBox.innerText = `Engine Validation Error: ${errorMsg}`;
        errBox.style.display = 'block';
        setTimeout(() => { errBox.style.display = 'none'; }, 4000);
      }
    }
  );

  try {
    await syncEngine.start();
    updateUI(initialState);
  } catch (err: any) {
    alert(`Failed P2P Connection: ${err.message}`);
    renderMatchmaking();
  }
}

function updateUI(gameState: EngineState) {
  // Update Players
  const playerList = document.getElementById('player-list');
  if (playerList) {
    playerList.innerHTML = Object.values(gameState.players).map(p => {
      const isActive = gameState.turn.currentPlayerId === p.id;
      const isOurSeat = activeSeatId === p.id;
      return `
        <div class="player-slot ${isActive ? 'active' : ''}">
          <div class="pawn-avatar" style="background-color: ${p.color};">${p.emojiFace}</div>
          <div style="flex-grow: 1;">
            <strong>Player ${p.id === 'P1' ? '1' : p.id}</strong>
            <span style="font-size: 12px; color: var(--text-muted); margin-left: 10px;">Position: Tile ${gameState.moduleState.playerPositions[p.id] || 0}</span>
            ${isOurSeat ? '<span style="font-size: 11px; background: rgba(99, 102, 241, 0.2); border-radius: 4px; padding: 2px 6px; margin-left: 10px;">YOU</span>' : ''}
          </div>
          <div>${isActive ? `<span style="color: #6366f1; font-weight: 700;">Active Turn (${gameState.turn.phase})</span>` : 'Waiting'}</div>
        </div>
      `;
    }).join('');
  }

  // Update Action Buttons
  const rollBtn = document.getElementById('btn-roll') as HTMLButtonElement;
  const moveBtn = document.getElementById('btn-move') as HTMLButtonElement;
  const endBtn = document.getElementById('btn-end') as HTMLButtonElement;

  const isMyTurn = gameState.turn.currentPlayerId === activeSeatId;

  if (rollBtn && moveBtn && endBtn) {
    rollBtn.disabled = !isMyTurn || (gameState.turn.phase !== 'Roll' && gameState.turn.phase !== 'StartTurn');
    moveBtn.disabled = !isMyTurn || gameState.turn.phase !== 'Move';
    endBtn.disabled = !isMyTurn || gameState.turn.phase !== 'EndTurn';
  }

  // Render Event Feed
  const feed = document.getElementById('event-feed');
  if (feed) {
    feed.innerHTML = gameState.eventLog.map(e => {
      let text = `[Event: ${e.type}]`;
      if (e.type === 'DICE_ROLLED') text = `🎲 Player ${e.playerId} rolled a ${e.payload.value}`;
      if (e.type === 'PIECE_MOVED') text = `🏃 Player ${e.playerId} moved forward ${e.payload.spaces} steps`;
      if (e.type === 'PHASE_CHANGED') text = `⚙️ Phase changed to: ${e.payload.phase}`;
      if (e.type === 'TURN_ENDED') text = `🏁 Player ${e.playerId} ended their turn`;
      return `<div class="event-item">${text}</div>`;
    }).join('');
    feed.scrollTop = feed.scrollHeight;
  }

  // Render Inspector
  const inspector = document.getElementById('state-inspector');
  if (inspector) {
    inspector.innerText = JSON.stringify(gameState, null, 2);
  }
}

// Initial matchmaking render
renderMatchmaking();
