import { EngineState, EngineCommand } from '../engine/types';
import { PRNG } from '../engine/prng';
import { validateCommand } from '../engine/rules';
import { applyEvent } from '../engine/reducer';

// 1. Initial State Setup
let state: EngineState = {
  seed: 'tabletop-init-seed-' + Math.random().toString(36).substring(7),
  prngState: 0,
  players: {
    'P1': { id: 'P1', color: '#ef4444', skinTone: 'light', emojiFace: '🦊', isHost: true },
    'P2': { id: 'P2', color: '#3b82f6', skinTone: 'medium', emojiFace: '🐼', isHost: false }
  },
  turn: {
    currentPlayerId: 'P1',
    phase: 'StartTurn'
  },
  eventLog: [],
  moduleState: {
    lastDiceValue: 0,
    playerPositions: { 'P1': 0, 'P2': 0 }
  }
};

let activeSeatId = 'P1';

// 2. DOM Rendering
const app = document.getElementById('app');
if (app) {
  app.innerHTML = `
    <div class="sandbox-panel">
      <div class="title-header">
        <h1>Tabletop Sandbox</h1>
        <p style="color: var(--text-muted); margin: 0;">Interactive local seat testing loop for Phase 1 Engine.</p>
      </div>

      <div style="display: flex; gap: 24px; align-items: center;">
        <div>
          <label style="font-weight: 600; font-size: 14px; color: var(--text-muted);">SELECT ACTIVE SEAT (simulate local player):</label>
          <select id="seat-select" style="background: #1e293b; color: white; border: 1px solid var(--panel-border); padding: 8px; border-radius: 6px; margin-left: 10px;">
            <option value="P1" selected>Player 1 (Fox 🦊)</option>
            <option value="P2">Player 2 (Panda 🐼)</option>
          </select>
        </div>
      </div>

      <div>
        <h3>Players & Turn Info</h3>
        <div id="player-list"></div>
      </div>

      <div>
        <h3>Actions</h3>
        <div id="actions-panel">
          <button class="action-btn" id="btn-roll" disabled>Roll Dice</button>
          <button class="action-btn" id="btn-move" disabled>Move (Simulate Tile Steps)</button>
          <button class="action-btn" id="btn-end" disabled>End Turn</button>
        </div>
        <div class="error-toast" id="error-box"></div>
      </div>

      <div>
        <h3>Game Event Log</h3>
        <div class="event-feed" id="event-feed"></div>
      </div>
    </div>

    <div class="sandbox-panel">
      <h3>Engine State Inspector</h3>
      <div class="state-inspector" id="state-inspector"></div>
    </div>
  `;

  // 3. UI Update Engine
  function updateUI() {
    // Update Players
    const playerList = document.getElementById('player-list');
    if (playerList) {
      playerList.innerHTML = Object.values(state.players).map(p => {
        const isActive = state.turn.currentPlayerId === p.id;
        const isSeat = activeSeatId === p.id;
        return `
          <div class="player-slot ${isActive ? 'active' : ''}">
            <div class="pawn-avatar" style="background-color: ${p.color};">${p.emojiFace}</div>
            <div style="flex-grow: 1;">
              <strong>Player ${p.id === 'P1' ? '1' : '2'} (${p.id})</strong>
              <span style="font-size: 12px; color: var(--text-muted); margin-left: 10px;">Position: Tile ${state.moduleState.playerPositions[p.id] || 0}</span>
              ${isSeat ? '<span style="font-size: 11px; background: rgba(255,255,255,0.1); border-radius: 4px; padding: 2px 6px; margin-left: 10px;">YOU</span>' : ''}
            </div>
            <div>${isActive ? `<span style="color: #6366f1; font-weight: 700;">Active Turn (${state.turn.phase})</span>` : 'Waiting'}</div>
          </div>
        `;
      }).join('');
    }

    // Update Button States
    const rollBtn = document.getElementById('btn-roll') as HTMLButtonElement;
    const moveBtn = document.getElementById('btn-move') as HTMLButtonElement;
    const endBtn = document.getElementById('btn-end') as HTMLButtonElement;

    const isMyTurn = state.turn.currentPlayerId === activeSeatId;

    if (rollBtn && moveBtn && endBtn) {
      rollBtn.disabled = !isMyTurn || (state.turn.phase !== 'Roll' && state.turn.phase !== 'StartTurn');
      moveBtn.disabled = !isMyTurn || state.turn.phase !== 'Move';
      endBtn.disabled = !isMyTurn || state.turn.phase !== 'EndTurn';
    }

    // Render Event Feed
    const feed = document.getElementById('event-feed');
    if (feed) {
      feed.innerHTML = state.eventLog.map(e => {
        let text = `[Event: ${e.type}]`;
        if (e.type === 'DICE_ROLLED') text = `🎲 Player ${e.playerId} rolled a ${e.payload.value}`;
        if (e.type === 'PIECE_MOVED') text = `🏃 Player ${e.playerId} moved forward ${e.payload.spaces} steps`;
        if (e.type === 'PHASE_CHANGED') text = `⚙️ Turn Phase transitioned to: ${e.payload.phase}`;
        if (e.type === 'TURN_ENDED') text = `🏁 Player ${e.playerId} ended their turn`;
        return `<div class="event-item">${text}</div>`;
      }).join('');
      feed.scrollTop = feed.scrollHeight;
    }

    // Renders inspector
    const inspector = document.getElementById('state-inspector');
    if (inspector) {
      inspector.innerText = JSON.stringify(state, null, 2);
    }
  }

  // 4. Command Dispatch Loop
  function dispatchCommand(cmd: EngineCommand) {
    const errorBox = document.getElementById('error-box');
    if (errorBox) errorBox.style.display = 'none';

    try {
      // Instantiate deterministic PRNG configured to the state offset index
      const prng = new PRNG(state.seed, state.prngState);

      // Run validation
      const events = validateCommand(state, cmd, prng);

      // Apply events sequentially
      events.forEach(evt => {
        state = applyEvent(state, evt);
      });

      updateUI();
    } catch (err: any) {
      if (errorBox) {
        errorBox.innerText = `Validation Error: ${err.message}`;
        errorBox.style.display = 'block';
      }
    }
  }

  // 5. Event Listeners
  document.getElementById('seat-select')?.addEventListener('change', (e) => {
    activeSeatId = (e.target as HTMLSelectElement).value;
    updateUI();
  });

  document.getElementById('btn-roll')?.addEventListener('click', () => {
    dispatchCommand({ type: 'ROLL_DICE', playerId: activeSeatId });
  });

  document.getElementById('btn-move')?.addEventListener('click', () => {
    // Simulate random dice result or move 4 steps
    const spacesToMove = state.moduleState.lastDiceValue || 4;
    dispatchCommand({
      type: 'MOVE_PIECE',
      playerId: activeSeatId,
      payload: { spaces: spacesToMove }
    });
  });

  document.getElementById('btn-end')?.addEventListener('click', () => {
    dispatchCommand({ type: 'END_TURN', playerId: activeSeatId });
  });

  // Run first render
  updateUI();
}
