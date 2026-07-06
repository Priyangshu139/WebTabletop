# Lobby & Hybrid P2P Networking Implementation Plan

**Goal:** Implement the lobby matchmaking, WebRTC star-mesh topology, authoritative peer-to-peer event synchronization, and host migration recovery.

**Architecture:** Peer-to-peer validation overlay on top of the deterministic core engine. Clients run actions locally by forwarding them to the Host client over WebRTC DataChannels. The Host runs the validation engine, produces events, updates state, and broadcasts events back to peers. The Host periodically backs up the state to the Express backend via REST.

**Tech Stack:** TypeScript, WebSockets (`ws` npm package), WebRTC (DataChannels), Express, Vitest.

---

## Global Constraints
- Platforms: Android PWA (primary), Tauri Desktop (secondary).
- State-Driven UI: UI strictly reacts to engine state events.
- No gameplay logic simulation on the backend server.
- The server acts strictly as a signaling coordinator and REST state backup storage.

---

### Task 1: WebSocket Signaling Backend Server

**Files:**
- Modify: `backend/package.json`
- Create: `backend/src/signaling.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: Scaffolding from Sub-project 1.
- Produces: Live WebSocket signaling server routing peer handshake offers/answers.

- [ ] **Step 1: Install backend WebSocket dependencies**
  Modify `backend/package.json` to add `ws` and `@types/ws` dependencies, and run `npm install` in `backend/` directory.

- [ ] **Step 2: Implement `backend/src/signaling.ts`**
  Create signaling server class mapping lobbies to connection sockets.
  Handle signaling message relays:
  * Receive `SIGNAL` target payloads and route them to target peer sockets.
  * Keep track of connected players and handle socket disconnects.

- [ ] **Step 3: Integrate WebSocket listener in `backend/src/server.ts`**
  Bind the WebSocket server to the Express HTTP port.

---

### Task 2: Lobby Management & State Backups (REST)

**Files:**
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: Signaling structures from Task 1.
- Produces: HTTP API endpoints for lobby creation, joining, and saving states.

- [ ] **Step 1: Implement REST Lobby Lifecycle endpoints**
  Add endpoints:
  * `POST /api/lobby/create`: Generates unique 8-character `lobbyId` and `secretHash` for the host (assigns Player ID `P1`).
  * `POST /api/lobby/join`: Verifies lobby validity, assigns player credentials (`P2`, `P3`, etc.) and `secretHash`.
  * `POST /api/lobby/:id/save`: Allows host to store serialized `EngineState` payload. Requires authorization verification of `secretHash`.
  * `GET /api/lobby/:id/state`: Returns the backed up state.

---

### Task 3: Client WebSockets Signaling Service

**Files:**
- Create: `client/src/network/signalingClient.ts`
- Create: `client/src/network/signalingClient.test.ts`

**Interfaces:**
- Consumes: Core engine types from Sub-project 1.
- Produces: WebSockets client interface for sending/receiving signaling packages.

- [ ] **Step 1: Implement `client/src/network/signalingClient.ts`**
  Implement client websocket connection layer wrapping messages.
  Exposes callbacks for `onSignal`, `onPeerConnected`, `onPeerDisconnected`, `onHostMigrate`.

- [ ] **Step 2: Write tests in `client/src/network/signalingClient.test.ts`**
  Verify messaging structure, events, connection retry callbacks, and credentials caching.

---

### Task 4: WebRTC Peer Connection & Star Mesh Handshake

**Files:**
- Create: `client/src/network/webrtcManager.ts`
- Create: `client/src/network/webrtcManager.test.ts`

**Interfaces:**
- Consumes: Signaling Client from Task 3.
- Produces: Star network connection mesh managing direct `RTCPeerConnection` and `RTCDataChannel` handles.

- [ ] **Step 1: Implement `client/src/network/webrtcManager.ts`**
  Provide Peer/Host roles:
  * **Peer role**: Creates `RTCPeerConnection`, adds `RTCDataChannel`, generates SDP offer, sends signal.
  * **Host role**: Receives offer, sets remote description, generates SDP answer, sends signal.
  * Exposes handlers to send/receive JSON payloads over WebRTC DataChannel.

- [ ] **Step 2: Write tests in `client/src/network/webrtcManager.test.ts`**
  Verify SDP negotiation, channel setup, connection lifecycle callbacks, and data exchange.

---

### Task 5: Authoritative Replication, Reconnection & Host Migration

**Files:**
- Create: `client/src/network/syncEngine.ts`
- Create: `client/src/network/syncEngine.test.ts`

**Interfaces:**
- Consumes: WebRTC Manager from Task 4, state machines from Sub-project 1.
- Produces: Networked sync engine running validation loop, backups, and migration recovery.

- [ ] **Step 1: Implement `client/src/network/syncEngine.ts`**
  Add networked game loop:
  * **Host role**: Receives `Command` over P2P, runs `validateCommand`, applies state events, broadcasts `Events` back to all peers, triggers REST backup.
  * **Peer role**: Forwards local command to Host, receives `Events` from Host, applies events locally to trigger UI updates.
  * **Host Migration**: On Host WebRTC channel close, reconnects signaling socket, negotiates new Star topology under the elected Host, resynchronizes state.

- [ ] **Step 2: Write tests in `client/src/network/syncEngine.test.ts`**
  Test command forwarding, validation execution, replication, and migration workflows.

---

### Task 6: Visual Lobby UI & Networking Integration

**Files:**
- Modify: `client/src/sandbox/main.ts`
- Modify: `client/src/sandbox/style.css`

**Interfaces:**
- Consumes: All networking systems (Tasks 1-5).
- Produces: Multi-seat interactive lobby and multiplayer gameplay sandbox running on Vite dev server.

- [ ] **Step 1: Update main layout to include lobby join panel**
  * Allow generating new lobbies (getting lobby code) and entering codes to join other hosts.
  * Show connection status, active seat list, and WebRTC channel states.
  * Allow playing the dice roll and move game loop over WebRTC.
  * Simulate Host disconnects and display the Host Migration recovery state.
