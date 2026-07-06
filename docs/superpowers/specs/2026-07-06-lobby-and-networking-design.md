# Technical Specification: Lobby & Hybrid P2P Networking

This document outlines the technical design for **Sub-project 2: Lobby & Hybrid P2P Networking**. It establishes a Star Topology WebRTC P2P network where the Host is authoritative, backed by a WebSocket signaling server and REST state storage.

---

## 1. Network Topology: Star Mesh

Instead of a full mesh network ($O(N^2)$ connections), we implement a **Star Network Topology** centered around the game Host.

* **Connections**: Each Peer client establishes a single direct `RTCPeerConnection` with the Host.
* **Handshake Initiator**: The Peer client always initiates the connection handshake (creates the SDP offer).
* **Communication Channel**: All gameplay command validations and updates occur over direct WebRTC `RTCDataChannel` streams.

```text
    [ Peer P2 ] <====== P2P WebRTC ======> [ Authoritative Host ]
                                                   ||
    [ Peer P3 ] <====== P2P WebRTC ============>   || (HTTP REST)
                                                   \/
    [ Peer P4 ] <====== P2P WebRTC ======> [ Backend REST Server ]
```

---

## 2. Signaling Server Protocol (WebSockets)

A lightweight Node/Express WebSocket server handles lobby matchmaking and relays connection handshakes.

### 2.1 Message Schema
```typescript
interface SignalingMessage {
  type: 'CREATE_LOBBY' | 'JOIN_LOBBY' | 'SIGNAL' | 'PEER_CONNECTED' | 'PEER_DISCONNECTED' | 'HOST_MIGRATE' | 'ERROR';
  senderId?: string;
  targetId?: string;
  payload?: any;
}
```

### 2.2 Reconnect Security
Each player receives a unique `secretHash` upon joining.
```typescript
interface PlayerCredentials {
  lobbyId: string;
  playerId: string;
  secretHash: string;
}
```
If a player disconnects, they present this hash to reclaim their seat and reconnect to the host.

---

## 3. P2P WebRTC Handshake Flow

1. Peer connects to Signaling Server via WebSockets and sends `JOIN_LOBBY`.
2. Host is notified via `PEER_JOINING`.
3. Peer generates a WebRTC SDP Offer and transmits it: `SIGNAL(Offer, target: Host)`.
4. Host receives the Offer, generates an Answer, and transmits it: `SIGNAL(Answer, target: Peer)`.
5. Both exchange ICE Candidates.
6. The `RTCDataChannel` transitions to the `open` state.
7. Peer disconnects from the WebSocket server. Host remains connected to accept other peers.

---

## 4. Synchronization & Verification Loop

### 4.1 Command Execution
All gameplay actions are wrapped as `EngineCommand` objects and sent to the Host via the DataChannel.
1. Peer sends `{ type: 'COMMAND', command: EngineCommand }` to Host.
2. Host runs `validateCommand(state, command, prng)`.
3. If validation succeeds, Host applies the events locally and broadcasts `{ type: 'EVENTS', events: EngineEvent[] }` to all connected peers.
4. If validation fails, Host returns `{ type: 'ERROR', message: string }` only to the sender.

### 4.2 State Backups (REST)
The Host (as the single source of truth) periodically backs up the state via REST:
`POST /api/lobby/:lobbyId/save`

---

## 5. Host Migration Protocol

If the Host client disconnects (detected by WebRTC channel closure):
1. Remaining peers automatically reconnect to the WebSocket signaling server.
2. The server designates the oldest connected peer as the new Host.
3. Server broadcasts `HOST_MIGRATE { newHostId: string }`.
4. The designated player accepts the Host role.
5. All other peers establish new RTCPeerConnections to the new Host.
6. The new Host broadcasts their current local `EngineState` over the new channels to resynchronize the game.
