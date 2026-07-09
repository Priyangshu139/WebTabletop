import { EngineState } from '../engine/types';
import { SyncEngine } from '../network/syncEngine';
import { ReplayEngine, ReplayPayload } from '../engine/replay';
import { ThreeRenderer } from './threeRenderer';
import monopolyModule from './modules/monopoly_go.json';

// Local controllers
let syncEngine: SyncEngine | null = null;
let replayEngine: ReplayEngine | null = null;
let threeRenderer: ThreeRenderer | null = null;
let activeSeatId = 'P1';
let isReplayMode = false;
let spectatingPlayerId = 'P1';
let timerIntervalId: any = null;
let lastProcessedEventCount = 0;

const backendHost = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') 
  ? 'localhost:3000' 
  : `${window.location.hostname}:3000`;

const REST_URL = `http://${backendHost}`;
const WS_URL = `ws://${backendHost}`;

const app = document.getElementById('app');

function getSavedAvatar() {
  const saved = localStorage.getItem('webtabletop_avatar');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {}
  }
  return { emojiFace: '🦊', color: '#ef4444', skinTone: 'light' };
}

function saveAvatarTraits() {
  const emoji = (document.getElementById('avatar-emoji') as HTMLSelectElement).value;
  const skin = (document.getElementById('avatar-skin') as HTMLSelectElement).value;
  const activeColorEl = document.querySelector('#profile-colors-selector .avatar-color-square.active') as HTMLElement;
  const color = activeColorEl ? activeColorEl.dataset.color || '#ef4444' : '#ef4444';
  localStorage.setItem('webtabletop_avatar', JSON.stringify({ emojiFace: emoji, color, skinTone: skin }));
}

function renderMatchmaking() {
  if (!app) return;
  isReplayMode = false;
  app.style.gridTemplateColumns = '1fr'; // CSS media query handles grid columns
  
  if (replayEngine) {
    replayEngine.destroy();
    replayEngine = null;
  }
  if (threeRenderer) {
    threeRenderer.destroy();
    threeRenderer = null;
  }

  const traits = getSavedAvatar();

  app.innerHTML = `
    <!-- DESKTOP MATCHMAKING LAYOUT -->
    <div class="desktop-matchmaking-layout">
      <!-- Persistent Left Sidebar -->
      <div class="lobby-sidebar">
        <div class="sidebar-logo">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c.83 0 1.5.67 1.5 1.5S12.83 9 12 9s-1.5-.67-1.5-1.5S11.17 6 12 6zm-4 4c.83 0 1.5.67 1.5 1.5S8.83 13 8 13s-1.5-.67-1.5-1.5S7.17 10 8 10zm0 6c.83 0 1.5.67 1.5 1.5S8.83 19 8 19s-1.5-.67-1.5-1.5S7.17 16 8 16zm8-3c.83 0 1.5.67 1.5 1.5S16.83 16 16 16s-1.5-.67-1.5-1.5S15.17 13 16 13zm0-6c.83 0 1.5.67 1.5 1.5S16.83 9 16 9s-1.5-.67-1.5-1.5S15.17 6 16 6z"/>
          </svg>
          <div class="sidebar-logo-text">
            <h2>TABLETOP</h2>
            <p>Play Together</p>
          </div>
        </div>

        <div id="sidebar-lobby-actions-container">
          <button class="sidebar-btn purple" id="desktop-btn-create">
            <strong>NEW LOBBY</strong>
            <span style="font-size: 11px; opacity: 0.85;">Create a new game lobby</span>
          </button>

          <button class="sidebar-btn blue" id="desktop-btn-join">
            <strong>JOIN LOBBY</strong>
            <span style="font-size: 11px; opacity: 0.85;">Join with code or link</span>
          </button>
        </div>

        <div class="sidebar-bottom-links">
          <div class="sidebar-link-item">⚙️ Settings</div>
          <div class="sidebar-link-item">ℹ️ About</div>
        </div>
      </div>

      <!-- Main Content Area -->
      <div class="lobby-main-display">
        <div class="sandbox-panel avatar-setup-card" style="width: 100%; max-width: 500px; margin: auto; box-sizing: border-box;">
          <div class="title-header">
            <h1>Configure Avatar Profile</h1>
            <p style="color: var(--text-muted); margin: 0;">Set up your seated avatar look before joining a room.</p>
          </div>

          <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 12px; color: var(--text-muted);">Emoji Head:</label>
                <select class="avatar-emoji-select" style="background: #121722; color: white; padding: 8px; border-radius: 6px; border: 1px solid var(--panel-border);">
                  <option value="🦊" ${traits.emojiFace === '🦊' ? 'selected' : ''}>🦊 Fox</option>
                  <option value="🐼" ${traits.emojiFace === '🐼' ? 'selected' : ''}>🐼 Panda</option>
                  <option value="🐸" ${traits.emojiFace === '🐸' ? 'selected' : ''}>🐸 Frog</option>
                  <option value="🐱" ${traits.emojiFace === '🐱' ? 'selected' : ''}>🐱 Cat</option>
                  <option value="🐯" ${traits.emojiFace === '🐯' ? 'selected' : ''}>🐯 Tiger</option>
                  <option value="🦁" ${traits.emojiFace === '🦁' ? 'selected' : ''}>🦁 Lion</option>
                  <option value="🤖" ${traits.emojiFace === '🤖' ? 'selected' : ''}>🤖 Robot</option>
                </select>
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 12px; color: var(--text-muted);">Skin Tone:</label>
                <select class="avatar-skin-select" style="background: #121722; color: white; padding: 8px; border-radius: 6px; border: 1px solid var(--panel-border);">
                  <option value="light" ${traits.skinTone === 'light' ? 'selected' : ''}>Light</option>
                  <option value="medium" ${traits.skinTone === 'medium' ? 'selected' : ''}>Medium</option>
                  <option value="dark" ${traits.skinTone === 'dark' ? 'selected' : ''}>Dark</option>
                </select>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label style="font-size: 12px; color: var(--text-muted);">Pawn Base Color:</label>
              <div class="profile-colors-grid avatar-color-selector">
                ${[
                  '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7',
                  '#f97316', '#ec4899', '#14b8a6', '#06b6d4', '#f43f5e'
                ].map(col => {
                  const isSelected = traits.color === col;
                  return `
                    <div class="avatar-color-square ${isSelected ? 'active' : ''}" data-color="${col}" style="width: 36px; height: 36px;">
                      <div class="player-pawn-circle" style="background-color: ${col}; width: 20px; height: 20px;"></div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>

          <!-- Load Event-Sourced Replay Box -->
          <div style="border-top: 1px solid var(--panel-border); padding-top: 20px;">
            <h3 style="margin-top: 0; margin-bottom: 4px; font-size: 14px; color: white;">Load Event-Sourced Replay</h3>
            <p style="font-size: 12px; color: var(--text-muted); margin: 0 0 6px 0;">Step through match event history.</p>
            <input type="file" class="input-upload-replay" accept=".json" style="background: #121722; border: 1px solid var(--panel-border); padding: 10px; border-radius: 8px; width: 100%;">
          </div>

          <div class="error-toast matchmaking-error" style="margin-top: 12px;"></div>
        </div>
      </div>
    </div>

    <!-- MOBILE MATCHMAKING LAYOUT -->
    <div class="mobile-matchmaking-layout">
      <div class="matchmaking-container">
        <!-- Panel 1: Lobby Actions (New/Join) -->
        <div class="sandbox-panel matchmaking-actions-panel">
          <div class="sidebar-logo" style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 32px; height: 32px; fill: #818cf8;">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c.83 0 1.5.67 1.5 1.5S12.83 9 12 9s-1.5-.67-1.5-1.5S11.17 6 12 6zm-4 4c.83 0 1.5.67 1.5 1.5S8.83 13 8 13s-1.5-.67-1.5-1.5S7.17 10 8 10zm0 6c.83 0 1.5.67 1.5 1.5S8.83 19 8 19s-1.5-.67-1.5-1.5S7.17 16 8 16zm8-3c.83 0 1.5.67 1.5 1.5S16.83 16 16 16s-1.5-.67-1.5-1.5S15.17 13 16 13zm0-6c.83 0 1.5.67 1.5 1.5S16.83 9 16 9s-1.5-.67-1.5-1.5S15.17 6 16 6z"/>
            </svg>
            <div class="sidebar-logo-text">
              <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: white;">TABLETOP</h2>
              <p style="margin: 0; font-size: 11px; color: var(--text-muted);">Play Together</p>
            </div>
          </div>

          <div class="mobile-actions-btn-group" style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
            <button class="sidebar-btn purple" id="mobile-btn-create" style="width: 100%; display: flex; flex-direction: column; text-align: left; padding: 8px; border-radius: 8px; cursor: pointer;">
              <strong>NEW LOBBY</strong>
              <span class="btn-desc" style="font-size: 11px; opacity: 0.85; margin-top: 2px;">Create a new game lobby</span>
            </button>

            <button class="sidebar-btn blue" id="mobile-btn-join" style="width: 100%; display: flex; flex-direction: column; text-align: left; padding: 8px; border-radius: 8px; cursor: pointer;">
              <strong>JOIN LOBBY</strong>
              <span class="btn-desc" style="font-size: 11px; opacity: 0.85; margin-top: 2px;">Join with code or link</span>
            </button>
          </div>
        </div>

        <!-- Right column wrapper -->
        <div class="matchmaking-setup-column">
          <!-- Panel 2: Avatar Profile -->
          <div class="sandbox-panel">
            <div class="title-header" style="margin-bottom: 12px;">
              <h2 style="margin: 0; font-size: 18px; color: white;">Configure Avatar</h2>
              <p style="color: var(--text-muted); margin: 2px 0 0 0; font-size: 12px;">Set up your avatar look before joining a room.</p>
            </div>

            <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--panel-border); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                  <label style="font-size: 12px; color: var(--text-muted);">Emoji Head:</label>
                  <select class="avatar-emoji-select" style="background: #121722; color: white; padding: 8px; border-radius: 6px; border: 1px solid var(--panel-border); font-size: 13px;">
                    <option value="🦊" ${traits.emojiFace === '🦊' ? 'selected' : ''}>🦊 Fox</option>
                    <option value="🐼" ${traits.emojiFace === '🐼' ? 'selected' : ''}>🐼 Panda</option>
                    <option value="🐸" ${traits.emojiFace === '🐸' ? 'selected' : ''}>🐸 Frog</option>
                    <option value="🐱" ${traits.emojiFace === '🐱' ? 'selected' : ''}>🐱 Cat</option>
                    <option value="🐯" ${traits.emojiFace === '🐯' ? 'selected' : ''}>🐯 Tiger</option>
                    <option value="🦁" ${traits.emojiFace === '🦁' ? 'selected' : ''}>🦁 Lion</option>
                    <option value="🤖" ${traits.emojiFace === '🤖' ? 'selected' : ''}>🤖 Robot</option>
                  </select>
                </div>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                  <label style="font-size: 12px; color: var(--text-muted);">Skin Tone:</label>
                  <select class="avatar-skin-select" style="background: #121722; color: white; padding: 8px; border-radius: 6px; border: 1px solid var(--panel-border); font-size: 13px;">
                    <option value="light" ${traits.skinTone === 'light' ? 'selected' : ''}>Light</option>
                    <option value="medium" ${traits.skinTone === 'medium' ? 'selected' : ''}>Medium</option>
                    <option value="dark" ${traits.skinTone === 'dark' ? 'selected' : ''}>Dark</option>
                  </select>
                </div>
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <label style="font-size: 12px; color: var(--text-muted);">Pawn Base Color:</label>
                <div class="profile-colors-grid avatar-color-selector">
                  ${[
                    '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7',
                    '#f97316', '#ec4899', '#14b8a6', '#06b6d4', '#f43f5e'
                  ].map(col => {
                    const isSelected = traits.color === col;
                    return `
                      <div class="avatar-color-square ${isSelected ? 'active' : ''}" data-color="${col}" style="width: 32px; height: 32px;">
                        <div class="player-pawn-circle" style="background-color: ${col}; width: 18px; height: 18px;"></div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- Panel 3: Load Replay Panel (below avatar profile) -->
          <div class="sandbox-panel" style="margin-top: 16px;">
            <h3 style="margin-top: 0; margin-bottom: 4px; font-size: 14px; color: white;">Load Replay</h3>
            <p style="font-size: 12px; color: var(--text-muted); margin: 0 0 8px 0;">Step through match event history from a save file.</p>
            <input type="file" class="input-upload-replay" accept=".json" style="background: #121722; border: 1px solid var(--panel-border); padding: 8px; border-radius: 8px; width: 100%; box-sizing: border-box; font-size: 12px; color: var(--text-muted);">
          </div>
        </div>
      </div>
      <div class="error-toast matchmaking-error" style="margin: 16px;"></div>
    </div>
  `;

  const handleUploadReplay = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const payload = JSON.parse(evt.target?.result as string);
        initializeReplay(payload);
      } catch (err: any) {
        showError(`Invalid replay file structure: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  // Bind Sidebar and welcome setup listeners
  const bindCreateLobby = async () => {
    showError('');
    const userTraits = getSavedAvatar();
    try {
      const res = await fetch(`${REST_URL}/api/lobby/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traits: userTraits })
      });
      const data = await res.json();
      initializeSync(data.lobbyId, data.playerId, data.secretHash, true, undefined, userTraits);
    } catch (err: any) {
      showError(`Failed to create lobby: ${err.message}`);
    }
  };

  document.getElementById('desktop-btn-create')?.addEventListener('click', bindCreateLobby);
  document.getElementById('mobile-btn-create')?.addEventListener('click', bindCreateLobby);

  const bindJoinLobby = () => {
    renderJoinCodePane();
  };

  document.getElementById('desktop-btn-join')?.addEventListener('click', bindJoinLobby);
  document.getElementById('mobile-btn-join')?.addEventListener('click', bindJoinLobby);

  // Sync avatar inputs
  document.querySelectorAll('.avatar-emoji-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      document.querySelectorAll('.avatar-emoji-select').forEach(s => {
        (s as HTMLSelectElement).value = val;
      });
      saveAvatarTraits();
    });
  });

  document.querySelectorAll('.avatar-skin-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      document.querySelectorAll('.avatar-skin-select').forEach(s => {
        (s as HTMLSelectElement).value = val;
      });
      saveAvatarTraits();
    });
  });

  // Sync color squares click
  document.querySelectorAll('.avatar-color-selector .avatar-color-square').forEach(el => {
    el.addEventListener('click', (e) => {
      const target = (e.currentTarget as HTMLElement);
      const col = target.dataset.color || '#ef4444';
      
      // Select all squares across both selectors with this color
      document.querySelectorAll(`.avatar-color-selector .avatar-color-square`).forEach(square => {
        if ((square as HTMLElement).dataset.color === col) {
          square.classList.add('active');
        } else {
          square.classList.remove('active');
        }
      });
      
      saveAvatarTraits();
    });
  });

  // Replay file inputs
  document.querySelectorAll('.input-upload-replay').forEach(input => {
    input.addEventListener('change', handleUploadReplay);
  });

  document.getElementById('btn-create-lobby')?.addEventListener('click', async () => {
    showError('');
    const userTraits = getSavedAvatar();
    const gameModule = (document.getElementById('lobby-game-module') as HTMLSelectElement).value as any;
    const timerLimit = parseInt((document.getElementById('lobby-turn-timer') as HTMLSelectElement).value);

    try {
      const res = await fetch(`${REST_URL}/api/lobby/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traits: userTraits })
      });
      const data = await res.json();
      initializeSync(data.lobbyId, data.playerId, data.secretHash, true, undefined, userTraits, gameModule, timerLimit);
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

    const userTraits = getSavedAvatar();
    const isSpec = (document.getElementById('join-as-spectator') as HTMLInputElement).checked;

    try {
      const res = await fetch(`${REST_URL}/api/lobby/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lobbyId, traits: { ...userTraits, isSpectator: isSpec } })
      });
      if (!res.ok) {
        showError(await res.text());
        return;
      }
      const data = await res.json();

      // Only host fetches state from server; peers sync from host via WebRTC.
      initializeSync(lobbyId, data.playerId, data.secretHash, false, undefined, { ...userTraits, isSpectator: isSpec });
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
      const stateRes = await fetch(`${REST_URL}/api/lobby/${lobbyId}/state?playerId=${encodeURIComponent(playerId)}&secretHash=${encodeURIComponent(secretHash)}`);
      
      if (stateRes.status === 404) {
        showError('Session lobby not found.');
        return;
      }

      if (stateRes.ok) {
        // Authorized: This player is the active Host. Get state from server.
        const stateData = await stateRes.json();
        initializeSync(lobbyId, playerId, secretHash, true, stateData.state);
      } else {
        // Unauthorized/Forbidden: This player is a Peer. They will fetch state from the Host.
        initializeSync(lobbyId, playerId, secretHash, false, undefined);
      }
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

function renderJoinCodePane() {
  showError('');
  const mainContent = document.getElementById('lobby-main-content');
  if (!mainContent) return;

  mainContent.innerHTML = `
    <div class="sandbox-panel" style="width: 100%; max-width: 420px; margin: auto; border: 1px solid var(--panel-border); border-radius: 12px; padding: 24px; background: #0f172a; box-shadow: 0 10px 25px rgba(0,0,0,0.5); box-sizing: border-box;">
      <div class="title-header" style="margin-bottom: 20px;">
        <h1 style="margin: 0; font-size: 24px; color: #3b82f6;">Join Tabletop Lobby</h1>
        <p style="color: var(--text-muted); font-size: 13px; margin: 4px 0 0 0;">Enter the 8-character lobby code to connect.</p>
      </div>

      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <label style="font-size: 12px; font-weight: bold; color: var(--text-muted);">LOBBY CODE</label>
          <input type="text" id="join-lobby-code-input" placeholder="e.g. X7G2Q9PL" style="background: #121722; color: white; border: 1px solid var(--panel-border); padding: 12px; border-radius: 8px; font-size: 18px; text-transform: uppercase; text-align: center; letter-spacing: 2px; font-weight: bold; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='var(--panel-border)'">
        </div>

        <button class="action-btn" id="btn-submit-join-lobby" style="padding: 12px; font-size: 14px; font-weight: bold; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; transition: opacity 0.2s; margin-top: 6px;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">Join Lobby</button>
      </div>
    </div>
  `;

  const submitJoin = async () => {
    showError('');
    const code = (document.getElementById('join-lobby-code-input') as HTMLInputElement).value.toUpperCase().trim();
    if (!code) {
      showError('Please enter a lobby code.');
      return;
    }
    const userTraits = getSavedAvatar();
    const isSpec = false;

    try {
      const res = await fetch(`${REST_URL}/api/lobby/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lobbyId: code, traits: { ...userTraits, isSpectator: isSpec } })
      });
      if (!res.ok) {
        showError(await res.text());
        return;
      }
      const data = await res.json();
      // Only host fetches state from server; peers sync from host via WebRTC.
      initializeSync(code, data.playerId, data.secretHash, false, undefined, { ...userTraits, isSpectator: isSpec });
    } catch (err: any) {
      showError(`Failed to join lobby: ${err.message}`);
    }
  };

  document.getElementById('btn-submit-join-lobby')?.addEventListener('click', submitJoin);
  document.getElementById('join-lobby-code-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitJoin();
  });
  document.getElementById('join-lobby-code-input')?.focus();
}

function appendChatMessage(_chat: any) {
  if (syncEngine) {
    renderChatHistory(syncEngine.state);
  }
}

function renderChatHistory(gameState: EngineState) {
  const messagesEl = document.getElementById('chat-messages');
  if (!messagesEl || !syncEngine) return;

  const isMyHost = gameState.players[activeSeatId]?.isHost === true;

  // Header pinned section
  let pinsHtml = '';
  if (gameState.pinnedChats && gameState.pinnedChats.length > 0) {
    pinsHtml = gameState.pinnedChats.map(pin => {
      const senderColor = gameState.players[pin.senderId]?.color || '#ffffff';
      return `
        <div style="background: rgba(255, 255, 255, 0.06); border: 1.5px solid #ffffff; border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; font-size: 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 12px rgba(255, 255, 255, 0.05);">
          <div style="display: flex; align-items: center; flex-grow: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <span style="font-size: 11px; margin-right: 6px; cursor: default;">📌</span>
            <span style="background-color: ${pin.senderColor}; border-radius: 50%; padding: 2px; border: 1px solid rgba(255,255,255,0.2); width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; margin-right: 4px;">${pin.senderEmoji}</span>
            <strong style="color: ${senderColor}; margin-right: 4px;">${pin.senderId === activeSeatId ? 'You' : pin.senderId}</strong>: 
            <span style="color: #ffffff; overflow: hidden; text-overflow: ellipsis; font-weight: 500;">${pin.text}</span>
          </div>
          ${isMyHost ? `
            <button class="btn-unpin-chat-msg" data-chat-id="${pin.id}" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 12px; padding: 2px 6px; margin: 0; line-height: 1; font-weight: bold; transition: color 0.2s;" onmouseover="this.style.color='white'" onmouseout="this.style.color='#94a3b8'" title="Unpin Message">✕</button>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  const historyHtml = syncEngine.chatHistory.map(m => {
    const playerColor = gameState.players[m.senderId]?.color || '#ffffff';
    const isPinned = gameState.pinnedChats && gameState.pinnedChats.some(c => c.id === m.id);
    return `
      <div style="margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; background: ${isPinned ? 'rgba(255,255,255,0.04)' : 'transparent'}; padding: 4px; border-radius: 6px;">
        <div style="font-size: 13px;">
          <span style="background-color: ${m.senderColor}; border-radius: 50%; padding: 2px; border: 1px solid rgba(255,255,255,0.2); width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; margin-right: 4px;">${m.senderEmoji}</span>
          <strong style="color: ${playerColor};">${m.senderId === activeSeatId ? 'You' : m.senderId}</strong>: ${m.text}
        </div>
        ${isMyHost && !isPinned ? `
          <button class="btn-pin-chat-msg" data-chat-id="${m.id}" style="background: transparent; border: none; cursor: pointer; font-size: 12px; padding: 2px; line-height: 1;" title="Pin Message">📌</button>
        ` : ''}
      </div>
    `;
  }).join('');

  const pinnedEl = document.getElementById('chat-pinned-container');
  if (pinnedEl) {
    if (gameState.pinnedChats && gameState.pinnedChats.length > 0) {
      pinnedEl.innerHTML = `
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 10px; padding: 10px; margin-bottom: 8px;">
          <div style="color: #ffffff; font-weight: bold; margin-bottom: 6px; font-size: 10px; display: flex; align-items: center; gap: 4px; letter-spacing: 0.5px; text-transform: uppercase;">📌 Pinned Messages (Max 3)</div>
          ${pinsHtml}
        </div>
      `;
      pinnedEl.style.display = 'block';
    } else {
      pinnedEl.style.display = 'none';
      pinnedEl.innerHTML = '';
    }
    messagesEl.innerHTML = historyHtml;
  } else {
    // Legacy fallback
    let pinnedHtml = pinsHtml ? `
      <div style="margin-bottom: 12px; border-bottom: 1px dashed rgba(255, 255, 255, 0.15); padding-bottom: 8px;">
        <div style="color: #ffffff; font-weight: bold; margin-bottom: 6px; font-size: 10px; display: flex; align-items: center; gap: 4px; letter-spacing: 0.5px; text-transform: uppercase;">📌 Pinned Messages (Max 3)</div>
        ${pinsHtml}
      </div>
    ` : '';
    messagesEl.innerHTML = pinnedHtml + historyHtml;
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;

  // Bind pin buttons
  messagesEl.querySelectorAll('.btn-pin-chat-msg').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const chatId = (e.currentTarget as HTMLElement).getAttribute('data-chat-id');
      const chatMsg = syncEngine?.chatHistory.find(c => c.id === chatId);
      if (chatMsg) {
        syncEngine?.dispatch('PIN_CHAT', { chat: chatMsg });
      }
    });
  });

  // Bind unpin buttons
  const unpinContainer = pinnedEl || messagesEl;
  unpinContainer.querySelectorAll('.btn-unpin-chat-msg').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const chatId = (e.currentTarget as HTMLElement).getAttribute('data-chat-id');
      if (chatId) {
        syncEngine?.dispatch('UNPIN_CHAT', { chatId });
      }
    });
  });
}

function showError(msg: string) {
  document.querySelectorAll('.matchmaking-error').forEach(box => {
    const el = box as HTMLElement;
    if (msg) {
      el.innerText = msg;
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  });
}

async function initializeSync(
  lobbyId: string,
  playerId: string,
  secretHash: string,
  isHost: boolean,
  savedState?: EngineState,
  traits?: any,
  gameModule?: 'ludo-go-classic' | 'monopoly-go' | 'uno-go',
  timerLimit?: number
) {
  activeSeatId = playerId;
  isReplayMode = false;
  spectatingPlayerId = 'P1';
  lastProcessedEventCount = 0;
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }

  const playerTraits = traits || getSavedAvatar();
  const activeGame = gameModule || savedState?.activeModule || 'ludo-go-classic';

  // Uno card deck generator
  let unoDeck: any[] = [];
  let unoDiscardPile: any[] = [];
  if (activeGame === 'uno-go' && !savedState) {
    const colors = ['red', 'blue', 'green', 'yellow'];
    const values = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'SKIP', 'REVERSE', 'DRAW_TWO'];
    let idCounter = 0;
    colors.forEach(col => {
      values.forEach(val => {
        unoDeck.push({ id: `c-${idCounter++}`, color: col, value: val });
      });
    });
    // Shuffle deck
    unoDeck.sort(() => Math.random() - 0.5);
    // Draw top card to discard
    unoDiscardPile.push(unoDeck.shift());
  }

  // Setup initial default engine state if not restored
  const initialState: EngineState = savedState || {
    seed: 'tabletop-seed-' + Math.random().toString(36).substring(7),
    prngState: 0,
    activeModule: activeGame,
    timerLimit: timerLimit || undefined,
    turnStartedAt: Date.now(),
    players: {
      'P1': {
        id: 'P1',
        color: isHost ? playerTraits.color : '#ef4444',
        skinTone: isHost ? playerTraits.skinTone : 'light',
        emojiFace: isHost ? playerTraits.emojiFace : '🦊',
        isHost: true,
        isSpectator: !!playerTraits.isSpectator,
        money: activeGame === 'monopoly-go' && !playerTraits.isSpectator ? 1500 : undefined,
        hand: activeGame === 'uno-go' && !playerTraits.isSpectator ? [] : undefined
      }
    },
    turn: {
      currentPlayerId: 'P1',
      phase: 'StartTurn'
    },
    eventLog: [],
    moduleState: {
      lastDiceValue: 0,
      playerPositions: { 'P1': 0 },
      propertiesOwned: activeGame === 'monopoly-go' ? {} : undefined,
      unoDeck,
      unoDiscardPile
    }
  };

  // Assign start cards if we are Player 1 hosting Uno
  if (activeGame === 'uno-go' && !savedState && initialState.players['P1'].hand?.length === 0) {
    for (let i = 0; i < 7; i++) {
      initialState.players['P1'].hand!.push(initialState.moduleState.unoDeck!.shift());
    }
  }

  // Add ourselves to players table dynamically if not present.
  // ONLY the host pre-adds itself. Non-host players are added by the host's
  // PLAYER_JOINED event (which runs through the reducer's color conflict resolver)
  // and then delivered via SYNC_STATE.
  if (isHost && !initialState.players[playerId]) {
    initialState.players[playerId] = {
      id: playerId,
      color: playerTraits.color,
      skinTone: playerTraits.skinTone,
      emojiFace: playerTraits.emojiFace,
      isHost: isHost,
      isSpectator: !!playerTraits.isSpectator,
      money: activeGame === 'monopoly-go' && !playerTraits.isSpectator ? 1500 : undefined,
      hand: activeGame === 'uno-go' && !playerTraits.isSpectator ? [] : undefined
    };
    if (!playerTraits.isSpectator) {
      initialState.moduleState.playerPositions[playerId] = 0;
    }
  }

  // Setup main layout for game session (full-width viewport, sidebar disappears)
  if (app) {
    app.style.gridTemplateColumns = '1fr';
    app.innerHTML = `
      <div class="lobby-main-display" id="lobby-main-content" style="width: 100vw; height: 100vh;">
        <div style="margin: auto; font-size: 16px; font-weight: bold; color: var(--text-muted);">Syncing P2P channels...</div>
      </div>
    `;

    // Inject game content into the main display pane after layout is ready
    const mainContent = document.getElementById('lobby-main-content');
    if (mainContent) {
      mainContent.innerHTML = `
        <!-- Column 1: Config & Roster -->
        <div class="sandbox-panel">
          <div class="title-header">
            <h1>Lobby Code: <span style="color: #60a5fa;">${lobbyId}</span></h1>
            <p style="color: var(--text-muted); margin: 0;">Seat: <strong style="color: white;">${playerId}</strong> (${isHost ? 'HOST' : 'PEER'})</p>
          </div>

          <div id="discord-active-banner" style="display: none;"></div>
          <div id="spectator-view-banner" style="display: none; background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.3); padding: 10px; border-radius: 8px; margin-bottom: 12px;"></div>

          <div style="background: rgba(255,255,255,0.02); border-radius: 8px; padding: 12px; font-size: 11px; font-family: monospace;">
            <strong>RECONNECT KEY:</strong><br>
            <code style="color: #f43f5e; word-break: break-all;">Lobby: ${lobbyId} | Player: ${playerId} | Hash: ${secretHash}</code>
          </div>

          <div id="migration-banner" style="background: rgba(234,179,8,0.1); border: 1px solid rgba(234,179,8,0.3); padding: 10px; border-radius: 8px; display: none; color: #facc15; font-weight: bold; font-size: 13px;">
            ⚠️ Host Disconnected. Migrating authority...
          </div>

          <div>
            <h3>Lobby Active Seats</h3>
            <div id="player-list"></div>
          </div>

          <!-- Monopoly property owned ledger -->
          ${activeGame === 'monopoly-go' ? `
          <div>
            <h3>Purchased Properties</h3>
            <div id="monopoly-ledger" style="font-size: 12px; display: flex; flex-direction: column; gap: 6px; background: rgba(0,0,0,0.15); padding: 12px; border-radius: 8px; border: 1px solid var(--panel-border); max-height: 180px; overflow-y: auto;">No properties owned yet.</div>
          </div>
          ` : ''}

          <!-- Discord Pin Box (Host Only) -->
          ${isHost ? `
          <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 12px; padding: 12px;">
            <h3 style="margin-top: 0;">Discord Voice Pin (Host)</h3>
            <div style="display: flex; gap: 8px;">
              <input type="text" id="discord-input" placeholder="https://discord.gg/..." style="flex-grow: 1; background: #1e293b; color: white; border: 1px solid var(--panel-border); padding: 8px; border-radius: 6px; font-size: 12px;">
              <button class="action-btn" id="btn-pin-discord" style="padding: 8px 14px; font-size: 12px; margin-right: 0; background: #5865f2;">Pin</button>
            </div>
          </div>
          ` : ''}
        </div>

        <!-- Column 2: Immersive 3D Tabletop and Control Area -->
        <div class="sandbox-panel" style="gap: 12px;">
          <div id="turn-timer-banner" style="background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); padding: 10px; border-radius: 8px; margin-bottom: 4px; display: none;">
            <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; margin-bottom: 6px; color: #fca5a5;">
              <span>⏱️ Turn Timer Active</span>
              <span id="turn-timer-text">0s left</span>
            </div>
            <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
              <div id="turn-timer-bar" style="width: 100%; height: 100%; background: #ef4444; transition: width 0.2s linear;"></div>
            </div>
          </div>

          <div>
            <h3 style="text-transform: capitalize; margin: 0 0 4px 0;">3D Tabletop Viewport: ${activeGame.replace(/-/g, ' ')}</h3>
            <p style="font-size: 11px; color: var(--text-muted); margin: 0 0 8px 0;">Drag to rotate table. Scroll to zoom camera angle.</p>
            
            <div id="camera-viewport" style="width: 100%; height: 420px; border: 1px solid var(--panel-border); border-radius: 12px; overflow: hidden; background: #0b0f19; position: relative;">
              <div id="three-canvas-container" style="width: 100%; height: 100%;"></div>
            </div>
          </div>

          <div>
            <!-- Flick physics throwing pad (Only Ludo & Monopoly) -->
            <div id="physics-dice-surface" style="background: rgba(255,255,255,0.01); border: 1px solid var(--panel-border); border-radius: 12px; padding: 12px; text-align: center; ${activeGame === 'uno-go' ? 'display: none;' : ''}">
              <p style="font-size: 12px; color: var(--text-muted); margin: 0 0 6px 0;">Drag and FLICK the dice to roll!</p>
              <div class="dice-3d-surface">
                <div id="physical-dice" class="dice-3d">🎲</div>
              </div>
            </div>

            <!-- Card Hand GUI panel (Only Uno) -->
            <div id="uno-hand-gui" style="background: rgba(255,255,255,0.01); border: 1px solid var(--panel-border); border-radius: 12px; padding: 12px; ${activeGame !== 'uno-go' ? 'display: none;' : ''}">
              <p style="font-size: 12px; color: var(--text-muted); margin: 0 0 8px 0; font-weight: bold;">Your Hand:</p>
              <div id="my-cards-container" style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px;"></div>
            </div>

            <div id="actions-panel" style="margin-top: 10px; display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px;">
              <button class="action-btn" id="btn-move" disabled style="${activeGame === 'uno-go' ? 'display: none;' : ''}">Move Piece</button>
              <button class="action-btn" id="btn-resolve" disabled style="${activeGame === 'uno-go' ? 'display: none;' : ''}">Resolve Space</button>
              <button class="action-btn" id="btn-buy-property" disabled style="background-color: #10b981; ${activeGame !== 'monopoly-go' ? 'display: none;' : ''}">Buy Property</button>
              <button class="action-btn" id="btn-draw-card" disabled style="background-color: #f59e0b; ${activeGame !== 'uno-go' ? 'display: none;' : ''}">Draw Card</button>
              <button class="action-btn" id="btn-end" disabled>End Turn</button>
            </div>
            <div class="error-toast" id="error-box"></div>
          </div>
        </div>

        <!-- Column 3: Chat Logs, Event Feeds & Inspectors -->
        <div class="sandbox-panel" style="gap: 16px;">
          <!-- P2P Lobby Chat -->
          <div style="display: flex; flex-direction: column; flex-grow: 1;">
            <h3 style="margin-top: 0; margin-bottom: 8px;">Lobby Chat</h3>
            <div id="chat-pinned-container" style="display: none; margin-bottom: 8px;"></div>
            <div id="chat-messages" style="height: 180px; overflow-y: auto; background: rgba(0,0,0,0.18); border-radius: 10px; padding: 8px; border: 1px solid var(--panel-border); font-size: 13px; margin-bottom: 8px; flex-grow: 1;"></div>
            <div style="display: flex; gap: 8px;">
              <input type="text" id="chat-input" placeholder="Type a message..." style="flex-grow: 1; background: #1e293b; color: white; border: 1px solid var(--panel-border); padding: 10px; border-radius: 8px; font-size: 13px;">
              <button class="action-btn" id="btn-send-chat" style="padding: 10px 16px; font-size: 13px; margin-right: 0;">Send</button>
            </div>
          </div>

          <div>
            <h3 style="margin-bottom: 8px;">Match Events</h3>
            <div class="event-feed" id="event-feed" style="height: 120px;"></div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <h3 style="margin: 0;">Replicated State</h3>
              <button class="action-btn" id="btn-toggle-inspector" style="padding: 4px 10px; font-size: 11px; background: rgba(255,255,255,0.05); border: 1px solid var(--panel-border); margin: 0;">Toggle</button>
            </div>
            <div class="state-inspector" id="state-inspector" style="height: 150px; display: none;"></div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            <button class="action-btn" id="btn-download-replay" style="background: #0ea5e9; font-size: 13px; padding: 10px;">💾 Download Replay File</button>
            <button class="action-btn" id="btn-exit-game" style="background: #475569; font-size: 13px; padding: 10px;">🛑 Exit to Lobby</button>
          </div>
        </div>

        <!-- Gorgeous Deed Card Modal Overlay -->
        <div id="property-card-modal" class="modal-overlay">
          <div class="deed-card" id="deed-card-content"></div>
        </div>

        <!-- Floating notification area -->
        <div id="floating-notifier" class="floating-notifier"></div>

        <!-- Victory Celeb Overlay -->
        <div id="victory-overlay" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(10,15,30,0.92); flex-direction: column; align-items: center; justify-content: center; text-align: center; z-index: 1000000; backdrop-filter: blur(12px);"></div>
      `;
    }
  }


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
    },
    (chat) => {
      appendChatMessage(chat);
    },
    playerTraits
  );
  try {
    await syncEngine.start();
    updateUI(syncEngine.state);
  } catch (err: any) {
    alert(`Failed P2P Connection: ${err.message}`);
    renderMatchmaking();
  }
}

function downloadReplayData(state: EngineState) {
  const replayData = {
    moduleId: state.activeModule || 'ludo-go-classic',
    seed: state.seed,
    players: state.players,
    eventLog: state.eventLog
  };
  const blob = new Blob([JSON.stringify(replayData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `replay-${syncEngine?.lobbyId || 'lobby'}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildGameplayLayout(activeGame: string, lobbyId: string, playerId: string, isHost: boolean, secretHash: string) {
  const mainContent = document.getElementById('lobby-main-content');
  if (!mainContent) return;

  mainContent.classList.add('gameplay-active');
  mainContent.style.display = 'grid';

  mainContent.innerHTML = `
    <!-- Column 1: Config & Roster -->
    <div class="sandbox-panel">
      <div class="title-header">
        <h1>Lobby Code: <span style="color: #60a5fa;">${lobbyId}</span></h1>
        <p style="color: var(--text-muted); margin: 0;">Seat: <strong style="color: white;">${playerId}</strong> (${isHost ? 'HOST' : 'PEER'})</p>
      </div>

      <div id="discord-active-banner" style="display: none;"></div>
      <div id="spectator-view-banner" style="display: none; background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.3); padding: 10px; border-radius: 8px; margin-bottom: 12px;"></div>

      <div style="background: rgba(255,255,255,0.02); border-radius: 8px; padding: 12px; font-size: 11px; font-family: monospace;">
        <strong>RECONNECT KEY:</strong><br>
        <code style="color: #f43f5e; word-break: break-all;">Lobby: ${lobbyId} | Player: ${playerId} | Hash: ${secretHash}</code>
      </div>

      <div id="migration-banner" style="background: rgba(234,179,8,0.1); border: 1px solid rgba(234,179,8,0.3); padding: 10px; border-radius: 8px; display: none; color: #facc15; font-weight: bold; font-size: 13px;">
        ⚠️ Host Disconnected. Migrating authority...
      </div>

      <div>
        <h3>Lobby Active Seats</h3>
        <div id="player-list"></div>
      </div>

      <!-- Monopoly property owned ledger -->
      ${activeGame === 'monopoly-go' ? `
      <div>
        <h3>Purchased Properties</h3>
        <div id="monopoly-ledger" style="font-size: 12px; display: flex; flex-direction: column; gap: 6px; background: rgba(0,0,0,0.15); padding: 12px; border-radius: 8px; border: 1px solid var(--panel-border); max-height: 180px; overflow-y: auto;">No properties owned yet.</div>
      </div>
      ` : ''}

      <!-- Discord Pin Box (Host Only) -->
      ${isHost ? `
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 12px; padding: 12px;">
        <h3 style="margin-top: 0;">Discord Voice Pin (Host)</h3>
        <div style="display: flex; gap: 8px;">
          <input type="text" id="discord-input" placeholder="https://discord.gg/..." style="flex-grow: 1; background: #121722; color: white; border: 1px solid var(--panel-border); padding: 8px; border-radius: 6px; font-size: 12px;">
          <button class="action-btn" id="btn-pin-discord" style="padding: 8px 14px; font-size: 12px; margin-right: 0; background: #5865f2;">Pin</button>
        </div>
      </div>
      ` : ''}
    </div>

    <!-- Column 2: Immersive 3D Tabletop and Control Area -->
    <div class="sandbox-panel" style="gap: 12px;">
      <div id="turn-timer-banner" style="background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); padding: 10px; border-radius: 8px; margin-bottom: 4px; display: none;">
        <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; margin-bottom: 6px; color: #fca5a5;">
          <span>⏱️ Turn Timer Active</span>
          <span id="turn-timer-text">0s left</span>
        </div>
        <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
          <div id="turn-timer-bar" style="width: 100%; height: 100%; background: #ef4444; transition: width 0.2s linear;"></div>
        </div>
      </div>

      <div>
        <h3 style="text-transform: capitalize; margin: 0 0 4px 0;">3D Tabletop Viewport: ${activeGame.replace(/-/g, ' ')}</h3>
        <p style="font-size: 11px; color: var(--text-muted); margin: 0 0 8px 0;">Drag to rotate table. Scroll to zoom camera angle.</p>
        
        <div id="camera-viewport" style="width: 100%; height: 420px; border: 1px solid var(--panel-border); border-radius: 12px; overflow: hidden; background: #0b0f19; position: relative;">
          <div id="three-canvas-container" style="width: 100%; height: 100%;"></div>
        </div>
      </div>

      <div>
        <!-- Flick physics throwing pad -->
        <div id="physics-dice-surface" style="background: rgba(255,255,255,0.01); border: 1px solid var(--panel-border); border-radius: 12px; padding: 12px; text-align: center; ${activeGame === 'uno-go' ? 'display: none;' : ''}">
          <p style="font-size: 12px; color: var(--text-muted); margin: 0 0 6px 0;">Drag and FLICK the dice to roll!</p>
          <div class="dice-3d-surface">
            <div id="physical-dice" class="dice-3d">🎲</div>
          </div>
        </div>

        <!-- Card Hand GUI panel -->
        <div id="uno-hand-gui" style="background: rgba(255,255,255,0.01); border: 1px solid var(--panel-border); border-radius: 12px; padding: 12px; ${activeGame !== 'uno-go' ? 'display: none;' : ''}">
          <p style="font-size: 12px; color: var(--text-muted); margin: 0 0 8px 0; font-weight: bold;">Your Hand:</p>
          <div id="my-cards-container" style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px;"></div>
        </div>

        <div id="actions-panel" style="margin-top: 10px; display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px;">
          <button class="action-btn" id="btn-move" disabled style="${activeGame === 'uno-go' ? 'display: none;' : ''}">Move Piece</button>
          <button class="action-btn" id="btn-resolve" disabled style="${activeGame === 'uno-go' ? 'display: none;' : ''}">Resolve Space</button>
          <button class="action-btn" id="btn-buy-property" disabled style="background-color: #10b981; ${activeGame !== 'monopoly-go' ? 'display: none;' : ''}">Buy Property</button>
          <button class="action-btn" id="btn-draw-card" disabled style="background-color: #f59e0b; ${activeGame !== 'uno-go' ? 'display: none;' : ''}">Draw Card</button>
          <button class="action-btn" id="btn-end" disabled>End Turn</button>
        </div>
        <div class="error-toast" id="error-box"></div>
      </div>
    </div>

    <!-- Column 3: Match Events, Inspectors & download buttons -->
    <div class="sandbox-panel" style="gap: 16px;">
      <div>
        <h3 style="margin-bottom: 8px;">Match Events</h3>
        <div class="event-feed" id="event-feed" style="height: 120px;"></div>
      </div>

      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <h3 style="margin: 0;">Replicated State</h3>
          <button class="action-btn" id="btn-toggle-inspector" style="padding: 4px 10px; font-size: 11px; background: rgba(255,255,255,0.05); border: 1px solid var(--panel-border); margin: 0;">Toggle</button>
        </div>
        <div class="state-inspector" id="state-inspector" style="height: 150px; display: none;"></div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button class="action-btn" id="btn-download-replay" style="background: #0ea5e9; font-size: 13px; padding: 10px;">💾 Download Replay File</button>
        <button class="action-btn" id="btn-exit-game" style="background: #475569; font-size: 13px; padding: 10px;">🛑 Exit to Lobby</button>
      </div>
    </div>

    <!-- Gorgeous Deed Card Modal Overlay -->
    <div id="property-card-modal" class="modal-overlay">
      <div class="deed-card" id="deed-card-content"></div>
    </div>

    <!-- Floating notification area -->
    <div id="floating-notifier" class="floating-notifier"></div>

    <!-- Victory Celeb Overlay -->
    <div id="victory-overlay" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(10,15,30,0.92); flex-direction: column; align-items: center; justify-content: center; text-align: center; z-index: 1000000; backdrop-filter: blur(12px);"></div>

    <!-- Floating Chat Toggle Drawer -->
    <button class="chat-drawer-toggle" id="btn-chat-toggle">◀</button>
    <div class="chat-drawer" id="chat-drawer">
      <h3 style="margin-top: 0; margin-bottom: 12px; color: white;">💬 Lobby Chat</h3>
      <div id="chat-pinned-container" style="display: none; margin-bottom: 8px;"></div>
      <div id="chat-messages" style="flex-grow: 1; overflow-y: auto; background: rgba(0,0,0,0.18); border-radius: 10px; padding: 8px; border: 1px solid var(--panel-border); font-size: 13px; margin-bottom: 12px;"></div>
      <div style="display: flex; gap: 6px;">
        <input type="text" id="chat-input" placeholder="Type a message..." style="flex-grow: 1; background: #1e293b; color: white; border: 1px solid var(--panel-border); padding: 10px; border-radius: 8px; font-size: 13px;">
        <button class="action-btn" id="btn-send-chat" style="padding: 10px 14px; font-size: 13px; margin-right: 0;">Send</button>
      </div>
    </div>
  `;

  const container = document.getElementById('three-canvas-container') as HTMLDivElement;
  if (container) {
    threeRenderer = new ThreeRenderer(container, playerId);
  }

  if (activeGame !== 'uno-go') {
    bindPhysicsDice();
  }

  const sendChat = () => {
    const input = document.getElementById('chat-input') as HTMLInputElement;
    const text = input.value.trim();
    if (text) {
      syncEngine?.sendChat(text);
      input.value = '';
    }
  };
  document.getElementById('btn-send-chat')?.addEventListener('click', sendChat);
  document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });

  document.getElementById('btn-move')?.addEventListener('click', () => {
    syncEngine?.dispatch('MOVE_PIECE', { spaces: syncEngine.state.moduleState.lastDiceValue || 3 });
  });
  document.getElementById('btn-resolve')?.addEventListener('click', () => {
    syncEngine?.dispatch('RESOLVE_TILE');
  });
  document.getElementById('btn-buy-property')?.addEventListener('click', () => {
    syncEngine?.dispatch('BUY_PROPERTY');
  });
  document.getElementById('btn-draw-card')?.addEventListener('click', () => {
    syncEngine?.dispatch('DRAW_CARD');
  });
  document.getElementById('btn-end')?.addEventListener('click', () => {
    syncEngine?.dispatch('END_TURN');
  });
  document.getElementById('btn-pin-discord')?.addEventListener('click', () => {
    const input = document.getElementById('discord-input') as HTMLInputElement;
    const link = input.value.trim();
    if (link) {
      syncEngine?.dispatch('PIN_DISCORD', { link });
      input.value = '';
    }
  });

  document.getElementById('btn-download-replay')?.addEventListener('click', () => {
    if (syncEngine) {
      downloadReplayData(syncEngine.state);
    }
  });

  document.getElementById('btn-exit-game')?.addEventListener('click', () => {
    window.location.reload();
  });

  const toggleBtn = document.getElementById('btn-toggle-inspector');
  const stateInspector = document.getElementById('state-inspector');
  toggleBtn?.addEventListener('click', () => {
    if (stateInspector) {
      stateInspector.style.display = stateInspector.style.display === 'none' ? 'block' : 'none';
    }
  });

  // Chat Drawer slide toggle bind
  const chatToggleBtn = document.getElementById('btn-chat-toggle');
  const chatDrawer = document.getElementById('chat-drawer');
  chatToggleBtn?.addEventListener('click', () => {
    chatDrawer?.classList.toggle('active');
    chatToggleBtn?.classList.toggle('active');
    if (chatDrawer?.classList.contains('active')) {
      chatToggleBtn.innerHTML = '▶';
    } else {
      chatToggleBtn.innerHTML = '◀';
    }
  });
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
          <h3>3D Tabletop Viewport: ${payload.moduleId.replace('-', ' ')}</h3>
          <div id="camera-viewport" style="width: 100%; max-width: 360px; height: 360px; margin: 10px auto; border: 1px solid var(--panel-border); border-radius: 12px; overflow: hidden; background: #0f172a; position: relative;">
            <div id="three-canvas-container" style="width: 100%; height: 100%;"></div>
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

    // Instantiate Three.js renderer inside the canvas container for replay
    const container = document.getElementById('three-canvas-container') as HTMLDivElement;
    if (container) {
      threeRenderer = new ThreeRenderer(container, 'P1');
    }

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
      if (threeRenderer) {
        threeRenderer.destroy();
        threeRenderer = null;
      }
      renderMatchmaking();
    });

    // First render
    updateUI(replayEngine.state);
  }
}

function bindPhysicsDice() {
  const dice = document.getElementById('physical-dice');
  if (!dice) return;

  let x0 = 0;
  let y0 = 0;
  let t0 = 0;
  let isDragging = false;

  const onStart = (clientX: number, clientY: number) => {
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
    const speed = Math.sqrt(dx * dx + dy * dy) / dt;

    dice.classList.add('dice-spinning');
    setTimeout(() => {
      dice.classList.remove('dice-spinning');
    }, 600);

    if (speed > 0.1) {
      syncEngine?.dispatch('ROLL_DICE', { speed });
    } else {
      syncEngine?.dispatch('ROLL_DICE', { speed: 0.2 });
    }
  };

  dice.addEventListener('mousedown', (e) => {
    onStart(e.clientX, e.clientY);
  });

  document.addEventListener('mouseup', (e) => {
    if (isDragging) onEnd(e.clientX, e.clientY);
  });

  dice.addEventListener('touchstart', (e) => {
    if (e.touches[0]) onStart(e.touches[0].clientX, e.touches[0].clientY);
  });

  document.addEventListener('touchend', (e) => {
    if (isDragging && e.changedTouches[0]) {
      onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
  });
}

function getUnoColorHex(color: string): string {
  switch (String(color).toLowerCase()) {
    case 'red': return '#ef4444';
    case 'blue': return '#3b82f6';
    case 'green': return '#10b981';
    case 'yellow': return '#eab308';
    default: return '#6b7280';
  }
}

function updateUI(gameState: EngineState) {
  const activeGame = gameState.selectedGame || gameState.activeModule || 'ludo-go-classic';
  const isSpectator = gameState.players[activeSeatId]?.isSpectator === true;

  // Route to Lobby Room screen if pre-game setup phase is active
  if (!gameState.lobbyStarted && !isReplayMode) {
    renderLobbyRoom(gameState);
    return;
  }

  // Ensure gameplay layout is loaded when transition to active game occurs
  if (!document.getElementById('camera-viewport') && !isReplayMode && syncEngine) {
    buildGameplayLayout(activeGame, syncEngine.lobbyId, activeSeatId, syncEngine.isHost, syncEngine.secretHash);
  }

  // Trigger money badge notifications for newly received event log items
  if (gameState.eventLog && gameState.eventLog.length > lastProcessedEventCount) {
    const newEvents = gameState.eventLog.slice(lastProcessedEventCount);
    newEvents.forEach(evt => {
      if (evt.playerId === activeSeatId) {
        if (evt.type === 'SALARY_COLLECTED') {
          triggerFloatingMoneyAlert(200);
        } else if (evt.type === 'CHANCE_BONUS') {
          triggerFloatingMoneyAlert(evt.payload.bonus);
        } else if (evt.type === 'TAX_PAID') {
          triggerFloatingMoneyAlert(-evt.payload.amount);
        } else if (evt.type === 'RENT_PAID') {
          triggerFloatingMoneyAlert(-evt.payload.rent);
        } else if (evt.type === 'PROPERTY_BOUGHT') {
          triggerFloatingMoneyAlert(-evt.payload.cost);
        }
      } else if (evt.type === 'RENT_PAID' && evt.payload.ownerId === activeSeatId) {
        triggerFloatingMoneyAlert(evt.payload.rent);
      }
    });
    lastProcessedEventCount = gameState.eventLog.length;
  }

  // Render Spectator Banner and POV selector
  const specBanner = document.getElementById('spectator-view-banner');
  if (specBanner) {
    if (isSpectator) {
      specBanner.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px; font-size: 13px;">
          <div style="font-weight: bold; color: #a5b4fc;">🎥 SPECTATOR POV MODE</div>
          <div style="color: var(--text-muted);">You are watching Player ${spectatingPlayerId === 'P1' ? '1' : spectatingPlayerId}'s field of view. Controls are read-only.</div>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
            <span>Watch POV:</span>
            <select id="select-spectator-pov" style="background: #1e293b; color: white; border: 1px solid var(--panel-border); padding: 4px; border-radius: 4px; font-size: 12px; cursor: pointer;">
              ${Object.keys(gameState.players).filter(pid => !gameState.players[pid].isSpectator).map(pid => `
                <option value="${pid}" ${pid === spectatingPlayerId ? 'selected' : ''}>Player ${pid === 'P1' ? '1' : pid}</option>
              `).join('')}
            </select>
          </div>
        </div>
      `;
      specBanner.style.display = 'block';

      // Bind POV change handler
      const povSelect = document.getElementById('select-spectator-pov') as HTMLSelectElement;
      if (povSelect) {
        povSelect.addEventListener('change', () => {
          spectatingPlayerId = povSelect.value;
          updateUI(gameState);
        });
      }
    } else {
      specBanner.style.display = 'none';
    }
  }

  // Refresh visual turn timer ticker
  refreshVisualTimer(gameState);

  // Refresh floating property deed modal for landed-on unowned properties
  refreshDeedCardModal(gameState);

  // Dynamic DOM panels showing / hiding
  const physicsSurface = document.getElementById('physics-dice-surface');
  const unoHandGui = document.getElementById('uno-hand-gui');
  const moveBtn = document.getElementById('btn-move');
  const resolveBtn = document.getElementById('btn-resolve');
  const buyBtn = document.getElementById('btn-buy-property');
  const drawBtn = document.getElementById('btn-draw-card');

  if (physicsSurface) physicsSurface.style.display = (activeGame === 'uno-go' || isSpectator) ? 'none' : 'block';
  if (unoHandGui) unoHandGui.style.display = (activeGame !== 'uno-go' || isSpectator) ? 'none' : 'block';
  if (moveBtn) moveBtn.style.display = activeGame === 'uno-go' ? 'none' : 'block';
  if (resolveBtn) resolveBtn.style.display = activeGame === 'uno-go' ? 'none' : 'block';
  if (buyBtn) buyBtn.style.display = activeGame === 'monopoly-go' ? 'block' : 'none';
  if (drawBtn) drawBtn.style.display = activeGame === 'uno-go' ? 'block' : 'none';

  // 1. Notify 3D WebGL renderer to update meshes dynamically
  if (threeRenderer) {
    threeRenderer.updateState(gameState, isSpectator, spectatingPlayerId);
  }

  // 2. Draw active seat lists with Monopoly Cash and Uno cards counter indicators
  const playerList = document.getElementById('player-list');
  if (playerList) {
    playerList.innerHTML = Object.values(gameState.players).map(p => {
      const isActive = gameState.turn.currentPlayerId === p.id;
      const isOurSeat = !isReplayMode && activeSeatId === p.id;
      
      let scoreLabel = '';
      if (activeGame === 'monopoly-go') {
        scoreLabel = `<span style="font-weight: bold; color: #10b981; margin-left: 10px;">Cash: $${p.money !== undefined ? p.money : 1500}</span>`;
      } else if (activeGame === 'uno-go') {
        scoreLabel = `<span style="font-weight: bold; color: #f59e0b; margin-left: 10px;">Cards: ${p.hand ? p.hand.length : 0}</span>`;
      } else {
        scoreLabel = `<span style="font-size: 12px; color: var(--text-muted); margin-left: 10px;">Position: Tile ${gameState.moduleState.playerPositions[p.id] || 0}</span>`;
      }

      return `
        <div class="player-slot ${isActive ? 'active' : ''}">
          <div class="pawn-avatar" style="background-color: ${p.color};">${p.emojiFace}</div>
          <div style="flex-grow: 1;">
            <strong>Player ${p.id === 'P1' ? '1' : p.id}</strong>
            ${scoreLabel}
            ${isOurSeat ? '<span style="font-size: 11px; background: rgba(99, 102, 241, 0.2); border-radius: 4px; padding: 2px 6px; margin-left: 10px;">YOU</span>' : ''}
          </div>
          <div>${isActive ? `<span style="color: #6366f1; font-weight: 700;">Active Turn (${gameState.turn.phase})</span>` : 'Waiting'}</div>
        </div>
      `;
    }).join('');
  }

  // 3. Draw Monopoly Owned properties list
  if (activeGame === 'monopoly-go') {
    const ledger = document.getElementById('monopoly-ledger');
    if (ledger) {
      const owned = gameState.moduleState.propertiesOwned || {};
      const ownedEntries = Object.entries(owned);
      if (ownedEntries.length === 0) {
        ledger.innerHTML = 'No properties owned yet.';
      } else {
        ledger.innerHTML = ownedEntries.map(([tileIdx, ownerId]) => {
          const tile = monopolyModule.board.tiles[parseInt(tileIdx)];
          const owner = gameState.players[ownerId];
          return `
            <div style="display:flex; justify-content:space-between; padding: 4px; border-bottom: 1px solid rgba(255,255,255,0.01);">
              <span>${tile.emoji} <strong>${tile.name}</strong></span>
              <span style="color: ${owner?.color || '#fff'}; font-weight:bold;">Player ${ownerId}</span>
            </div>
          `;
        }).join('');
      }
    }
  }

  // 4. Draw Uno Card Hand GUI list (Only visible to player during Uno)
  if (activeGame === 'uno-go') {
    const handContainer = document.getElementById('my-cards-container');
    if (handContainer) {
      const myHand = gameState.players[activeSeatId]?.hand || [];
      const isMyTurn = !isReplayMode && gameState.turn.currentPlayerId === activeSeatId;
      
      if (myHand.length === 0) {
        handContainer.innerHTML = '<span style="color: var(--text-muted); font-size:12px;">No cards in hand.</span>';
      } else {
        handContainer.innerHTML = myHand.map(card => {
          return `
            <button class="action-btn card-btn" data-card-id="${card.id}" style="background: ${getUnoColorHex(card.color)}; min-width: 68px; height: 94px; border-radius: 8px; border: 2px solid white; color: white; font-weight: bold; font-size: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.35); text-transform: uppercase; margin-right: 4px;" ${!isMyTurn ? 'disabled' : ''}>
              ${card.value}
            </button>
          `;
        }).join('');

        // Attach play card listeners
        if (isMyTurn) {
          const btns = handContainer.querySelectorAll('.card-btn');
          btns.forEach(btn => {
            btn.addEventListener('click', (e) => {
              const cid = (e.currentTarget as HTMLButtonElement).dataset.cardId;
              const selectedCard = myHand.find(c => c.id === cid);
              if (selectedCard) {
                syncEngine?.dispatch('PLAY_CARD', { card: selectedCard });
              }
            });
          });
        }
      }
    }
  }

  // 5. Button states (HUD controls)
  if (!isReplayMode) {
    const moveBtn = document.getElementById('btn-move') as HTMLButtonElement;
    const resolveBtn = document.getElementById('btn-resolve') as HTMLButtonElement;
    const buyPropertyBtn = document.getElementById('btn-buy-property') as HTMLButtonElement;
    const drawCardBtn = document.getElementById('btn-draw-card') as HTMLButtonElement;
    const endBtn = document.getElementById('btn-end') as HTMLButtonElement;
    const dice = document.getElementById('physical-dice');

    const isMyTurn = gameState.turn.currentPlayerId === activeSeatId;
    const isRollPhase = gameState.turn.phase === 'Roll' || gameState.turn.phase === 'StartTurn';

    if (moveBtn && resolveBtn && buyPropertyBtn && drawCardBtn && endBtn) {
      if (isSpectator) {
        moveBtn.disabled = true;
        resolveBtn.disabled = true;
        buyPropertyBtn.disabled = true;
        drawCardBtn.disabled = true;
        endBtn.disabled = true;
      } else {
        moveBtn.disabled = !isMyTurn || gameState.turn.phase !== 'Move';
        resolveBtn.disabled = !isMyTurn || gameState.turn.phase !== 'ResolveTile';
        buyPropertyBtn.disabled = !isMyTurn || gameState.turn.phase !== 'OptionalActions';
        drawCardBtn.disabled = !isMyTurn || gameState.turn.phase !== 'StartTurn';
        
        // End turn options
        if (activeGame === 'monopoly-go') {
          endBtn.disabled = !isMyTurn || (gameState.turn.phase !== 'EndTurn' && gameState.turn.phase !== 'OptionalActions');
        } else {
          endBtn.disabled = !isMyTurn || gameState.turn.phase !== 'EndTurn';
        }
      }
    }

    if (dice) {
      dice.innerText = gameState.moduleState.lastDiceValue ? String(gameState.moduleState.lastDiceValue) : '🎲';
      if (isMyTurn && isRollPhase && activeGame !== 'uno-go' && !isSpectator) {
        dice.style.opacity = '1.0';
        dice.style.pointerEvents = 'auto';
      } else {
        dice.style.opacity = '0.65';
        dice.style.pointerEvents = 'none';
      }
    }
  }

  // 6. Render Event Feed
  const feed = document.getElementById('event-feed');
  if (feed) {
    feed.innerHTML = gameState.eventLog.map(e => {
      let text = `[Event: ${e.type}]`;
      if (e.type === 'DICE_ROLLED') text = `🎲 Player ${e.playerId} rolled a ${e.payload.value}`;
      if (e.type === 'PIECE_MOVED') text = `🏃 Player ${e.playerId} moved forward ${e.payload.spaces} steps`;
      if (e.type === 'PHASE_CHANGED') text = `⚙️ Phase changed to: ${e.payload.phase}`;
      if (e.type === 'TURN_ENDED') text = `🏁 Player ${e.playerId} ended their turn`;
      if (e.type === 'PLAYER_JOINED') text = `👤 Player ${e.playerId} joined the lobby`;
      if (e.type === 'PLAYER_WON') text = `🏆 Player ${e.playerId} reached the target and won!`;
      if (e.type === 'DISCORD_PINNED') text = `🔊 Voice Link pinned: ${e.payload.link}`;
      if (e.type === 'PROPERTY_BOUGHT') text = `🏠 Player ${e.playerId} bought Property ${e.payload.tileIndex} for $${e.payload.cost}`;
      if (e.type === 'RENT_PAID') text = `💸 Player ${e.playerId} paid $${e.payload.rent} rent to Player ${e.payload.ownerId}`;
      if (e.type === 'CARD_PLAYED') text = `🎴 Player ${e.playerId} played a ${e.payload.card.color} ${e.payload.card.value}`;
      if (e.type === 'CARD_DRAWN') text = `📥 Player ${e.playerId} drew a card from deck`;
      if (e.type === 'UNO_SKIPPED') text = `🚫 Player ${e.playerId} was skipped!`;
      if (e.type === 'UNO_REVERSED') text = `🔄 Player ${e.playerId} reversed turn direction!`;
      if (e.type === 'SALARY_COLLECTED') text = `💰 Player ${e.playerId} crossed GO and collected $200!`;
      if (e.type === 'CHANCE_BONUS') text = `🎁 Player ${e.playerId} hit Chance and won a $${e.payload.bonus} bonus!`;
      if (e.type === 'TAX_PAID') text = `📉 Player ${e.playerId} paid $${e.payload.amount} in taxes`;
      return `<div class="event-item">${text}</div>`;
    }).join('');
    feed.scrollTop = feed.scrollHeight;
  }

  // 7. Render inspector JSON
  const inspector = document.getElementById('state-inspector');
  if (inspector) {
    inspector.innerText = JSON.stringify(gameState, null, 2);
  }

  // 8. Victory Celeb Check
  const winEvent = gameState.eventLog.find(e => e.type === 'PLAYER_WON');
  const victoryEl = document.getElementById('victory-overlay');
  if (victoryEl) {
    if (winEvent) {
      const winner = gameState.players[winEvent.playerId!];
      victoryEl.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 16px;">🎉🏆🥇</div>
        <h1 style="background: linear-gradient(to right, #fbbf24, #f59e0b); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Player ${winEvent.playerId} (${winner?.emojiFace}) Wins!</h1>
        <p style="color: var(--text-muted); font-size: 16px;">Deterministic simulation complete.</p>
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

  // 9. Update Pinned Discord Invite Banner
  const banner = document.getElementById('discord-active-banner');
  if (banner) {
    if (gameState.discordInviteLink) {
      banner.innerHTML = `
        <div style="background: rgba(88, 101, 242, 0.12); border: 1px solid rgba(88, 101, 242, 0.3); padding: 10px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #a5b4fc; font-weight: bold; margin-bottom: 12px; width: 100%;">
          <span>🔊 Pinned Voice Channel Connected!</span>
          <a href="${gameState.discordInviteLink}" target="_blank" class="action-btn" style="background: #5865f2; color: white; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 11px; margin-right: 0;">Join Voice Chat</a>
        </div>
      `;
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  }

  // 10. Update floating Chat Drawer messages and binds
  renderChatHistory(gameState);
}

function refreshVisualTimer(gameState: EngineState) {
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }

  const timerBanner = document.getElementById('turn-timer-banner');
  const timerBar = document.getElementById('turn-timer-bar');
  const timerText = document.getElementById('turn-timer-text');
  if (!timerBanner || !timerBar || !timerText) return;

  const limit = gameState.timerLimit || 0;
  if (limit <= 0) {
    timerBanner.style.display = 'none';
    return;
  }

  timerBanner.style.display = 'block';

  const updateBar = () => {
    const elapsed = (Date.now() - (gameState.turnStartedAt || Date.now())) / 1000;
    const remaining = Math.max(0, limit - elapsed);
    const pct = (remaining / limit) * 100;
    timerBar.style.width = `${pct}%`;
    timerText.innerText = `${Math.ceil(remaining)}s left`;

    if (remaining <= 0) {
      if (timerIntervalId !== null) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
      }
      if (syncEngine && syncEngine.isHost && syncEngine.state.turn.currentPlayerId === activeSeatId) {
        triggerAutoTurnAction(syncEngine.state);
      }
    }
  };

  updateBar();
  timerIntervalId = setInterval(updateBar, 250);
}

function triggerAutoTurnAction(state: EngineState) {
  if (!syncEngine) return;
  const activeGame = state.activeModule || 'ludo-go-classic';

  if (activeGame === 'uno-go') {
    const myHand = state.players[state.turn.currentPlayerId]?.hand || [];
    const topCard = state.moduleState.unoDiscardPile?.[state.moduleState.unoDiscardPile.length - 1];
    let played = false;

    if (topCard) {
      const match = myHand.find((c: any) => c.color === topCard.color || c.value === topCard.value);
      if (match) {
        syncEngine.dispatch('PLAY_CARD', { card: match });
        played = true;
      }
    }

    if (!played) {
      syncEngine.dispatch('DRAW_CARD');
    }
  } else {
    // Ludo or Monopoly
    if (state.turn.phase === 'Roll' || state.turn.phase === 'StartTurn') {
      syncEngine.dispatch('ROLL_DICE', { speed: 0.25 });
    } else if (state.turn.phase === 'Move') {
      syncEngine.dispatch('MOVE_PIECE', { spaces: state.moduleState.lastDiceValue || 3 });
    } else if (state.turn.phase === 'ResolveTile') {
      syncEngine.dispatch('RESOLVE_TILE');
    } else if (state.turn.phase === 'OptionalActions' || state.turn.phase === 'EndTurn') {
      syncEngine.dispatch('END_TURN');
    }
  }
}

function refreshDeedCardModal(gameState: EngineState) {
  const modal = document.getElementById('property-card-modal');
  const content = document.getElementById('deed-card-content');
  if (!modal || !content) return;

  const activeGame = gameState.activeModule || 'ludo-go-classic';
  if (activeGame !== 'monopoly-go') {
    modal.classList.remove('active');
    return;
  }

  const currPlayerId = gameState.turn.currentPlayerId;
  const playerPos = gameState.moduleState.playerPositions[currPlayerId] || 0;
  const tileIdx = playerPos % 16;
  const tile = monopolyModule.board.tiles[tileIdx];

  const isProperty = tile && tile.type === 'property';
  const isUnowned = isProperty && !gameState.moduleState.propertiesOwned?.[tileIdx];
  const showModal = isUnowned && gameState.turn.phase === 'OptionalActions' && !isReplayMode;

  if (!showModal) {
    modal.classList.remove('active');
    return;
  }

  const isMyTurn = currPlayerId === activeSeatId;
  const color = tile.color || '#3b82f6';
  const cost = tile.payload?.cost || 100;
  const rent = tile.payload?.rent || 10;

  content.innerHTML = `
    <div class="deed-header" style="background-color: ${color};">
      Title Deed
    </div>
    <div class="deed-title">Monopoly Go Lite</div>
    <div class="deed-name">${tile.name}</div>
    
    <div style="margin: 12px 0;">
      <div class="deed-rent-row">
        <span>Rent</span>
        <strong>$${rent}</strong>
      </div>
      <div class="deed-rent-row">
        <span>With 1 House</span>
        <span>$${rent * 3}</span>
      </div>
      <div class="deed-rent-row">
        <span>With 2 Houses</span>
        <span>$${rent * 8}</span>
      </div>
      <div class="deed-rent-row">
        <span>Mortgage Value</span>
        <span>$${cost / 2}</span>
      </div>
    </div>

    <div class="deed-price-info">
      Purchase Price: $${cost}
    </div>

    <div style="margin-top: 16px; display: flex; gap: 8px; justify-content: center;">
      ${isMyTurn ? `
        <button class="action-btn" id="modal-buy-confirm" style="background: #10b981; padding: 8px 16px; margin: 0; font-size: 13px;">Buy Property</button>
        <button class="action-btn" id="modal-buy-decline" style="background: #ef4444; padding: 8px 16px; margin: 0; font-size: 13px;">Decline</button>
      ` : `
        <div style="font-size: 12px; color: var(--text-muted); font-style: italic; text-align: center; width: 100%;">
          Waiting for Player ${currPlayerId === 'P1' ? '1' : currPlayerId} to purchase...
        </div>
      `}
    </div>
  `;

  modal.classList.add('active');

  if (isMyTurn) {
    // Force click binding
    const confirmBtn = document.getElementById('modal-buy-confirm');
    const declineBtn = document.getElementById('modal-buy-decline');

    confirmBtn?.addEventListener('click', () => {
      syncEngine?.dispatch('BUY_PROPERTY');
      modal.classList.remove('active');
    });

    declineBtn?.addEventListener('click', () => {
      modal.classList.remove('active');
    });
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
      <path d="M12,2c-0.6,0-1,0.4-1,1v8c0,0.6,0.4,1,1,1s1-0.4,1-1V3C13,2.4,12.6,2,12,2z M7,8c-0.6,0-1,0.4-1,1v3c0,0.6,0.4,1,1,1s1-0.4,1-1V9C8,8.4,7.6,8,7,8z M17,9c-0.6,0-1,0.4-1,1v2.5c0,0.6,0.4,1,1,1s1-0.4,1-1V10C18,9.4,17.6,9,17,9z M12,14c-2.8,0-5,2.2-5,5v2c0,0.6,0.4,1,1,1h8c0.6,0,1-0.4,1-1v-2C17,16.2,14.8,14,12,14z"/>
    </svg>
  `;
  document.body.appendChild(handCursor);
}

const SVG_IDLE = `
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12,2c-0.6,0-1,0.4-1,1v8c0,0.6,0.4,1,1,1s1-0.4,1-1V3C13,2.4,12.6,2,12,2z M7,8c-0.6,0-1,0.4-1,1v3c0,0.6,0.4,1,1,1s1-0.4,1-1V9C8,8.4,7.6,8,7,8z M17,9c-0.6,0-1,0.4-1,1v2.5c0,0.6,0.4,1,1,1s1-0.4,1-1V10C18,9.4,17.6,9,17,9z M12,14c-2.8,0-5,2.2-5,5v2c0,0.6,0.4,1,1,1h8c0.6,0,1-0.4,1-1v-2C17,16.2,14.8,14,12,14z"/>
  </svg>
`;

const SVG_POINTING = `
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12,2c-0.6,0-1,0.4-1,1v7.5c-0.6,0-1,0.4-1,1s0.4,1,1,1h1V11c0.6,0,1-0.4,1-1V3C13,2.4,12.6,2,12,2z M7,11c-0.6,0-1,0.4-1,1v2c0,0.6,0.4,1,1,1s1-0.4,1-1v-2C8,11.4,7.6,11,7,11z M17,11c-0.6,0-1,0.4-1,1v2.5c0,0.6,0.4,1,1,1s1-0.4,1-1V12C18,11.4,17.6,11,17,11z M12,16c-2.8,0-5,2.2-5,5v1c0,0.6,0.4,1,1,1h8c0.6,0,1-0.4,1-1v-1C17,18.2,14.8,16,12,16z"/>
  </svg>
`;

const SVG_GRAB = `
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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

let mockDownloadIntervals: Record<string, any> = {};
let mockDownloadProgress: Record<string, number> = {};

function startMockDownloads(gameState: EngineState) {
  Object.values(mockDownloadIntervals).forEach(intervalId => clearInterval(intervalId));
  mockDownloadIntervals = {};

  Object.keys(gameState.players).forEach(pid => {
    mockDownloadProgress[pid] = 0;
    const interval = setInterval(() => {
      if (mockDownloadProgress[pid] >= 100) {
        mockDownloadProgress[pid] = 100;
        clearInterval(mockDownloadIntervals[pid]);
        delete mockDownloadIntervals[pid];
      } else {
        mockDownloadProgress[pid] += Math.floor(Math.random() * 20) + 10;
        if (mockDownloadProgress[pid] > 100) mockDownloadProgress[pid] = 100;
      }
      if (syncEngine && !syncEngine.state.lobbyStarted) {
        renderLobbyRoom(syncEngine.state);
      }
    }, 350);
    mockDownloadIntervals[pid] = interval;
  });
}

const RULE_CHOICES: Record<string, Record<string, string[]>> = {
  'uno-go': {
    unoRuleSet: ['Classic Uno', 'Speed Uno', 'Custom Uno'],
    unoDrawRule: ['Stacking Active', 'No Stacking', 'Draw to Match'],
    unoStartingCards: ['7 cards', '5 cards', '10 cards'],
    unoTurnTimer: ['60 sec', '30 sec', '90 sec', 'Off']
  },
  'monopoly-go': {
    monopolyRuleSet: ['Speed Monopoly', 'Classic Monopoly'],
    monopolyStartingMoney: ['$1500', '$1000', '$2000'],
    monopolyFreeParking: ['No Rent Collect', 'Collect $500', 'Jackpot Pool'],
    monopolyGoSalary: ['$200', '$100', '$300']
  },
  'ludo-go-classic': {
    ludoRuleSet: ['Circular Ludo', 'Classic Ludo'],
    ludoStartingTokens: ['4 tokens', '2 tokens', '3 tokens'],
    ludoTurnTimer: ['60 sec', '30 sec', '90 sec', 'Off']
  }
};

const RULE_LABELS: Record<string, string> = {
  unoRuleSet: 'Rule Set',
  unoDrawRule: 'Draw Card Rule',
  unoStartingCards: 'Starting Cards',
  unoTurnTimer: 'Turn Timer',
  monopolyRuleSet: 'Rule Set',
  monopolyStartingMoney: 'Starting Money',
  monopolyFreeParking: 'Free Parking',
  monopolyGoSalary: 'Go Salary',
  ludoRuleSet: 'Rule Set',
  ludoStartingTokens: 'Starting Tokens',
  ludoTurnTimer: 'Turn Timer'
};

let tempLobbySettings: Record<string, string> = {};

function cycleRuleValue(gameKey: string, ruleKey: string, direction: 'forward' | 'backward') {
  const choices = RULE_CHOICES[gameKey]?.[ruleKey];
  if (!choices) return;
  
  const currentVal = tempLobbySettings[ruleKey];
  let currentIndex = choices.indexOf(currentVal);
  if (currentIndex === -1) currentIndex = 0;
  
  if (direction === 'forward') {
    currentIndex = (currentIndex + 1) % choices.length;
  } else {
    currentIndex = (currentIndex - 1 + choices.length) % choices.length;
  }
  
  tempLobbySettings[ruleKey] = choices[currentIndex];
  renderRulesEditContainer(gameKey);
}

function renderRulesEditContainer(gameKey: string) {
  const container = document.getElementById('rules-edit-container');
  if (!container) return;
  
  const rules = RULE_CHOICES[gameKey];
  if (!rules) {
    container.innerHTML = `<p style="color: var(--text-muted); padding: 12px; text-align: center;">No customizable rules for this game.</p>`;
    return;
  }
  
  container.innerHTML = Object.keys(rules).map(ruleKey => {
    const label = RULE_LABELS[ruleKey] || ruleKey;
    const currentVal = tempLobbySettings[ruleKey];
    return `
      <div style="margin-bottom: 12px;">
        <label style="font-size: 11px; font-weight: bold; color: var(--text-muted); text-transform: uppercase;">${label}</label>
        <div class="rule-cycle-row" style="margin-top: 4px; margin-bottom: 0;">
          <button class="rule-cycle-btn btn-cycle-prev" data-rule="${ruleKey}">◀</button>
          <span class="rule-cycle-val">${currentVal}</span>
          <button class="rule-cycle-btn btn-cycle-next" data-rule="${ruleKey}">▶</button>
        </div>
      </div>
    `;
  }).join('');
  
  // Bind cycle click handlers
  container.querySelectorAll('.btn-cycle-prev').forEach(btn => {
    btn.addEventListener('click', () => {
      const rule = btn.getAttribute('data-rule');
      if (rule) cycleRuleValue(gameKey, rule, 'backward');
    });
  });
  
  container.querySelectorAll('.btn-cycle-next').forEach(btn => {
    btn.addEventListener('click', () => {
      const rule = btn.getAttribute('data-rule');
      if (rule) cycleRuleValue(gameKey, rule, 'forward');
    });
  });
}

function renderLobbyRoom(gameState: EngineState) {
  const mainContent = document.getElementById('lobby-main-content');
  if (!mainContent) return;

  mainContent.classList.remove('gameplay-active');
  mainContent.style.display = 'flex';
  mainContent.style.gap = '32px';
  mainContent.style.justifyContent = 'center';
  mainContent.style.alignItems = 'stretch';
  mainContent.style.padding = '32px 24px';
  mainContent.style.boxSizing = 'border-box';
  mainContent.style.height = 'calc(100vh - 48px)';
  mainContent.style.maxWidth = '1440px';
  mainContent.style.margin = '0 auto';
  
  const lobbyId = syncEngine?.lobbyId || 'LOBBY';
  const currPlayerId = activeSeatId;
  const isMyHost = gameState.players[currPlayerId]?.isHost === true;
  const selectedGame = gameState.selectedGame || 'ludo-go-classic';

  // Retrieve customizable settings or fall back to defaults
  const settings = gameState.lobbySettings || {};
  const unoRuleSet = settings.unoRuleSet || 'Classic Uno';
  const unoDrawRule = settings.unoDrawRule || 'Stacking Active';
  const unoStartingCards = settings.unoStartingCards || '7 cards';
  const unoTurnTimer = settings.unoTurnTimer || '60 sec';

  const monopolyRuleSet = settings.monopolyRuleSet || 'Speed Monopoly';
  const monopolyStartingMoney = settings.monopolyStartingMoney || '$1500';
  const monopolyFreeParking = settings.monopolyFreeParking || 'No Rent Collect';
  const monopolyGoSalary = settings.monopolyGoSalary || '$200';

  const ludoRuleSet = settings.ludoRuleSet || 'Circular Ludo';
  const ludoStartingTokens = settings.ludoStartingTokens || '4 tokens';
  const ludoTurnTimer = settings.ludoTurnTimer || '60 sec';

  // Ensure default progress initialized if mock progress empty
  Object.keys(gameState.players).forEach(pid => {
    if (mockDownloadProgress[pid] === undefined) {
      mockDownloadProgress[pid] = 100;
    }
  });

  mainContent.innerHTML = `
    <!-- Panel 1: Lobby Info & Players Roster -->
    <div class="sandbox-panel" style="flex: 1; max-width: 460px; min-height: 600px; display: flex; flex-direction: column; gap: 20px;">
      <div>
        <h3 style="margin-top: 0; margin-bottom: 8px;">Lobby Details</h3>
        <div style="background: #1e293b; border: 1.5px solid #3b82f6; border-radius: 12px; padding: 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.25);">
          <div class="code-panel" style="display: flex; align-items: center; justify-content: space-between;">
            <div>
              <div style="font-size: 11px; color: #94a3b8; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
                <span class="pulse-green-dot"></span> LOBBY CODE
              </div>
              <h1 style="margin: 0; font-size: 26px; font-weight: bold; letter-spacing: 1.5px; color: #60a5fa; text-shadow: 0 0 10px rgba(96,165,250,0.3); background: rgba(96, 165, 250, 0.1); border: 1px dashed rgba(96, 165, 250, 0.4); padding: 4px 10px; border-radius: 6px; display: inline-block;">${lobbyId}</h1>
            </div>
            <button class="action-btn" id="btn-copy-code" style="padding: 10px 16px; margin: 0; background: #2563eb; color: white; border: none; border-radius: 8px; font-weight: bold; font-size: 13px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#1d4ed8'" onmouseout="this.style.background='#2563eb'">📋 Copy</button>
          </div>
          <div style="margin-top: 14px; font-size: 12px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px;">
            <div style="color: #94a3b8; margin-bottom: 6px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">LOBBY LINK</div>
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
              <span style="color: #60a5fa; font-weight: bold; font-family: monospace; background: rgba(15, 23, 42, 0.6); padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); flex-grow: 1; overflow-x: auto; white-space: nowrap;">tbl.top/join/${lobbyId}</span>
              <button class="action-btn" id="btn-copy-link" style="padding: 8px 14px; margin: 0; font-size: 12px; background: #2563eb; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#1d4ed8'" onmouseout="this.style.background='#2563eb'">Copy</button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 style="margin-bottom: 8px;">Active Seats (${Object.keys(gameState.players).length}/8)</h3>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${Object.keys(gameState.players).map(pid => {
            const p = gameState.players[pid];
            const isMe = pid === currPlayerId;
            return `
              <div class="player-list-row" style="background: rgba(255,255,255,0.01); border: 1px solid var(--panel-border); border-radius: 8px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;">
                <div class="player-list-info" style="display: flex; align-items: center; gap: 10px;">
                  <div class="player-pawn-circle" style="background-color: ${p.color}; width: 14px; height: 14px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.2);"></div>
                  <span class="player-list-name" style="font-size: 13px; font-weight: 500;">
                    ${p.emojiFace} Player ${pid.substring(1)} ${p.isHost ? '<span style="text-shadow: 0 0 8px #eab308; color: #fbbf24; margin-left: 2px;">👑</span>' : ''} ${isMe ? '(You)' : ''}
                  </span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="player-list-ready" style="font-size: 11px; color: ${p.isSpectator ? '#94a3b8' : 'var(--ready-green)'}; font-weight: bold; display: flex; align-items: center; gap: 4px;">
                    ${p.isSpectator ? '👁️ Spectating' : '🎮 Playing'}
                  </span>
                  ${isMe ? `
                    <button class="action-btn" id="btn-toggle-my-role" style="padding: 4px 8px; font-size: 11px; margin: 0; background: rgba(59,130,246,0.15); border: 1px solid #3b82f6; color: #60a5fa; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                      ${p.isSpectator ? '🎮 Play' : '👁️ Spectate'}
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- Panel 2: Selected Game & Rules -->
    <div class="sandbox-panel" style="flex: 1.5; max-width: 760px; min-height: 600px; display: flex; flex-direction: column; gap: 20px;">
      <div>
        <h3 style="margin-top: 0; margin-bottom: 8px;">Selected Game Module</h3>
        
        <!-- Game Selection for Host, Info Card for Peers -->
        ${isMyHost ? `
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">Host game selector: click card to select game</div>
          <div class="game-selection-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
            <div class="game-card ${selectedGame === 'uno-go' ? 'active' : ''}" data-game="uno-go">
              <div class="game-card-img" style="height: 60px; background-image: url('https://placehold.co/180x90/701a75/ffffff?text=UNO+GO');"></div>
              <div class="game-card-title" style="font-size: 11px;">UNO GO</div>
            </div>
            <div class="game-card ${selectedGame === 'monopoly-go' ? 'active' : ''}" data-game="monopoly-go">
              <div class="game-card-img" style="height: 60px; background-image: url('https://placehold.co/180x90/1e3a8a/ffffff?text=MONOPOLY');"></div>
              <div class="game-card-title" style="font-size: 11px;">MONOPOLY</div>
            </div>
            <div class="game-card ${selectedGame === 'ludo-go-classic' ? 'active' : ''}" data-game="ludo-go-classic">
              <div class="game-card-img" style="height: 60px; background-image: url('https://placehold.co/180x90/065f46/ffffff?text=LUDO+GO');"></div>
              <div class="game-card-title" style="font-size: 11px;">LUDO GO</div>
            </div>
          </div>
        ` : `
          <!-- Prominent Selected Game Display for Peers -->
          <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 16px;">
            <div style="width: 100px; height: 60px; border-radius: 8px; background-size: cover; background-position: center; background-image: url('https://placehold.co/180x90/${selectedGame === 'uno-go' ? '701a75' : selectedGame === 'monopoly-go' ? '1e3a8a' : '065f46'}/ffffff?text=${selectedGame.replace(/-/g, '+').toUpperCase()}');"></div>
            <div>
              <h2 style="margin: 0; font-size: 18px; text-transform: uppercase;">${selectedGame.replace(/-/g, ' ')}</h2>
              <p style="margin: 2px 0 0 0; font-size: 11px; color: var(--text-muted);">Active downloadable module</p>
            </div>
          </div>
        `}
      </div>

      <!-- Download status bars wrapped in Accordion Details -->
      <div>
        <details style="background: rgba(255,255,255,0.01); border: 1px solid var(--panel-border); border-radius: 10px; padding: 10px;">
          <summary style="font-weight: bold; cursor: pointer; color: #60a5fa; list-style: none; display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
            <span>📦 Download Modules Status</span>
            <span style="font-size: 11px; opacity: 0.8;">▼ Toggle</span>
          </summary>
          <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 10px; font-size: 12px;">
            ${Object.keys(gameState.players).map(pid => {
              const p = gameState.players[pid];
              const progress = mockDownloadProgress[pid] || 100;
              const totalSize = selectedGame === 'uno-go' ? 250 : selectedGame === 'monopoly-go' ? 320 : 180;
              const currentSize = Math.round((progress / 100) * totalSize);
              return `
                <div style="display: flex; flex-direction: column; gap: 4px;">
                  <div style="display: flex; justify-content: space-between;">
                    <span style="font-weight: bold;">${p.emojiFace} Player ${pid.substring(1)}</span>
                    <span style="color: var(--text-muted); font-size: 11px;">${currentSize} MB / ${totalSize} MB (${progress}%)</span>
                  </div>
                  <div class="download-progress-bar-container">
                    <div class="download-progress-bar" style="width: ${progress}%;"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </details>
      </div>

      <!-- Game Rules (directly below) -->
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h3 style="margin: 0;">Game Rules</h3>
          ${isMyHost ? `
            <button class="action-btn" id="btn-edit-rules" style="padding: 4px 10px; margin: 0; font-size: 11px; background: rgba(59,130,246,0.1); border: 1px solid #3b82f6; color: #60a5fa; cursor: pointer; border-radius: 6px; display: flex; align-items: center; gap: 4px;">✏️ Edit Rules</button>
          ` : ''}
        </div>
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 10px; padding: 12px; font-size: 12px;">
          ${selectedGame === 'uno-go' ? `
            <div class="rules-table-row">
              <span class="rules-table-label">Rule Set</span>
              <span class="rules-table-val">${unoRuleSet}</span>
            </div>
            <div class="rules-table-row">
              <span class="rules-table-label">Draw Card Rule</span>
              <span class="rules-table-val">${unoDrawRule}</span>
            </div>
            <div class="rules-table-row">
              <span class="rules-table-label">Starting Cards</span>
              <span class="rules-table-val">${unoStartingCards}</span>
            </div>
            <div class="rules-table-row">
              <span class="rules-table-label">Turn Timer</span>
              <span class="rules-table-val">${unoTurnTimer}</span>
            </div>
          ` : selectedGame === 'monopoly-go' ? `
            <div class="rules-table-row">
              <span class="rules-table-label">Rule Set</span>
              <span class="rules-table-val">${monopolyRuleSet}</span>
            </div>
            <div class="rules-table-row">
              <span class="rules-table-label">Starting Money</span>
              <span class="rules-table-val">${monopolyStartingMoney}</span>
            </div>
            <div class="rules-table-row">
              <span class="rules-table-label">Free Parking</span>
              <span class="rules-table-val">${monopolyFreeParking}</span>
            </div>
            <div class="rules-table-row">
              <span class="rules-table-label">Go Salary</span>
              <span class="rules-table-val">${monopolyGoSalary}</span>
            </div>
          ` : `
            <div class="rules-table-row">
              <span class="rules-table-label">Rule Set</span>
              <span class="rules-table-val">${ludoRuleSet}</span>
            </div>
            <div class="rules-table-row">
              <span class="rules-table-label">Starting Tokens</span>
              <span class="rules-table-val">${ludoStartingTokens}</span>
            </div>
            <div class="rules-table-row">
              <span class="rules-table-label">Turn Timer</span>
              <span class="rules-table-val">${ludoTurnTimer}</span>
            </div>
          `}
        </div>
      </div>

      <!-- Voice and Start Actions -->
      <div style="margin-top: auto; display: flex; flex-direction: column; gap: 10px;">
        ${isMyHost ? `
          <button class="btn-start-game-lobby" id="btn-start-game-confirm" style="width: 100%; margin: 0; padding: 12px;">START GAME</button>
        ` : `
          <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 10px; padding: 14px; text-align: center; color: var(--text-muted); font-size: 13px; font-weight: bold;">
            Waiting for Host to Start...
          </div>
        `}
      </div>
    </div>

    <!-- Floating Rules Edit Drawer -->
    <div class="rules-drawer" id="rules-drawer">
      <h3 style="margin-top: 0; margin-bottom: 12px; color: white;">✏️ Edit Game Rules</h3>
      <div id="rules-edit-container" style="flex-grow: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
        <!-- Dynamic Rules Selectors populated by JS -->
      </div>
      <div style="display: flex; gap: 8px; margin-top: 12px;">
        <button class="action-btn" id="btn-save-rules" style="flex-grow: 1; padding: 10px; margin: 0; background: var(--accent-purple); color: white; border-radius: 8px; font-weight: bold;">Save Rules</button>
        <button class="action-btn" id="btn-close-rules" style="padding: 10px 14px; margin: 0; background: #374151; color: white; border-radius: 8px;">Cancel</button>
      </div>
    </div>

    <!-- Floating Chat Toggle Drawer -->
    <button class="chat-drawer-toggle" id="btn-chat-toggle">◀</button>
    <div class="chat-drawer" id="chat-drawer">
      <h3 style="margin-top: 0; margin-bottom: 12px; color: white;">💬 Lobby Chat</h3>
      <div id="chat-pinned-container" style="display: none; margin-bottom: 8px;"></div>
      <div id="chat-messages" style="flex-grow: 1; overflow-y: auto; background: rgba(0,0,0,0.18); border-radius: 10px; padding: 8px; border: 1px solid var(--panel-border); font-size: 13px; margin-bottom: 12px;"></div>
      <div style="display: flex; gap: 6px;">
        <input type="text" id="chat-input" placeholder="Type a message..." style="flex-grow: 1; background: #1e293b; color: white; border: 1px solid var(--panel-border); padding: 10px; border-radius: 8px; font-size: 13px;">
        <button class="action-btn" id="btn-send-chat" style="padding: 10px 14px; font-size: 13px; margin-right: 0;">Send</button>
      </div>
    </div>
  `;

  // Bind lobby buttons
  document.getElementById('btn-copy-code')?.addEventListener('click', () => {
    navigator.clipboard.writeText(lobbyId);
    triggerFloatingMoneyAlert(100);
  });
  document.getElementById('btn-copy-link')?.addEventListener('click', () => {
    navigator.clipboard.writeText(`http://${window.location.host}/join/${lobbyId}`);
  });

  document.getElementById('btn-toggle-my-role')?.addEventListener('click', () => {
    syncEngine?.dispatch('TOGGLE_SPECTATOR_ROLE');
  });

  if (isMyHost) {
    const rulesDrawer = document.getElementById('rules-drawer');
    
    document.getElementById('btn-edit-rules')?.addEventListener('click', () => {
      const currentSettings = gameState.lobbySettings || {};
      const gameChoices = RULE_CHOICES[selectedGame] || {};
      
      Object.keys(gameChoices).forEach(ruleKey => {
        tempLobbySettings[ruleKey] = currentSettings[ruleKey] || gameChoices[ruleKey][0];
      });
      
      renderRulesEditContainer(selectedGame);
      rulesDrawer?.classList.add('active');
    });

    document.getElementById('btn-save-rules')?.addEventListener('click', () => {
      syncEngine?.dispatch('UPDATE_LOBBY_SETTINGS', { settings: tempLobbySettings });
      rulesDrawer?.classList.remove('active');
    });

    document.getElementById('btn-close-rules')?.addEventListener('click', () => {
      rulesDrawer?.classList.remove('active');
    });

    document.querySelectorAll('.game-selection-grid .game-card').forEach(card => {
      card.addEventListener('click', () => {
        const game = card.getAttribute('data-game');
        if (game) {
          syncEngine?.dispatch('SELECT_LOBBY_GAME', { game });
          startMockDownloads(gameState);
        }
      });
    });

    document.getElementById('btn-start-game-confirm')?.addEventListener('click', () => {
      syncEngine?.dispatch('START_GAME');
    });
  }

  const sendChat = () => {
    const input = document.getElementById('chat-input') as HTMLInputElement;
    const text = input.value.trim();
    if (text) {
      syncEngine?.sendChat(text);
      input.value = '';
    }
  };
  document.getElementById('btn-send-chat')?.addEventListener('click', sendChat);
  document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });

  // Chat Drawer slide toggle bind
  const chatToggleBtn = document.getElementById('btn-chat-toggle');
  const chatDrawer = document.getElementById('chat-drawer');
  chatToggleBtn?.addEventListener('click', () => {
    chatDrawer?.classList.toggle('active');
    chatToggleBtn?.classList.toggle('active');
    if (chatDrawer?.classList.contains('active')) {
      chatToggleBtn.innerHTML = '▶';
    } else {
      chatToggleBtn.innerHTML = '◀';
    }
  });

  renderChatHistory(gameState);
}

function triggerFloatingMoneyAlert(amount: number) {
  const container = document.getElementById('floating-notifier');
  if (!container) return;

  const badge = document.createElement('div');
  badge.className = 'money-badge';
  
  if (amount >= 0) {
    badge.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    badge.innerHTML = `💵 +$${amount}`;
  } else {
    badge.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    badge.innerHTML = `💸 -$${Math.abs(amount)}`;
  }

  container.appendChild(badge);

  setTimeout(() => {
    badge.remove();
  }, 2000);
}

// Initial matchmaking render
renderMatchmaking();
