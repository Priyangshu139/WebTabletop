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

const REST_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

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
  const color = (document.getElementById('avatar-color') as HTMLInputElement).value;
  const skin = (document.getElementById('avatar-skin') as HTMLSelectElement).value;
  localStorage.setItem('webtabletop_avatar', JSON.stringify({ emojiFace: emoji, color, skinTone: skin }));
}

function renderMatchmaking() {
  if (!app) return;
  isReplayMode = false;
  
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
    <div class="sandbox-panel" style="grid-column: span 2; max-width: 600px; margin: 0 auto; width: 100%;">
      <div class="title-header">
        <h1>WebTabletop Multiplayer Lobby</h1>
        <p style="color: var(--text-muted); margin: 0;">Lobby matchmaking, WebRTC P2P setup, and Replay Sandbox.</p>
      </div>

      <div style="display: flex; flex-direction: column; gap: 16px; margin-top: 10px;">
        
        <!-- Avatar Customizer Section -->
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
          <h3 style="margin-top: 0;">Configure Your Pawn Avatar</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 12px; color: var(--text-muted);">Emoji Head:</label>
              <select id="avatar-emoji" style="background: #1e293b; color: white; padding: 8px; border-radius: 6px; border: 1px solid var(--panel-border);">
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
              <select id="avatar-skin" style="background: #1e293b; color: white; padding: 8px; border-radius: 6px; border: 1px solid var(--panel-border);">
                <option value="light" ${traits.skinTone === 'light' ? 'selected' : ''}>Light</option>
                <option value="medium" ${traits.skinTone === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="dark" ${traits.skinTone === 'dark' ? 'selected' : ''}>Dark</option>
              </select>
            </div>
          </div>
          <div style="display: flex; gap: 10px; align-items: center;">
            <label style="font-size: 12px; color: var(--text-muted);">Pawn Base Color:</label>
            <input type="color" id="avatar-color" value="${traits.color}" style="background: transparent; border: none; width: 50px; height: 32px; cursor: pointer;">
          </div>
        </div>

        <!-- Downloadable game module selection (Monopoly Lite / Ludo Go / Uno Lite) -->
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 6px;">
          <h3 style="margin-top: 0;">Select Game Module</h3>
          <label style="font-size: 12px; color: var(--text-muted);">Configure active tabletop module rules:</label>
          <select id="lobby-game-module" style="background: #1e293b; color: white; padding: 10px; border-radius: 8px; border: 1px solid var(--panel-border); font-size: 14px; font-weight: bold; width: 100%;">
            <option value="ludo-go-classic">Ludo Go Classic (Modifiers Board)</option>
            <option value="monopoly-go">Monopoly Go Lite (Properties Board)</option>
            <option value="uno-go">Uno Go Lite (Color Match Card Game)</option>
          </select>
        </div>

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

  document.getElementById('avatar-emoji')?.addEventListener('change', saveAvatarTraits);
  document.getElementById('avatar-color')?.addEventListener('change', saveAvatarTraits);
  document.getElementById('avatar-skin')?.addEventListener('change', saveAvatarTraits);

  document.getElementById('btn-create-lobby')?.addEventListener('click', async () => {
    showError('');
    const userTraits = getSavedAvatar();
    const gameModule = (document.getElementById('lobby-game-module') as HTMLSelectElement).value as any;

    try {
      const res = await fetch(`${REST_URL}/api/lobby/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traits: userTraits })
      });
      const data = await res.json();
      initializeSync(data.lobbyId, data.playerId, data.secretHash, true, undefined, userTraits, gameModule);
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
    try {
      const res = await fetch(`${REST_URL}/api/lobby/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lobbyId, traits: userTraits })
      });
      if (!res.ok) {
        showError(await res.text());
        return;
      }
      const data = await res.json();

      // Retrieve state backup
      const stateRes = await fetch(`${REST_URL}/api/lobby/${lobbyId}/state`);
      const stateData = await stateRes.json();

      initializeSync(lobbyId, data.playerId, data.secretHash, false, stateData.state, userTraits);
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

function appendChatMessage(chat: any) {
  const feed = document.getElementById('chat-messages');
  if (feed) {
    const item = document.createElement('div');
    item.style.marginBottom = '6px';
    item.innerHTML = `
      <span style="background-color: ${chat.senderColor}; border-radius: 50%; padding: 2px; border: 1px solid rgba(255,255,255,0.2); width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; margin-right: 6px;">${chat.senderEmoji}</span>
      <strong style="color: white; margin-right: 4px;">Player ${chat.senderId === 'P1' ? '1' : chat.senderId}:</strong>
      <span style="color: #e2e8f0;">${chat.text}</span>
    `;
    feed.appendChild(item);
    feed.scrollTop = feed.scrollHeight;
  }
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

async function initializeSync(
  lobbyId: string,
  playerId: string,
  secretHash: string,
  isHost: boolean,
  savedState?: EngineState,
  traits?: any,
  gameModule?: 'ludo-go-classic' | 'monopoly-go' | 'uno-go'
) {
  activeSeatId = playerId;
  isReplayMode = false;

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
    players: {
      'P1': {
        id: 'P1',
        color: isHost ? playerTraits.color : '#ef4444',
        skinTone: isHost ? playerTraits.skinTone : 'light',
        emojiFace: isHost ? playerTraits.emojiFace : '🦊',
        isHost: true,
        money: activeGame === 'monopoly-go' ? 1500 : undefined,
        hand: activeGame === 'uno-go' ? [] : undefined
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

  // Add ourselves to players table dynamically if not present
  if (!initialState.players[playerId]) {
    initialState.players[playerId] = {
      id: playerId,
      color: playerTraits.color,
      skinTone: playerTraits.skinTone,
      emojiFace: playerTraits.emojiFace,
      isHost: isHost,
      money: activeGame === 'monopoly-go' ? 1500 : undefined,
      hand: activeGame === 'uno-go' ? [] : undefined
    };
    initialState.moduleState.playerPositions[playerId] = 0;
  }

  // Setup main layout for game session (incorporates 3D canvas viewport)
  if (app) {
    app.innerHTML = `
      <div class="sandbox-panel">
        <div class="title-header">
          <h1>Lobby Code: <span style="color: #a855f7;">${lobbyId}</span></h1>
          <p style="color: var(--text-muted); margin: 0;">Connected seat: <strong style="color: white;">${playerId}</strong> (${isHost ? 'AUTHORITATIVE HOST' : 'PEER'})</p>
        </div>

        <div id="discord-active-banner" style="display: none;"></div>

        <div style="background: rgba(255,255,255,0.02); border-radius: 8px; padding: 12px; font-size: 11px; font-family: monospace;">
          <strong>RECONNECT KEY:</strong> Copy the below payload to restore session:<br>
          <code style="color: #f43f5e; word-break: break-all;">Lobby: ${lobbyId} | Player: ${playerId} | Hash: ${secretHash}</code>
        </div>

        <div id="migration-banner" style="background: rgba(234,179,8,0.1); border: 1px solid rgba(234,179,8,0.3); padding: 10px; border-radius: 8px; display: none; color: #facc15; font-weight: bold; font-size: 13px;">
          ⚠️ Authoritative Host Disconnected. Migrating hosting authority to next peer...
        </div>

        <!-- 3D Viewport Zoom Surface -->
        <div>
          <h3 style="text-transform: capitalize;">3D Tabletop Viewport: ${activeGame.replace('-', ' ')}</h3>
          <p style="font-size: 11px; color: var(--text-muted); margin: 0 0 6px 0;">Drag screen to rotate table. Scroll to zoom camera angle.</p>
          
          <div id="camera-viewport" style="width: 100%; max-width: 360px; height: 360px; margin: 10px auto; border: 1px solid var(--panel-border); border-radius: 12px; overflow: hidden; background: #0f172a; position: relative;">
            <div id="three-canvas-container" style="width: 100%; height: 100%;"></div>
          </div>
        </div>

        <div>
          <h3>Lobby Active Seats</h3>
          <div id="player-list"></div>
        </div>

        <!-- P2P Lobby Chat -->
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 12px; padding: 12px;">
          <h3 style="margin-top: 0;">Lobby P2P Chat</h3>
          <div id="chat-messages" style="height: 130px; overflow-y: auto; background: rgba(0,0,0,0.15); border-radius: 8px; padding: 8px; border: 1px solid var(--panel-border); font-size: 13px; margin-bottom: 8px;"></div>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="chat-input" placeholder="Type a message..." style="flex-grow: 1; background: #1e293b; color: white; border: 1px solid var(--panel-border); padding: 8px; border-radius: 6px; font-size: 13px;">
            <button class="action-btn" id="btn-send-chat" style="padding: 8px 14px; font-size: 13px; margin-right: 0;">Send</button>
          </div>
        </div>

        <!-- Discord Pin Box (Host Only) -->
        ${isHost ? `
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 12px; padding: 12px;">
          <h3 style="margin-top: 0;">Discord Voice Pin (Host Only)</h3>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="discord-input" placeholder="https://discord.gg/..." style="flex-grow: 1; background: #1e293b; color: white; border: 1px solid var(--panel-border); padding: 8px; border-radius: 6px; font-size: 12px;">
            <button class="action-btn" id="btn-pin-discord" style="padding: 8px 14px; font-size: 12px; margin-right: 0; background: #5865f2;">Pin Link</button>
          </div>
        </div>
        ` : ''}

        <!-- Monopoly property owned ledger -->
        ${activeGame === 'monopoly-go' ? `
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 12px; padding: 12px;">
          <h3 style="margin-top:0;">Purchased Properties</h3>
          <div id="monopoly-ledger" style="font-size: 12px; display: flex; flex-direction: column; gap: 4px;">No properties owned yet.</div>
        </div>
        ` : ''}

        <div>
          <h3>Gameplay Actions</h3>
          
          <!-- Flick physics throwing pad (Only for Ludo & Monopoly) -->
          <div id="physics-dice-surface" style="background: rgba(255,255,255,0.01); border: 1px solid var(--panel-border); border-radius: 12px; padding: 12px; margin-bottom: 12px; text-align: center; ${activeGame === 'uno-go' ? 'display: none;' : ''}">
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 0;">Drag and FLICK the dice to roll!</p>
            <div class="dice-3d-surface">
              <div id="physical-dice" class="dice-3d">🎲</div>
            </div>
          </div>

          <!-- Card Hand GUI panel (Only for Uno) -->
          <div id="uno-hand-gui" style="background: rgba(255,255,255,0.01); border: 1px solid var(--panel-border); border-radius: 12px; padding: 12px; margin-bottom: 12px; ${activeGame !== 'uno-go' ? 'display: none;' : ''}">
            <p style="font-size: 12px; color: var(--text-muted); margin: 0 0 8px 0; font-weight: bold;">Your Hand (Play matching card color/value):</p>
            <div id="my-cards-container" style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px;"></div>
          </div>

          <div id="actions-panel">
            <button class="action-btn" id="btn-move" disabled style="width: 100%; margin-bottom: 8px; ${activeGame === 'uno-go' ? 'display: none;' : ''}">Move Piece</button>
            <button class="action-btn" id="btn-resolve" disabled style="width: 100%; margin-bottom: 8px; ${activeGame === 'uno-go' ? 'display: none;' : ''}">Resolve Tile Space</button>
            
            <!-- Monopoly Specific HUD Buttons -->
            <button class="action-btn" id="btn-buy-property" disabled style="width: 100%; margin-bottom: 8px; background-color: #10b981; ${activeGame !== 'monopoly-go' ? 'display: none;' : ''}">Buy Property</button>
            
            <!-- Uno Specific HUD Buttons -->
            <button class="action-btn" id="btn-draw-card" disabled style="width: 100%; margin-bottom: 8px; background-color: #f59e0b; ${activeGame !== 'uno-go' ? 'display: none;' : ''}">Draw Card from Deck</button>

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

    // Instantiate Three.js renderer inside the canvas container
    const container = document.getElementById('three-canvas-container') as HTMLDivElement;
    if (container) {
      threeRenderer = new ThreeRenderer(container, playerId);
    }

    // Bind physical dice throw listeners
    if (activeGame !== 'uno-go') {
      bindPhysicsDice();
    }

    // Bind Chat send listeners
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

    // Bind Discord Pin listener
    if (isHost) {
      document.getElementById('btn-pin-discord')?.addEventListener('click', () => {
        const link = (document.getElementById('discord-input') as HTMLInputElement).value.trim();
        if (link) {
          syncEngine?.dispatch('PIN_DISCORD', { link });
        }
      });
    }

    // Bind Monopoly Buy Property
    if (activeGame === 'monopoly-go') {
      document.getElementById('btn-buy-property')?.addEventListener('click', () => {
        syncEngine?.dispatch('BUY_PROPERTY');
      });
    }

    // Bind Uno Draw Card
    if (activeGame === 'uno-go') {
      document.getElementById('btn-draw-card')?.addEventListener('click', () => {
        syncEngine?.dispatch('DRAW_CARD');
      });
    }

    // Bind normal actions
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
        moduleId: activeGame,
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
      if (threeRenderer) {
        threeRenderer.destroy();
        threeRenderer = null;
      }
      renderMatchmaking();
    });
  }

  // Create and start SyncEngine with chat callback
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
  const activeGame = gameState.activeModule || 'ludo-go-classic';

  // 1. Notify 3D WebGL renderer to update meshes dynamically
  if (threeRenderer) {
    threeRenderer.updateState(gameState);
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

    if (dice) {
      dice.innerText = gameState.moduleState.lastDiceValue ? String(gameState.moduleState.lastDiceValue) : '🎲';
      if (isMyTurn && isRollPhase && activeGame !== 'uno-go') {
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

// Initial matchmaking render
renderMatchmaking();
