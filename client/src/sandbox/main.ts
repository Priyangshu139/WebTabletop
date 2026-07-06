import { EngineState } from '../engine/types';
import { SyncEngine } from '../network/syncEngine';
import { ReplayEngine, ReplayPayload } from '../engine/replay';
import ludoModule from './modules/ludo_go.json';

// Local controllers
let syncEngine: SyncEngine | null = null;
let replayEngine: ReplayEngine | null = null;
let activeSeatId = 'P1';
let isReplayMode = false;

// Zoom scale state
let currentScale = 1.0;
let initialPinchDist = 0;

const REST_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

const app = document.getElementById('app');

function renderMatchmaking() {
  if (!app) return;
  isReplayMode = false;
  if (replayEngine) {
    replayEngine.destroy();
    replayEngine = null;
  }

  app.innerHTML = `
    <div class="sandbox-panel" style="grid-column: span 2; max-width: 600px; margin: 0 auto; width: 100%;">
      <div class="title-header">
        <h1>WebTabletop Multiplayer Lobby</h1>
        <p style="color: var(--text-muted); margin: 0;">Lobby matchmaking, WebRTC P2P setup, and Replay Sandbox.</p>
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

        <div style="border-bottom: 1px solid var(--panel-border); padding-bottom: 16px;">
          <h3>Reconnect to Session</h3>
          <p style="font-size: 12px; color: var(--text-muted);">Paste session details below to reconnect P2P link.</p>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <input type="text" id="recon-lobby" placeholder="Lobby Code" style="background: #1e293b; color: white; border: 1px solid var(--panel-border); padding: 8px; border-radius: 6px;">
            <input type="text" id="recon-player" placeholder="Player ID (e.g. P2)" style="background: #1e293b; color: white; border: 1px solid var(--panel-border); padding: 8px; border-radius: 6px;">
            <input type="text" id="recon-hash" placeholder="Secret Hash" style="background: #1e293b; color: white; border: 1px solid var(--panel-border); padding: 8px; border-radius: 6px;">
            <button class="action-btn" id="btn-reconnect-lobby" style="width: 150px; margin-top: 8px;">Reconnect</button>
          </div>
        </div>

        <div>
          <h3>Load Event-Sourced Replay</h3>
          <p style="font-size: 12px; color: var(--text-muted);">Upload a match save file (.json) to step through event history.</p>
          <input type="file" id="input-upload-replay" accept=".json" style="background: #1e293b; border: 1px solid var(--panel-border); padding: 10px; border-radius: 8px; width: 100%;">
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

  document.getElementById('input-upload-replay')?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const payload: ReplayPayload = JSON.parse(evt.target?.result as string);
        initializeReplay(payload);
      } catch (err: any) {
        showError(`Invalid replay file structure: ${err.message}`);
      }
    };
    reader.readAsText(file);
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
  isReplayMode = false;

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

        <!-- 3D Viewport Zoom Surface -->
        <div>
          <h3>Ludo Go Board Surface</h3>
          <p style="font-size: 11px; color: var(--text-muted); margin: 0 0 6px 0;">Use mouse wheel or pinch gestures to zoom viewport.</p>
          <div id="camera-viewport" style="overflow: hidden; width: 100%; max-width: 360px; height: 360px; margin: 10px auto; border: 1px solid var(--panel-border); border-radius: 12px; position: relative; background: rgba(0,0,0,0.25);">
            <div id="camera-content" style="transform-origin: center center; transition: transform 0.1s ease-out; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; transform: scale(1.0);">
              <div id="board-container" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; width: 320px; height: 320px;"></div>
            </div>
          </div>
        </div>

        <div>
          <h3>Lobby Active Seats</h3>
          <div id="player-list"></div>
        </div>

        <div>
          <h3>Gameplay Actions</h3>
          
          <!-- Flick physics throwing pad -->
          <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--panel-border); border-radius: 12px; padding: 12px; margin-bottom: 12px; text-align: center;">
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 0;">Drag and FLICK the dice to roll!</p>
            <div class="dice-3d-surface">
              <div id="physical-dice" class="dice-3d">🎲</div>
            </div>
          </div>

          <div id="actions-panel">
            <button class="action-btn" id="btn-move" disabled style="width: 100%; margin-bottom: 8px;">Move Piece</button>
            <button class="action-btn" id="btn-resolve" disabled style="width: 100%; margin-bottom: 8px;">Resolve Tile Space</button>
            <button class="action-btn" id="btn-end" disabled style="width: 100%;">End Turn</button>
          </div>
          <div class="error-toast" id="error-box"></div>
          <button class="action-btn" id="btn-download-replay" style="margin-top: 14px; background: #0ea5e9; width: 100%;">💾 Download Match Replay File</button>
          <button class="action-btn" id="btn-exit-game" style="margin-top: 8px; background: #64748b; width: 100%;">🛑 Exit Match to Lobby</button>
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

      <!-- Victory Celeb Overlay -->
      <div id="victory-overlay" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.9); flex-direction: column; align-items: center; justify-content: center; text-align: center; z-index: 1000;"></div>
    `;

    // Bind viewport camera zoom listeners
    bindCameraViewport();

    // Bind physical dice throw listeners
    bindPhysicsDice();

    // Bind event listeners
    document.getElementById('btn-move')?.addEventListener('click', () => {
      const steps = syncEngine?.state.moduleState.lastDiceValue || 4;
      syncEngine?.dispatch('MOVE_PIECE', { spaces: steps });
    });

    document.getElementById('btn-resolve')?.addEventListener('click', () => {
      syncEngine?.dispatch('RESOLVE_TILE');
    });

    document.getElementById('btn-end')?.addEventListener('click', () => {
      syncEngine?.dispatch('END_TURN');
    });

    document.getElementById('btn-download-replay')?.addEventListener('click', () => {
      if (!syncEngine) return;
      const replayData = {
        moduleId: ludoModule.moduleId,
        seed: syncEngine.state.seed,
        players: syncEngine.state.players,
        eventLog: syncEngine.state.eventLog
      };
      const blob = new Blob([JSON.stringify(replayData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `replay-${lobbyId}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('btn-exit-game')?.addEventListener('click', () => {
      syncEngine?.close();
      syncEngine = null;
      renderMatchmaking();
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
      if (syncEngine && syncEngine.isHost !== isHost) {
        isHost = syncEngine.isHost;
        const banner = document.getElementById('migration-banner');
        if (banner) banner.style.display = 'none';

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

function initializeReplay(payload: ReplayPayload) {
  isReplayMode = true;

  if (app) {
    app.innerHTML = `
      <div class="sandbox-panel">
        <div class="title-header">
          <h1>Replay: <span style="color: #0ea5e9;">${payload.name || payload.moduleId}</span></h1>
          <p style="color: var(--text-muted); margin: 0;">Replaying event-sourced match log.</p>
        </div>

        <!-- 3D Viewport Zoom Surface -->
        <div>
          <h3>Ludo Go Board Surface</h3>
          <div id="camera-viewport" style="overflow: hidden; width: 100%; max-width: 360px; height: 360px; margin: 10px auto; border: 1px solid var(--panel-border); border-radius: 12px; position: relative; background: rgba(0,0,0,0.25);">
            <div id="camera-content" style="transform-origin: center center; transition: transform 0.1s ease-out; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; transform: scale(1.0);">
              <div id="board-container" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; width: 320px; height: 320px;"></div>
            </div>
          </div>
        </div>

        <div>
          <h3>Active Players</h3>
          <div id="player-list"></div>
        </div>

        <div>
          <h3>Scrubbing Timeline Controls</h3>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 12px; font-family: monospace;" id="lbl-curr-step">-1</span>
              <input type="range" id="replay-timeline" min="-1" max="${payload.eventLog.length - 1}" value="-1" style="flex-grow: 1;">
              <span style="font-size: 12px; font-family: monospace;">${payload.eventLog.length - 1}</span>
            </div>

            <div style="display: flex; gap: 8px; justify-content: center;">
              <button class="action-btn" id="btn-replay-restart" style="background: #475569;">⏮️ Restart</button>
              <button class="action-btn" id="btn-replay-prev" style="background: #475569;">◀️ Prev</button>
              <button class="action-btn" id="btn-replay-play" style="background: #10b981;">▶️ Play</button>
              <button class="action-btn" id="btn-replay-next" style="background: #475569;">▶️ Next</button>
            </div>
            <button class="action-btn" id="btn-exit-replay" style="background: #e2e8f0; color: #1e293b; margin-top: 10px;">⏹️ Exit Replay Viewer</button>
          </div>
        </div>

        <div>
          <h3>Event History</h3>
          <div class="event-feed" id="event-feed"></div>
        </div>
      </div>

      <div class="sandbox-panel">
        <h3>Rehydrated State Inspector</h3>
        <div class="state-inspector" id="state-inspector"></div>
      </div>
    `;

    // Bind camera zoom listeners in replay mode too
    bindCameraViewport();

    // Instantiate Replay Engine
    replayEngine = new ReplayEngine(payload, (rehydratedState) => {
      updateUI(rehydratedState);

      const stepLbl = document.getElementById('lbl-curr-step');
      const slider = document.getElementById('replay-timeline') as HTMLInputElement;
      if (stepLbl) stepLbl.innerText = String(replayEngine?.currentIndex);
      if (slider) slider.value = String(replayEngine?.currentIndex);
    });

    const playBtn = document.getElementById('btn-replay-play') as HTMLButtonElement;
    const timeline = document.getElementById('replay-timeline') as HTMLInputElement;

    document.getElementById('btn-replay-restart')?.addEventListener('click', () => {
      replayEngine?.goToEvent(-1);
    });

    document.getElementById('btn-replay-prev')?.addEventListener('click', () => {
      replayEngine?.stepBackward();
    });

    document.getElementById('btn-replay-next')?.addEventListener('click', () => {
      replayEngine?.stepForward();
    });

    playBtn?.addEventListener('click', () => {
      if (replayEngine?.isPlaying()) {
        replayEngine.pause();
        playBtn.innerText = '▶️ Play';
        playBtn.style.backgroundColor = '#10b981';
      } else {
        playBtn.innerText = '⏸️ Pause';
        playBtn.style.backgroundColor = '#f59e0b';
        replayEngine?.play(1000, () => {
          playBtn.innerText = '▶️ Play';
          playBtn.style.backgroundColor = '#10b981';
        });
      }
    });

    timeline?.addEventListener('input', (e) => {
      const idx = parseInt((e.target as HTMLInputElement).value);
      replayEngine?.goToEvent(idx);
    });

    document.getElementById('btn-exit-replay')?.addEventListener('click', () => {
      renderMatchmaking();
    });

    // First render
    updateUI(replayEngine.state);
  }
}

function bindCameraViewport() {
  const viewport = document.getElementById('camera-viewport');
  const content = document.getElementById('camera-content');
  if (!viewport || !content) return;

  // Reset zoom state variables
  currentScale = 1.0;
  content.style.transform = `scale(${currentScale})`;

  // Mouse wheel zoom
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY * -0.002;
    currentScale = Math.max(0.6, Math.min(2.0, currentScale + delta));
    content.style.transform = `scale(${currentScale})`;
  }, { passive: false });

  // Touch pinch-to-zoom listeners
  viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      initialPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  });

  viewport.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && initialPinchDist > 0) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / initialPinchDist;
      // Adjust scale gently based on touch stretch ratio
      currentScale = Math.max(0.6, Math.min(2.0, currentScale * (1 + (factor - 1) * 0.1)));
      content.style.transform = `scale(${currentScale})`;
      initialPinchDist = dist; // slide anchor
    }
  });

  viewport.addEventListener('touchend', () => {
    initialPinchDist = 0;
  });
}

function bindPhysicsDice() {
  const dice = document.getElementById('physical-dice');
  if (!dice) return;

  let x0 = 0;
  let y0 = 0;
  let t0 = 0;
  let isDragging = false;

  const onStart = (clientX: number, clientY: number) => {
    // Check if it is our turn and we are in roll phase
    const isRollPhase = syncEngine && (syncEngine.state.turn.phase === 'Roll' || syncEngine.state.turn.phase === 'StartTurn');
    const isMyTurn = syncEngine && syncEngine.state.turn.currentPlayerId === activeSeatId;
    if (isReplayMode || !isRollPhase || !isMyTurn) return;

    isDragging = true;
    x0 = clientX;
    y0 = clientY;
    t0 = Date.now();
    dice.classList.add('grabbing');
  };

  const onEnd = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    isDragging = false;
    dice.classList.remove('grabbing');

    const t1 = Date.now();
    const dt = Math.max(1, t1 - t0);
    const dx = clientX - x0;
    const dy = clientY - y0;
    const speed = Math.sqrt(dx * dx + dy * dy) / dt; // pixels per ms

    // Spinning roll animation
    dice.classList.add('dice-spinning');
    setTimeout(() => {
      dice.classList.remove('dice-spinning');
    }, 600);

    if (speed > 0.1) {
      // Replicated physics throw roll
      syncEngine?.dispatch('ROLL_DICE', { speed });
    } else {
      // Default baseline roll speed if it was a quick click/tap
      syncEngine?.dispatch('ROLL_DICE', { speed: 0.2 });
    }
  };

  dice.addEventListener('mousedown', (e) => {
    onStart(e.clientX, e.clientY);
  });

  document.addEventListener('mouseup', (e) => {
    if (isDragging) onEnd(e.clientX, e.clientY);
  });

  // Touch flick support
  dice.addEventListener('touchstart', (e) => {
    if (e.touches[0]) onStart(e.touches[0].clientX, e.touches[0].clientY);
  });

  document.addEventListener('touchend', (e) => {
    if (isDragging && e.changedTouches[0]) {
      onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
  });
}

function updateUI(gameState: EngineState) {
  // 1. Draw Board Grid
  const boardEl = document.getElementById('board-container');
  if (boardEl) {
    boardEl.innerHTML = ludoModule.board.tiles.map(tile => {
      const occupyingPlayers = Object.entries(gameState.moduleState.playerPositions)
        .filter(([_, pos]) => pos === tile.index)
        .map(([pid, _]) => gameState.players[pid])
        .filter(Boolean);

      const avatarHtml = occupyingPlayers.map(p => {
        return `<span style="background-color: ${p.color}; border-radius: 50%; padding: 2px; border: 1px solid white; display: inline-flex; width: 22px; height: 22px; align-items: center; justify-content: center; font-size: 11px;">${p.emojiFace}</span>`;
      }).join('');

      return `
        <div style="background-color: ${tile.color}; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 6px; aspect-ratio: 1; position: relative;">
          <div style="font-size: 10px; color: var(--text-muted); font-weight: bold; align-self: flex-start;">${tile.index}</div>
          <div style="font-size: 20px; line-height: 1;">${tile.emoji}</div>
          <div style="display: flex; gap: 2px; flex-wrap: wrap; justify-content: center; min-height: 24px; width: 100%;">
            ${avatarHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  // 2. Draw active seat lists
  const playerList = document.getElementById('player-list');
  if (playerList) {
    playerList.innerHTML = Object.values(gameState.players).map(p => {
      const isActive = gameState.turn.currentPlayerId === p.id;
      const isOurSeat = !isReplayMode && activeSeatId === p.id;
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

  // 3. Playback/Action button states
  if (!isReplayMode) {
    const moveBtn = document.getElementById('btn-move') as HTMLButtonElement;
    const resolveBtn = document.getElementById('btn-resolve') as HTMLButtonElement;
    const endBtn = document.getElementById('btn-end') as HTMLButtonElement;
    const dice = document.getElementById('physical-dice');

    const isMyTurn = gameState.turn.currentPlayerId === activeSeatId;
    const isRollPhase = gameState.turn.phase === 'Roll' || gameState.turn.phase === 'StartTurn';

    if (moveBtn && resolveBtn && endBtn) {
      moveBtn.disabled = !isMyTurn || gameState.turn.phase !== 'Move';
      resolveBtn.disabled = !isMyTurn || gameState.turn.phase !== 'ResolveTile';
      endBtn.disabled = !isMyTurn || gameState.turn.phase !== 'EndTurn';
    }

    if (dice) {
      // Display value rolled or fallback icon
      dice.innerText = gameState.moduleState.lastDiceValue ? String(gameState.moduleState.lastDiceValue) : '🎲';
      
      // Visual feedback: opacity if not active player's turn to roll
      if (isMyTurn && isRollPhase) {
        dice.style.opacity = '1.0';
        dice.style.pointerEvents = 'auto';
      } else {
        dice.style.opacity = '0.65';
        dice.style.pointerEvents = 'none';
      }
    }
  } else {
    // Hide buttons or show values in replay mode
    const dice = document.getElementById('physical-dice');
    if (dice) {
      dice.innerText = gameState.moduleState.lastDiceValue ? String(gameState.moduleState.lastDiceValue) : '🎲';
      dice.style.opacity = '0.7';
      dice.style.pointerEvents = 'none';
    }
  }

  // 4. Render Event Feed
  const feed = document.getElementById('event-feed');
  if (feed) {
    feed.innerHTML = gameState.eventLog.map(e => {
      let text = `[Event: ${e.type}]`;
      if (e.type === 'DICE_ROLLED') text = `🎲 Player ${e.playerId} rolled a ${e.payload.value}`;
      if (e.type === 'PIECE_MOVED') text = `🏃 Player ${e.playerId} moved forward ${e.payload.spaces} steps`;
      if (e.type === 'PHASE_CHANGED') text = `⚙️ Phase changed to: ${e.payload.phase}`;
      if (e.type === 'TURN_ENDED') text = `🏁 Player ${e.playerId} ended their turn`;
      if (e.type === 'PLAYER_JOINED') text = `👤 Player ${e.playerId} joined the lobby`;
      if (e.type === 'PLAYER_WON') text = `🏆 Player ${e.playerId} reached the finish and won!`;
      return `<div class="event-item">${text}</div>`;
    }).join('');
    feed.scrollTop = feed.scrollHeight;
  }

  // 5. Render inspector JSON
  const inspector = document.getElementById('state-inspector');
  if (inspector) {
    inspector.innerText = JSON.stringify(gameState, null, 2);
  }

  // 6. Victory Celeb Check
  const winEvent = gameState.eventLog.find(e => e.type === 'PLAYER_WON');
  const victoryEl = document.getElementById('victory-overlay');
  if (victoryEl) {
    if (winEvent) {
      const winner = gameState.players[winEvent.playerId!];
      victoryEl.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 16px;">🎉🏆🥇</div>
        <h1 style="background: linear-gradient(to right, #fbbf24, #f59e0b); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Player ${winEvent.playerId} (${winner?.emojiFace}) Wins!</h1>
        <p style="color: var(--text-muted); font-size: 16px;">Successfully reached the Home tile ${ludoModule.rules.winningTile}!</p>
        <button class="action-btn" id="btn-victory-close" style="margin-top: 24px; background: #8b5cf6;">Close Overlay</button>
      `;
      victoryEl.style.display = 'flex';
      document.getElementById('btn-victory-close')?.addEventListener('click', () => {
        victoryEl.style.display = 'none';
      });
    } else {
      victoryEl.style.display = 'none';
    }
  }
}

// Global Custom cursor overlay binding
let handCursor = document.getElementById('hand-cursor');
if (!handCursor) {
  handCursor = document.createElement('div');
  handCursor.id = 'hand-cursor';
  handCursor.className = 'tactile-hand';
  handCursor.innerHTML = `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <!-- Standard open pointer cursor SVG -->
      <path d="M12,2c-0.6,0-1,0.4-1,1v8c0,0.6,0.4,1,1,1s1-0.4,1-1V3C13,2.4,12.6,2,12,2z M7,8c-0.6,0-1,0.4-1,1v3c0,0.6,0.4,1,1,1s1-0.4,1-1V9C8,8.4,7.6,8,7,8z M17,9c-0.6,0-1,0.4-1,1v2.5c0,0.6,0.4,1,1,1s1-0.4,1-1V10C18,9.4,17.6,9,17,9z M12,14c-2.8,0-5,2.2-5,5v2c0,0.6,0.4,1,1,1h8c0.6,0,1-0.4,1-1v-2C17,16.2,14.8,14,12,14z"/>
    </svg>
  `;
  document.body.appendChild(handCursor);
}

// SVG states paths
const SVG_IDLE = `
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <!-- Open Hand -->
    <path d="M12,2c-0.6,0-1,0.4-1,1v8c0,0.6,0.4,1,1,1s1-0.4,1-1V3C13,2.4,12.6,2,12,2z M7,8c-0.6,0-1,0.4-1,1v3c0,0.6,0.4,1,1,1s1-0.4,1-1V9C8,8.4,7.6,8,7,8z M17,9c-0.6,0-1,0.4-1,1v2.5c0,0.6,0.4,1,1,1s1-0.4,1-1V10C18,9.4,17.6,9,17,9z M12,14c-2.8,0-5,2.2-5,5v2c0,0.6,0.4,1,1,1h8c0.6,0,1-0.4,1-1v-2C17,16.2,14.8,14,12,14z"/>
  </svg>
`;

const SVG_POINTING = `
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <!-- Pointing Finger -->
    <path d="M12,2c-0.6,0-1,0.4-1,1v7.5c-0.6,0-1,0.4-1,1s0.4,1,1,1h1V11c0.6,0,1-0.4,1-1V3C13,2.4,12.6,2,12,2z M7,11c-0.6,0-1,0.4-1,1v2c0,0.6,0.4,1,1,1s1-0.4,1-1v-2C8,11.4,7.6,11,7,11z M17,11c-0.6,0-1,0.4-1,1v2.5c0,0.6,0.4,1,1,1s1-0.4,1-1V12C18,11.4,17.6,11,17,11z M12,16c-2.8,0-5,2.2-5,5v1c0,0.6,0.4,1,1,1h8c0.6,0,1-0.4,1-1v-1C17,18.2,14.8,16,12,16z"/>
  </svg>
`;

const SVG_GRAB = `
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <!-- Grab Fist -->
    <path d="M12,8c-0.6,0-1,0.4-1,1v1.5c-0.6,0-1,0.4-1,1s0.4,1,1,1h1V11c0.6,0,1-0.4,1-1V9C13,8.4,12.6,8,12,8z M7,10c-0.6,0-1,0.4-1,1v1.5c0,0.6,0.4,1,1,1s1-0.4,1-1V11C8,10.4,7.6,10,7,10z M17,10c-0.6,0-1,0.4-1,1v2c0,0.6,0.4,1,1,1s1-0.4,1-1V11C18,10.4,17.6,10,17,10z M12,14c-2.8,0-5,2.2-5,5v2h10v-2C17,16.2,14.8,14,12,14z"/>
  </svg>
`;

// Track pointer movement
document.addEventListener('mousemove', (e) => {
  if (handCursor) {
    handCursor.style.left = `${e.clientX}px`;
    handCursor.style.top = `${e.clientY}px`;
  }
});

document.addEventListener('touchmove', (e) => {
  if (e.touches[0] && handCursor) {
    handCursor.style.left = `${e.touches[0].clientX}px`;
    handCursor.style.top = `${e.touches[0].clientY}px`;
  }
});

// Change hand shapes based on interactions
let isGrabActive = false;

document.addEventListener('mousedown', () => {
  isGrabActive = true;
  if (handCursor) {
    handCursor.classList.add('grab');
    handCursor.innerHTML = SVG_GRAB;
  }
});

document.addEventListener('mouseup', () => {
  isGrabActive = false;
  if (handCursor) {
    handCursor.classList.remove('grab');
    handCursor.innerHTML = SVG_IDLE;
  }
});

document.addEventListener('touchstart', () => {
  isGrabActive = true;
  if (handCursor) {
    handCursor.classList.add('grab');
    handCursor.innerHTML = SVG_GRAB;
  }
});

document.addEventListener('touchend', () => {
  isGrabActive = false;
  if (handCursor) {
    handCursor.classList.remove('grab');
    handCursor.innerHTML = SVG_IDLE;
  }
});

// Detect hover over interactive elements to set pointing state
document.addEventListener('mouseover', (e) => {
  if (isGrabActive) return;
  const target = e.target as HTMLElement;
  if (handCursor) {
    if (target.closest('button, input, select, a, .dice-3d')) {
      handCursor.innerHTML = SVG_POINTING;
    } else {
      handCursor.innerHTML = SVG_IDLE;
    }
  }
});

// Initial matchmaking render
renderMatchmaking();
