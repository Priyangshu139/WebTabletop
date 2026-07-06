# Tabletop Platform PRD – Phase 1 (Locked Spec)

## 1. Vision & Core Philosophy
A web-first, Android-first virtual tabletop engine for playing data-driven, official game modules. 
* **State-Driven UI**: The core simulation engine is authoritative; the UI strictly reacts to engine state events. Animations never drive or block game state progression.
* **Account-free**: High ease-of-use with zero-friction, login-less session identity.
* **Low-Overhead Backend**: The backend is lightweight, handling only lobby coordination, asset/module delivery, and high-level statistics—never simulating gameplay.

---

## 2. Platform Target
* **Primary**: Android (PWA). Touch-optimized, shake/flick physics, haptic events.
* **Secondary**: Windows Desktop (Tauri). Mouse-optimized, custom tactile hands.

---

## 3. Identity & Lobby Lifecycle

### 3.1. Login-less Reconnection
No user accounts. Session identity is established per-lobby:
* When a player joins/creates a lobby, the backend generates a **Player Reconnect Payload**:
  * `Lobby ID` (e.g., `ABCD1234`)
  * `Player ID` (e.g., `P3`)
  * `Secret Hash` (unique token stored in local storage)
* Reconnection: If the browser/app crashes or closes, pasting the `Secret Hash` (or auto-reading it from local storage) instantly reconnects the player to their active seat.

### 3.2. Lobby Persistence
* A lobby remains active until the Host explicitly terminates it.
* Supports multi-game sessions: `Lobby Created` → `Game 1` → `Stats Saved` → `Return to Lobby` → `Game 2` → `Stats Saved` without needing to recreate the lobby or reissue join codes.

### 3.3. Module Downloads
* When a Host hovers over a game module in the lobby, the server checks which connected clients already have the assets cached.
* Only players missing the module trigger a download.
* The module version is **frozen** at lobby start (e.g., v1.4 is locked even if v1.5 is released mid-session) to prevent version mismatches.

---

## 4. Engine & State Architecture

### 4.1. Core Engine Pipeline
```
Player Action → Command → Rule Engine (Validation) → Events → State Reducer → UI Animation
```
* **Actions**: Everything a player initiates (e.g., `RollDice`, `MovePiece`, `DrawCard`, `EndTurn`). The engine *only* processes Actions.
* **Rule Engine**: Validates the incoming Command/Action against rules defined in the current game module. If valid, generates a sequence of delta events.
* **Events**: Small, self-contained logs of what occurred (e.g., `DiceRolled(result)`, `CardDrawn(player, cardId)`).
* **State Reducer**: A pure function applying Events to advance the game State.

### 4.2. Turn Phases
The engine provides generic turn phases that modules selectively register:
* `StartTurn` → `Roll` → `Move` → `ResolveTile` → `OptionalActions` → `EndTurn`

### 4.3. Determinism
* **PRNG**: A single deterministic seedable PRNG (e.g., SplitMix32) is initialized with the session seed. It handles all randomness (dice values, deck shuffles, coin tosses, spawn order, random events).
* **Physics**: 3D dice physics are resolved deterministically on the authoritative client (Host) using physical inputs (strength, direction, spin) and synced to other clients.

### 4.4. Hidden Information
* Hidden data is omitted from the state event logs sent to non-owner clients.
* Secret logs remain hidden on the network layer and are only sent/decrypted for the active owner.
* Live spectators view the match in real-time but only have access to public/revealed state data (no private hands, no hidden HUD).

---

## 5. Networking (Hybrid P2P)
* **Authoritative Peer**: The Host coordinates the game.
* **Host Migration**: If the Host disconnects, a new peer is elected automatically. The new host reconstructs the authoritative state from the full local event log and resumes play.
* **Clock Sync**: Host periodically broadcasts sync packets to ensure all peers are aligned on the latest action log.

---

## 6. Interaction & UI
* **Tactile Hands**:
  * **Desktop**: The system cursor is replaced by a low-poly 3D hand.
    * *Idle*: Right hand follows mouse pointer.
    * *Active*: Engine takes control of the hand to execute actions (e.g., picking up a card, moving a piece).
  * **Android**: Tactile fingers control the right hand.
* **Dice Throw**: Instead of continuous shake simulation, the interface measures touch flick direction/speed or mouse drag velocity. It converts this into `Throw Strength`, `Direction`, and `Spin` variables, feeding them to the deterministic physics engine.
* **Camera**: Strictly bounded. Allows **zoom only** (no rotation/pan out of boundaries) to maintain layout consistency.

---

## 7. Chat & Avatars
* **Lobby Chat**: Retains the last 50 messages. All logs are deleted when the lobby is closed (no permanent storage).
* **Avatars**: Low-poly representations of head, chest, arms, and hands.
  * Customization limited to: pawn color, skin tone, emoji face renders.
* **Discord Integration**: Support for pinning a Discord voice invite link in the lobby.

---

## 8. Game Modules & Assets
* **Module Contents**: Data-only packages containing rules, boards, cards, models, localization, and audio.
* **Format**: Plain uncompressed web packages (or standard ZIP files optimized for browser fetching).
* **Community Compatibility**: Future community modules will use the exact same format as official modules.

---

## 9. Save & Statistics
* **Match Saves**: Fully event-sourced (Initial Seed + Action Log).
* **Match Statistics**: Full logs are purged when the session ends. Only lightweight summaries are saved permanently:
  * `Lobby ID`, `Game Type`, `Players`, `Winner`, `Duration`, `Turns`, `Dice Rolls`, `Score/Money Earned`, `Date`.
