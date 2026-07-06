# Core Engine & Local Sandbox Design Document

**Date**: 2026-07-06  
**Status**: Draft (Awaiting User Review)  
**Project**: Tabletop Platform - Phase 1, Sub-project 1  

---

## 1. Goal & Context
The goal of Sub-project 1 is to implement the core runtime environment for the virtual tabletop platform. This consists of:
1. A deterministic, event-sourced game state simulation engine written in pure, framework-agnostic TypeScript.
2. A separate backend and frontend containerized architecture managed by Docker Compose.
3. A local frontend Sandbox UI built using Vite and Vanilla CSS to physically test the engine rules, actions, and events in isolation.

---

## 2. Directory Layout & Docker Orchestration
We organize the project into separate folders for the frontend `client` and backend `backend` services.

```text
/home/priyangshu/WebTabletop
├── docker-compose.yml
├── client/
│   ├── Dockerfile.dev
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── engine/
│       │   ├── prng.ts
│       │   ├── types.ts
│       │   ├── reducer.ts
│       │   └── rules.ts
│       ├── sandbox/
│       │   ├── index.html
│       │   ├── main.ts
│       │   └── style.css
│       └── main.ts
└── backend/
    ├── Dockerfile.dev
    ├── package.json
    ├── tsconfig.json
    └── src/
        └── server.ts
```

### 2.1. Docker Configuration
* **Root `docker-compose.yml`**:
  Defines two services: `client` and `backend`.
  * `client` service builds the client's development Dockerfile, exposes port `5173`, and mounts the local `client/` folder as a volume to support live hot-reloading.
  * `backend` service builds the backend's development Dockerfile, exposes port `3000`, and mounts the local `backend/` folder as a volume.
* **`client/Dockerfile.dev`**:
  * Base image: `node:20-alpine`
  * Runs `npm install` on build.
  * Command: `npm run dev -- --host` (making the server accessible externally).
* **`backend/Dockerfile.dev`**:
  * Base image: `node:20-alpine`
  * Command: `npm run dev` (running the backend signaling server).

---

## 3. Core Engine Architecture

The engine implements a strict state-driven pipeline:
```
Player Action → Command → Rule Engine (validateCommand) → Events[] → State Reducer (applyEvent) → New State & UI Reactivity
```

### 3.1. Engine State and Core Types (`client/src/engine/types.ts`)
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
  prngState: number; // Internal state tracker for deterministic operations
  players: Record<string, Player>;
  turn: {
    currentPlayerId: string;
    phase: 'StartTurn' | 'Roll' | 'Move' | 'ResolveTile' | 'OptionalActions' | 'EndTurn';
  };
  eventLog: EngineEvent[];
  moduleState: Record<string, any>;
}

export interface EngineCommand {
  type: string;
  playerId: string;
  payload?: any;
}

export interface EngineEvent {
  type: string;
  playerId?: string;
  payload?: any;
  timestamp: number;
}
```

### 3.2. Deterministic PRNG (`client/src/engine/prng.ts`)
A seedable pseudorandom number generator (PRNG) is required to ensure dice throws, coin flips, and deck shuffles are identical across clients given the same seed.
* We will implement a seedable PRNG (e.g., LCG or SplitMix32) inside `prng.ts`.
* The generator will be instantiated dynamically during command validation.
* The PRNG internal state tracker is stored in `EngineState.prngState` and incremented deterministically, ensuring that state transitions can be perfectly replayed.

### 3.3. Command Validation & Rule Engine (`client/src/engine/rules.ts`)
The Rule Engine defines the logic of the active game. For Phase 1, it will contain basic tabletop validation rules (e.g., standard turn-taking and rolling logic):
```typescript
import { EngineState, EngineCommand, EngineEvent } from './types';
import { PRNG } from './prng';

export function validateCommand(
  state: EngineState,
  command: EngineCommand,
  prng: PRNG
): EngineEvent[] {
  // 1. Validate active player turn
  if (state.turn.currentPlayerId !== command.playerId) {
    throw new Error('Not your turn.');
  }

  const events: EngineEvent[] = [];

  switch (command.type) {
    case 'ROLL_DICE':
      if (state.turn.phase !== 'Roll') {
        throw new Error('You cannot roll at this phase.');
      }
      const diceResult = Math.floor(prng.next() * 6) + 1;
      events.push({
        type: 'DICE_ROLLED',
        playerId: command.playerId,
        payload: { value: diceResult },
        timestamp: Date.now()
      });
      events.push({
        type: 'PHASE_CHANGED',
        payload: { phase: 'Move' },
        timestamp: Date.now()
      });
      break;

    case 'MOVE_PIECE':
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

    case 'END_TURN':
      if (state.turn.phase !== 'EndTurn') {
        throw new Error('You must complete current actions before ending turn.');
      }
      events.push({
        type: 'TURN_ENDED',
        playerId: command.playerId,
        timestamp: Date.now()
      });
      break;

    default:
      throw new Error(`Unknown command type: ${command.type}`);
  }

  return events;
}
```

### 3.4. Pure Reducer (`client/src/engine/reducer.ts`)
The reducer takes the current state and applies an event to yield the next state. It is pure and does not produce side effects.
```typescript
import { EngineState, EngineEvent } from './types';

export function applyEvent(state: EngineState, event: EngineEvent): EngineState {
  const nextState = JSON.parse(JSON.stringify(state)); // Deep clone to maintain purity
  nextState.eventLog.push(event);

  switch (event.type) {
    case 'DICE_ROLLED':
      nextState.moduleState.lastDiceValue = event.payload.value;
      break;

    case 'PIECE_MOVED':
      const playerId = event.playerId!;
      const currentPos = nextState.moduleState.playerPositions[playerId] || 0;
      nextState.moduleState.playerPositions[playerId] = currentPos + event.payload.spaces;
      break;

    case 'PHASE_CHANGED':
      nextState.turn.phase = event.payload.phase;
      break;

    case 'TURN_ENDED':
      // Rotate active player
      const playerIds = Object.keys(nextState.players);
      const currentIndex = playerIds.indexOf(nextState.turn.currentPlayerId);
      const nextIndex = (currentIndex + 1) % playerIds.length;
      nextState.turn.currentPlayerId = playerIds[nextIndex];
      nextState.turn.phase = 'StartTurn';
      break;

    default:
      break;
  }

  return nextState;
}
```

---

## 4. Local Sandbox UI
The local sandbox interface will provide a testing ground to verify player interaction.
* **Aesthetics**: Premium dark glassmorphism theme using high-contrast typography, deep-hued gradients, glass backdrops, and interactive micro-animations (hover scales, focus glows).
* **State Syncing**: The page instantiates the Engine state.
* **Control UI**:
  * Seat Selector: Allows toggling between player roles (e.g. Player 1, Player 2) to test hot-seat rules.
  * Actions Panel: Dynamically enables/disables command buttons (Roll Dice, Move, End Turn) based on whether it is the active player's turn and matching phase.
  * Event Log: Displays a list of events generated in real-time.
  * State Inspector: Renders the structured game state JSON in a scrolling viewport for inspection.

---

## 5. Verification Plan

### 5.1. Automated Tests
We will build standard unit tests using standard Node assert libraries or Vitest:
* Validate that `validateCommand` throws errors on out-of-turn actions.
* Validate that seed-based `prng.ts` generates identical pseudo-random outputs given the same seed.
* Validate that replaying an `eventLog` from an initial seed reproduces the final `EngineState` exactly.

### 5.2. Manual Verification
* Access the sandbox client inside the Docker container via `http://localhost:5173`.
* Step through a full 2-player local seat rotation:
  1. Set active seat to Player 1.
  2. Perform "Roll Dice", verify state transition events are logged and phase updates.
  3. Perform "Move Piece", verify position changes in the inspector.
  4. Perform "End Turn", verify active player shifts to Player 2.
  5. Attempt to play as Player 1 during Player 2's turn, verify that the engine throws a validation error and prevents the command.
