# Core Engine & Local Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic, event-sourced core simulation engine and local testing sandbox in Docker.

**Architecture:** Event-Sourced Reducer Pattern. Commands generate Events via the Rule Engine validation, which mutate state via the State Reducer. Visuals listen and follow state changes.

**Tech Stack:** TypeScript, Vite, Vitest, Docker Compose, seedrandom, Vanilla CSS.

## Global Constraints
- Platforms: Android PWA (primary), Tauri Desktop (secondary).
- State-Driven UI: UI strictly reacts to engine state events. Animations never drive state.
- No database or gameplay simulation on the backend.

---

### Task 1: Environment & Project Scaffolding

**Files:**
- Create: `docker-compose.yml`
- Create: `client/Dockerfile.dev`
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`
- Create: `client/src/main.ts`
- Create: `backend/Dockerfile.dev`
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/src/server.ts`

**Interfaces:**
- Consumes: None (starting workspace)
- Produces: Live hot-reloading Docker container running Vite at `http://localhost:5173` and Express at `http://localhost:3000`.

- [ ] **Step 1: Initialize Git repository**
  Run:
  ```bash
  git init
  ```

- [ ] **Step 2: Create client configuration files**
  Create `client/package.json`:
  ```json
  {
    "name": "webtabletop-client",
    "private": true,
    "version": "1.0.0",
    "type": "module",
    "scripts": {
      "dev": "vite",
      "build": "tsc && vite build",
      "preview": "vite preview",
      "test": "vitest run"
    },
    "dependencies": {
      "seedrandom": "^3.0.5"
    },
    "devDependencies": {
      "@types/node": "^20.11.0",
      "@types/seedrandom": "^3.0.8",
      "typescript": "^5.3.3",
      "vite": "^5.0.10",
      "vitest": "^1.1.0"
    }
  }
  ```

  Create `client/tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "useDefineForClassFields": true,
      "module": "ESNext",
      "lib": ["ES2022", "DOM", "DOM.Iterable"],
      "moduleResolution": "bundler",
      "skipLibCheck": true,
      "resolveJsonModule": true,
      "isolatedModules": true,
      "noEmit": true,
      "strict": true,
      "noUnusedLocals": true,
      "noUnusedParameters": true,
      "noImplicitReturns": true
    },
    "include": ["src"]
  }
  ```

  Create `client/vite.config.ts`:
  ```typescript
  import { defineConfig } from 'vite';

  export default defineConfig({
    server: {
      host: true,
      port: 5173,
      watch: {
        usePolling: true
      }
    }
  });
  ```

  Create `client/index.html`:
  ```html
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Tabletop Sandbox</title>
      <link rel="stylesheet" href="/src/sandbox/style.css" />
    </head>
    <body>
      <div id="app"></div>
      <script type="module" src="/src/main.ts"></script>
    </body>
  </html>
  ```

  Create `client/src/main.ts`:
  ```typescript
  import './sandbox/main';
  ```

  Create `client/Dockerfile.dev`:
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm install
  COPY . .
  EXPOSE 5173
  CMD ["npm", "run", "dev"]
  ```

- [ ] **Step 3: Create backend configuration files**
  Create `backend/package.json`:
  ```json
  {
    "name": "webtabletop-backend",
    "private": true,
    "version": "1.0.0",
    "type": "module",
    "scripts": {
      "dev": "node --loader ts-node/esm src/server.ts",
      "build": "tsc"
    },
    "dependencies": {
      "express": "^4.18.2"
    },
    "devDependencies": {
      "@types/express": "^4.17.21",
      "@types/node": "^20.11.0",
      "ts-node": "^10.9.2",
      "typescript": "^5.3.3"
    }
  }
  ```

  Create `backend/tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "strict": true,
      "skipLibCheck": true,
      "outDir": "./dist"
    },
    "include": ["src"]
  }
  ```

  Create `backend/src/server.ts`:
  ```typescript
  import express from 'express';

  const app = express();
  const port = process.env.PORT || 3000;

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'lobby-server' });
  });

  app.listen(port, () => {
    console.log(`Backend server running on port ${port}`);
  });
  ```

  Create `backend/Dockerfile.dev`:
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm install
  COPY . .
  EXPOSE 3000
  CMD ["npm", "run", "dev"]
  ```

- [ ] **Step 4: Create root docker-compose.yml**
  Create `docker-compose.yml`:
  ```yaml
  version: '3.8'

  services:
    client:
      build:
        context: ./client
        dockerfile: Dockerfile.dev
      ports:
        - "5173:5173"
      volumes:
        - ./client:/app
        - /app/node_modules
      environment:
        - CHOKIDAR_USEPOLLING=true

    backend:
      build:
        context: ./backend
        dockerfile: Dockerfile.dev
      ports:
        - "3000:3000"
      volumes:
        - ./backend:/app
        - /app/node_modules
  ```

- [ ] **Step 5: Verify environment builds & run initial commit**
  Propose command to build containers:
  `docker compose build`
  Expected: Builds without errors.

  Add and commit:
  ```bash
  git add .
  git commit -m "chore: setup docker-compose scaffolding for client and backend"
  ```

---

### Task 2: Core Engine Types & Deterministic PRNG

**Files:**
- Create: `client/src/engine/types.ts`
- Create: `client/src/engine/prng.ts`
- Test: `client/src/engine/prng.test.ts`

**Interfaces:**
- Consumes: Scaffolding from Task 1.
- Produces:
  * `EngineState`, `Player`, `EngineCommand`, `EngineEvent` types.
  * `PRNG` class with a seedable state.

- [ ] **Step 1: Write a failing unit test for seedable PRNG**
  Create `client/src/engine/prng.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { PRNG } from './prng';

  describe('Deterministic PRNG', () => {
    it('generates the same sequences given the same seed', () => {
      const prng1 = new PRNG('test-seed');
      const prng2 = new PRNG('test-seed');

      const values1 = [prng1.next(), prng1.next(), prng1.next()];
      const values2 = [prng2.next(), prng2.next(), prng2.next()];

      expect(values1).toEqual(values2);
    });

    it('generates different sequences for different seeds', () => {
      const prng1 = new PRNG('seed-a');
      const prng2 = new PRNG('seed-b');

      const values1 = [prng1.next(), prng1.next(), prng1.next()];
      const values2 = [prng2.next(), prng2.next(), prng2.next()];

      expect(values1).not.toEqual(values2);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Propose command:
  `docker compose run --rm client npm run test`
  Expected: FAIL with "Cannot find module './prng'"

- [ ] **Step 3: Write types and PRNG implementation**
  Create `client/src/engine/types.ts`:
  ```typescript
  export interface Player {
    id: string;
    color: string;
    skinTone: string;
    emojiFace: string;
    isHost: boolean;
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
    moduleState: {
      lastDiceValue: number;
      playerPositions: Record<string, number>;
    };
  }

  export interface EngineCommand {
    type: 'ROLL_DICE' | 'MOVE_PIECE' | 'END_TURN';
    playerId: string;
    payload?: any;
  }

  export interface EngineEvent {
    type: 'DICE_ROLLED' | 'PIECE_MOVED' | 'PHASE_CHANGED' | 'TURN_ENDED';
    playerId?: string;
    payload?: any;
    timestamp: number;
  }
  ```

  Create `client/src/engine/prng.ts` using the SplitMix32 algorithm via `seedrandom`:
  ```typescript
  import seedrandom from 'seedrandom';

  export class PRNG {
    private rng: seedrandom.PRNG;

    constructor(seed: string, stateOffset: number = 0) {
      // Initialize with seed
      this.rng = seedrandom(seed);
      // Advance by stateOffset to support deterministic re-entry
      for (let i = 0; i < stateOffset; i++) {
        this.rng();
      }
    }

    public next(): number {
      return this.rng();
    }
  }
  ```

- [ ] **Step 4: Run test to verify it passes**
  Propose command:
  `docker compose run --rm client npm run test`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add client/src/engine/types.ts client/src/engine/prng.ts client/src/engine/prng.test.ts
  git commit -m "feat: add engine types and deterministic PRNG"
  ```

---

### Task 3: Pure State Reducer

**Files:**
- Create: `client/src/engine/reducer.ts`
- Test: `client/src/engine/reducer.test.ts`

**Interfaces:**
- Consumes: Core types defined in `client/src/engine/types.ts`.
- Produces: `applyEvent(state: EngineState, event: EngineEvent): EngineState`.

- [ ] **Step 1: Write a failing unit test for reducer event application**
  Create `client/src/engine/reducer.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { applyEvent } from './reducer';
  import { EngineState, EngineEvent } from './types';

  const initialTestState: EngineState = {
    seed: 'test-seed',
    prngState: 0,
    players: {
      'P1': { id: 'P1', color: 'Red', skinTone: 'light', emojiFace: '😀', isHost: true },
      'P2': { id: 'P2', color: 'Blue', skinTone: 'medium', emojiFace: '😎', isHost: false }
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

  describe('Pure State Reducer', () => {
    it('updates lastDiceValue on DICE_ROLLED event', () => {
      const event: EngineEvent = {
        type: 'DICE_ROLLED',
        playerId: 'P1',
        payload: { value: 5 },
        timestamp: 1000
      };
      const resultState = applyEvent(initialTestState, event);

      expect(resultState.moduleState.lastDiceValue).toBe(5);
      expect(resultState.eventLog.length).toBe(1);
      expect(resultState).not.toBe(initialTestState); // Purity check
    });

    it('updates position and rotates turns on events', () => {
      const moveEvent: EngineEvent = {
        type: 'PIECE_MOVED',
        playerId: 'P1',
        payload: { spaces: 4 },
        timestamp: 1001
      };
      const resultState = applyEvent(initialTestState, moveEvent);
      expect(resultState.moduleState.playerPositions['P1']).toBe(4);

      const turnEndEvent: EngineEvent = {
        type: 'TURN_ENDED',
        playerId: 'P1',
        timestamp: 1002
      };
      const nextTurnState = applyEvent(resultState, turnEndEvent);
      expect(nextTurnState.turn.currentPlayerId).toBe('P2');
      expect(nextTurnState.turn.phase).toBe('StartTurn');
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Propose command:
  `docker compose run --rm client npm run test`
  Expected: FAIL with "Cannot find module './reducer'"

- [ ] **Step 3: Implement Pure State Reducer**
  Create `client/src/engine/reducer.ts`:
  ```typescript
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

      case 'TURN_ENDED':
        const playerIds = Object.keys(nextState.players);
        const currentIndex = playerIds.indexOf(nextState.turn.currentPlayerId);
        const nextIndex = (currentIndex + 1) % playerIds.length;
        nextState.turn.currentPlayerId = playerIds[nextIndex];
        nextState.turn.phase = 'StartTurn';
        break;
    }

    return nextState;
  }
  ```

- [ ] **Step 4: Run test to verify it passes**
  Propose command:
  `docker compose run --rm client npm run test`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add client/src/engine/reducer.ts client/src/engine/reducer.test.ts
  git commit -m "feat: add pure reducer for engine events"
  ```

---

### Task 4: Rule Validation Engine

**Files:**
- Create: `client/src/engine/rules.ts`
- Test: `client/src/engine/rules.test.ts`

**Interfaces:**
- Consumes: `EngineState`, `EngineCommand`, `EngineEvent` from `types.ts`, and `PRNG` from `prng.ts`.
- Produces: `validateCommand(state: EngineState, command: EngineCommand, prng: PRNG): EngineEvent[]`.

- [ ] **Step 1: Write a failing unit test for command validation**
  Create `client/src/engine/rules.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { validateCommand } from './rules';
  import { EngineState, EngineCommand } from './types';
  import { PRNG } from './prng';

  const initialTestState: EngineState = {
    seed: 'test-seed',
    prngState: 0,
    players: {
      'P1': { id: 'P1', color: 'Red', skinTone: 'light', emojiFace: '😀', isHost: true },
      'P2': { id: 'P2', color: 'Blue', skinTone: 'medium', emojiFace: '😎', isHost: false }
    },
    turn: {
      currentPlayerId: 'P1',
      phase: 'Roll'
    },
    eventLog: [],
    moduleState: {
      lastDiceValue: 0,
      playerPositions: { 'P1': 0, 'P2': 0 }
    }
  };

  describe('Rule Validation Engine', () => {
    it('throws error if it is not the players turn', () => {
      const command: EngineCommand = { type: 'ROLL_DICE', playerId: 'P2' };
      const prng = new PRNG(initialTestState.seed, initialTestState.prngState);

      expect(() => validateCommand(initialTestState, command, prng)).toThrow('Not your turn.');
    });

    it('generates DICE_ROLLED and PHASE_CHANGED events on valid ROLL_DICE', () => {
      const command: EngineCommand = { type: 'ROLL_DICE', playerId: 'P1' };
      const prng = new PRNG(initialTestState.seed, initialTestState.prngState);
      const events = validateCommand(initialTestState, command, prng);

      expect(events.length).toBe(2);
      expect(events[0].type).toBe('DICE_ROLLED');
      expect(events[0].playerId).toBe('P1');
      expect(events[0].payload.value).toBeGreaterThanOrEqual(1);
      expect(events[0].payload.value).toBeLessThanOrEqual(6);
      expect(events[1].type).toBe('PHASE_CHANGED');
      expect(events[1].payload.phase).toBe('Move');
    });

    it('throws error if player tries to move in Roll phase', () => {
      const command: EngineCommand = { type: 'MOVE_PIECE', playerId: 'P1', payload: { spaces: 3 } };
      const prng = new PRNG(initialTestState.seed, initialTestState.prngState);

      expect(() => validateCommand(initialTestState, command, prng)).toThrow('You cannot move at this phase.');
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Propose command:
  `docker compose run --rm client npm run test`
  Expected: FAIL with "Cannot find module './rules'"

- [ ] **Step 3: Implement Rule Validation Engine**
  Create `client/src/engine/rules.ts`:
  ```typescript
  import { EngineState, EngineCommand, EngineEvent } from './types';
  import { PRNG } from './prng';

  export function validateCommand(
    state: EngineState,
    command: EngineCommand,
    prng: PRNG
  ): EngineEvent[] {
    // 1. Turn enforcement
    if (state.turn.currentPlayerId !== command.playerId) {
      throw new Error('Not your turn.');
    }

    const events: EngineEvent[] = [];

    switch (command.type) {
      case 'ROLL_DICE': {
        if (state.turn.phase !== 'Roll' && state.turn.phase !== 'StartTurn') {
          throw new Error('You cannot roll at this phase.');
        }
        // Roll dice (1-6) using seedable PRNG
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

      default:
        throw new Error(`Unknown command: ${(command as any).type}`);
    }

    return events;
  }
  ```

- [ ] **Step 4: Run test to verify it passes**
  Propose command:
  `docker compose run --rm client npm run test`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add client/src/engine/rules.ts client/src/engine/rules.test.ts
  git commit -m "feat: add engine rules validation engine"
  ```

---

### Task 5: Local Sandbox Frontend UI

**Files:**
- Create: `client/src/sandbox/style.css`
- Create: `client/src/sandbox/main.ts`

**Interfaces:**
- Consumes: Complete game engine files from Tasks 2-4.
- Produces: Fully interactive sandbox visual UI loading in a PWA structure.

- [ ] **Step 1: Write Sandbox Style Sheet (Glassmorphism layout)**
  Create `client/src/sandbox/style.css`:
  ```css
  :root {
    --bg-gradient: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
    --panel-bg: rgba(30, 41, 59, 0.45);
    --panel-border: rgba(255, 255, 255, 0.08);
    --text-primary: #f8fafc;
    --text-muted: #94a3b8;
    --accent: #6366f1;
    --accent-hover: #4f46e5;
    --danger: #ef4444;
  }

  body {
    margin: 0;
    font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg-gradient);
    color: var(--text-primary);
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  #app {
    width: 100%;
    max-width: 1200px;
    padding: 24px;
    display: grid;
    grid-template-columns: 1fr 350px;
    gap: 24px;
  }

  .sandbox-panel {
    background: var(--panel-bg);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--panel-border);
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  }

  .title-header h1 {
    margin: 0 0 8px 0;
    font-size: 28px;
    font-weight: 700;
    background: linear-gradient(to right, #818cf8, #c084fc);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .player-slot {
    display: flex;
    align-items: center;
    padding: 12px;
    margin: 8px 0;
    border-radius: 12px;
    border: 1px solid transparent;
    transition: all 0.2s ease;
  }

  .player-slot.active {
    background: rgba(99, 102, 241, 0.15);
    border-color: rgba(99, 102, 241, 0.3);
  }

  .pawn-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    margin-right: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
  }

  .action-btn {
    background: var(--accent);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-right: 8px;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--accent-hover);
    transform: translateY(-2px);
  }

  .action-btn:disabled {
    background: #334155;
    color: var(--text-muted);
    cursor: not-allowed;
  }

  .event-feed {
    height: 200px;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 12px;
    font-family: monospace;
    font-size: 13px;
    border: 1px solid var(--panel-border);
  }

  .event-item {
    margin-bottom: 6px;
    border-bottom: 1px solid rgba(255,255,255,0.02);
    padding-bottom: 4px;
  }

  .state-inspector {
    font-family: monospace;
    font-size: 11px;
    background: rgba(0, 0, 0, 0.3);
    padding: 12px;
    border-radius: 8px;
    height: 400px;
    overflow-y: auto;
    white-space: pre-wrap;
    border: 1px solid var(--panel-border);
  }

  .error-toast {
    color: var(--danger);
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    padding: 12px;
    border-radius: 8px;
    margin-top: 12px;
    display: none;
  }
  ```

- [ ] **Step 2: Create Sandbox UI Controller**
  Create `client/src/sandbox/main.ts`:
  ```typescript
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
      <div class="sandbox-panel" style="display: flex; flex-direction: column; gap: 20px;">
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

      <div class="sandbox-panel" style="display: flex; flex-direction: column; gap: 10px;">
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
  ```

- [ ] **Step 3: Test docker deployment locally**
  Propose command:
  `docker compose up -d`
  Expected: Containers build, start, and host client at `http://localhost:5173`. Verify local dev sandbox in browser.

- [ ] **Step 4: Commit changes**
  ```bash
  git add client/src/sandbox/style.css client/src/sandbox/main.ts client/index.html client/src/main.ts
  git commit -m "feat: complete tactile glassmorphism sandbox UI layout"
  ```
