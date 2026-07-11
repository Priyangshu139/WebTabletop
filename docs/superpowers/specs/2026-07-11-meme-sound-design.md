# Meme Sound System Design Specification

## Goal
Implement a real-time multiplayer meme soundboard feature that allows players to play localized meme audio clips during gameplay, customize a quick-access wheel of 6 memes during avatar selection, view/trigger remaining memes in a scrollable panel above the chat box, override their avatar face emoji to the meme's emoji for 3 seconds upon play, and control audio output modes via a sound control button.

---

## Technical Architecture

### 1. Static Audio Files Hosting
*   The Express server in `backend/src/server.ts` will serve the `/home/priyangshu/WebTabletop/meme sound ogg` directory statically.
*   **Endpoint**: `/meme/*` (e.g. `http://localhost:3000/meme/filename.ogg`).
*   This makes audio clips accessible to all connected clients over HTTP.

### 2. Meme Database Configuration
*   A static database of the 49 meme sounds mapping IDs to emojis, display names, categories/colors, and exact file names.
*   **Categories/Colors**: Blue, Red, Purple, Orange, Green.

### 3. P2P WebRTC Messaging & Sync
*   **WebRTC Message Type**: `PLAY_MEME`
    *   Payload: `{ type: 'PLAY_MEME', playerId: string, memeId: string }`
*   **Relaying**: The Host relays the `PLAY_MEME` message to all other connected peers.
*   **Reception Actions**:
    1.  Resolve the meme configuration from `memeId`.
    2.  If the local client's audio mode allows it, play the audio from the static backend URL.
    3.  Override the specified `playerId`'s avatar face emoji to the meme's emoji in the 3D scene.
    4.  Set a 3-second timer to restore the avatar's default trait face emoji.

### 4. Audio Control Modes
*   The top-left sound control button (currently `uno-btn-mute` / `🔊`) will toggle between 4 modes:
    1.  **ON** (`🔊`): Both game sounds and meme sounds are enabled.
    2.  **GAME ONLY** (`🎮`): Only game logic sounds (card play, flips, etc.) are enabled; meme sounds are muted.
    3.  **MEME ONLY** (`🗣️`): Only meme sounds are enabled; game logic sounds are muted.
    4.  **OFF** (`🔇`): Both game sounds and meme sounds are muted.
*   This setting is saved in the player's local state or browser local storage.

### 5. UI Components

#### A. Avatar Selection & Wheel Configuration (Lobby)
*   Under the avatar customization panel, render the **Quick Meme Wheel Setup**.
*   It displays 6 slots. Clicking any slot opens a popup/dropdown list of all 49 memes.
*   Selecting a meme assigns it to that slot.
*   The wheel selections are saved to `localStorage` (defaulting to the first 6 memes).

#### B. Radially Triggered Meme Wheel (Gameplay)
*   **Triggers**:
    *   **PC**: Right click and hold anywhere on the **right half** of the screen.
    *   **Mobile**: Tap and hold anywhere on the **right half** of the screen.
*   **Wheel Display**: A circular overlay divided into 6 sectors centered at the pointer/touch position.
*   **Selection**: Dragging the mouse/finger into a sector highlights it. Releasing the hold triggers the selected meme.

#### C. Chat Scrollable Meme Panel (Gameplay)
*   A scrollable panel positioned directly **above the chat bar** inside the chat box.
*   **Height Constraint**: Fixed height covering no more than **40%** of the chat column height.
*   **Content**: Displays all memes not assigned to the quick wheel.
*   **Styling**: Each meme is rendered as a clickable pill/text with its category color (Blue, Red, Purple, Orange, Green).
*   **Action**: Clicking a pill plays that meme sound instantly.

---

## Verification Plan

### Automated Tests
*   Verify WebRTC message serialization/deserialization for the new `PLAY_MEME` message.
*   Verify settings state toggle logic for the 4 sound control modes.

### Manual Verification
1.  Verify the settings button toggles between `🔊`, `🎮`, `🗣️`, and `🔇`.
2.  Verify customization of the 6 wheel slots in the matchmaking lobby.
3.  Verify right-click hold on PC and touch-hold on Mobile (right side of screen) displays the 6-sector radial wheel, and selecting a meme triggers the sound and updates the avatar's face emoji.
4.  Verify clicking a colored meme pill in the chat box above the text input triggers the sound and face emoji update.
