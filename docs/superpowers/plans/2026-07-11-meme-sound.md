# Meme Sound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a multiplayer meme soundboard with customizable radial wheels, top-left sound settings toggle, temporary avatar face emoji swaps, and an integrated chat meme panel.

**Architecture:** Ephemeral WebRTC P2P messaging is used to broadcast sound plays in real-time. Sound playback uses simple HTML5 Audio streaming from the backend Express static endpoint.

**Tech Stack:** HTML5 Audio API, Three.js, Express static, WebRTC.

## Global Constraints
- Do not use placeholders (TBD, TODO, or implement later).
- Preserve existing codebase styling and conventions.
- All builds and tests must pass at the end of each task.

---

### Task 1: Backend Static File Serving & Client Meme Database

**Files:**
- Create: `client/src/sandbox/memeData.ts`
- Modify: `backend/src/server.ts:1-12`, `backend/src/server.ts:133-140`

**Interfaces:**
- Consumes: None
- Produces: 
  - `MEME_DATABASE`: Array of 49 meme configurations.
  - Backend route: `/meme/*` serving ogg files.

- [ ] **Step 1: Create client-side meme configuration database**
  Create `client/src/sandbox/memeData.ts` containing the static array of 49 memes mapping ID, emoji, name, color, and filename:
  ```typescript
  export interface MemeConfig {
    id: string;
    emoji: string;
    name: string;
    color: 'Blue' | 'Red' | 'Purple' | 'Orange' | 'Green';
    filename: string;
  }

  export const MEME_DATABASE: MemeConfig[] = [
    { id: "aisa-mat-karo-meri-jaan", emoji: "🥺", name: "aisa-mat-karo-meri-jaan", color: "Blue", filename: "00 - meme sounds - aisa-mat-karo-meri-jaan.ogg" },
    { id: "emotional-damage-meme", emoji: "💔", name: "emotional-damage-meme", color: "Blue", filename: "00 - meme sounds - emotional-damage-meme.ogg" },
    { id: "fahhhhhhhhhhhhh", emoji: "😫", name: "fahhhhhhhhhhhhh", color: "Blue", filename: "00 - meme sounds - fahhhhhhhhhhhhhh.ogg" },
    { id: "meri-jung-emotional", emoji: "😭", name: "meri-jung-emotional", color: "Blue", filename: "00 - meme sounds - meri-jung-emotional.ogg" },
    { id: "rg-sorry", emoji: "😔", name: "rg-sorry", color: "Blue", filename: "00 - meme sounds - rg-sorry.ogg" },
    { id: "sad-meow", emoji: "😿", name: "sad meow", color: "Blue", filename: "00 - meme sounds - sad meow.ogg" },
    { id: "spongebob-fail", emoji: "🎺", name: "spongebob-fail", color: "Blue", filename: "00 - meme sounds - spongebob-fail.ogg" },
    { id: "this-is-the-end", emoji: "🏁", name: "this is the end", color: "Blue", filename: "00 - meme sounds - this is the end.ogg" },
    { id: "aji-mangal", emoji: "🙄", name: "aji-mangal", color: "Red", filename: "00 - meme sounds - aji-mangal.ogg" },
    { id: "asambhav-carry-minati", emoji: "🙅‍♂️", name: "asambhav-carry-minati", color: "Red", filename: "00 - meme sounds - asambhav-carry-minati.ogg" },
    { id: "bhai-bhai-bhai", emoji: "🤦‍♂️", name: "bhai-bhai-bhai", color: "Red", filename: "00 - meme sounds - bhai-bhai-bhai.ogg" },
    { id: "bruh", emoji: "😑", name: "bruh", color: "Red", filename: "00 - meme sounds - bruh.ogg" },
    { id: "cut-me-out", emoji: "✂️", name: "cut me out", color: "Red", filename: "00 - meme sounds - cut me out.ogg" },
    { id: "dexter-meme", emoji: "🔪", name: "dexter-meme", color: "Red", filename: "00 - meme sounds - dexter-meme.ogg" },
    { id: "khopdi-tor-salay-ka", emoji: "🔨", name: "khopdi-tor-salay-ka", color: "Red", filename: "00 - meme sounds - khopdi-tor-salay-ka .ogg" },
    { id: "ma-ka-bhosda", emoji: "🤬", name: "ma-ka-bhosda", color: "Red", filename: "00 - meme sounds - ma-ka-bhosda.ogg" },
    { id: "ek-gand-pe-rapta", emoji: "😡", name: "EK GAND PE RAPTA MARANA SADAK PE...", color: "Red", filename: "00 - Prajwal Sonawane - EK GAND PE RAPTA MARANA SADAK PE HAGTA FIREGA. ABHIJEET CID MEME TEMPLATE..ogg" },
    { id: "cid-bakchodi-mat-kar", emoji: "🕵️", name: "CID bakchodi mat kar", color: "Red", filename: "00 - Tilak - CID bakchodi mat kar laude #cid  #sonytv #sony #dubbing #clips #viral #trending.ogg" },
    { id: "ruko-zraa-sabar-karo", emoji: "✋", name: "Ruko zraa sabar karo", color: "Red", filename: "00 - meme sounds - Ruko zraa sabar karo hindustan bhau.ogg" },
    { id: "bas-kar-bhai", emoji: "🛑", name: "bas kar bhai", color: "Red", filename: "00 - _ By X9 Converter - bas kar bhai.ogg" },
    { id: "matlab-wo-alag-level-ka-banda", emoji: "🤯", name: "matlab-wo-alag-hi-level-ka-banda", color: "Purple", filename: "00 - meme sounds - matlab-wo-alag-hi-level-ka-banda.ogg" },
    { id: "oh-my-god-bro", emoji: "😱", name: "oh-my-god-bro", color: "Purple", filename: "00 - meme sounds - oh-my-god-bro-oh-hell-nah-man .ogg" },
    { id: "khatam-gaya", emoji: "💀", name: "khatam-gaya", color: "Purple", filename: "00 - meme sounds - khatam-gaya.ogg" },
    { id: "hey-prabhu-hey-hari", emoji: "🙏", name: "hey-prabhu-hey-hari-ram", color: "Purple", filename: "00 - meme sounds - hey-prabhu-hey-hari-ram-krishna-jagganath Ew1vEwh.ogg" },
    { id: "among-us-role-reveal", emoji: "🤫", name: "Among Us (Role Reveal)", color: "Purple", filename: "00 - Gaming Sound FX - Among Us (Role Reveal) - Sound Effect (HD).ogg" },
    { id: "anime", emoji: "✨", name: "anime", color: "Purple", filename: "00 - meme sounds - anime.ogg" },
    { id: "chin-tapak-dum", emoji: "🪄", name: "chin-tapak-dum", color: "Purple", filename: "00 - meme sounds - chin-tapak-dum.ogg" },
    { id: "lol", emoji: "😂", name: "lol", color: "Orange", filename: "00 - meme sounds - lol.ogg" },
    { id: "tum-dum-tedau", emoji: "🤪", name: "tum-dum-tedau", color: "Orange", filename: "00 - meme sounds - tum-dum-tedau .ogg" },
    { id: "tain-tain-to-to", emoji: "🤡", name: "tain-tain-to-to", color: "Orange", filename: "00 - meme sounds - tain-tain-to-to .ogg" },
    { id: "eh-eh-ehhhh", emoji: "8", name: "eh-eh-ehhhh", color: "Orange", filename: "00 - meme sounds - eh-eh-ehhhh.ogg" },
    { id: "gopgopgop", emoji: "🐸", name: "gopgopgop", color: "Orange", filename: "00 - meme sounds - gopgopgop.ogg" },
    { id: "chicken-on-tree", emoji: "🐔", name: "chicken-on-tree-screaming", color: "Orange", filename: "00 - meme sounds - chicken-on-tree-screaming.ogg" },
    { id: "mac-quack", emoji: "🦆", name: "mac-quack", color: "Orange", filename: "00 - meme sounds - mac-quack.ogg" },
    { id: "meow-ghop-ghop-ghop", emoji: "🐈", name: "meow-ghop-ghop-ghop", color: "Orange", filename: "00 - meme sounds - meow-ghop-ghop-ghop.ogg" },
    { id: "tehelka-omlette", emoji: "🍳", name: "tehelka-omlette", color: "Orange", filename: "00 - meme sounds - tehelka-omlette.ogg" },
    { id: "spiderman-meme", emoji: "🕷️", name: "spiderman meme", color: "Orange", filename: "00 - meme sounds - spiderman meme.ogg" },
    { id: "chalo", emoji: "🚶‍♂️", name: "chalo", color: "Orange", filename: "00 - meme sounds - chalo.ogg" },
    { id: "yara-yara-phonk", emoji: "😎", name: "yara-yara-phonk", color: "Green", filename: "00 - meme sounds - yara-yara-phonk.ogg" },
    { id: "rizz-sound-effect", emoji: "😏", name: "rizz-sound-effect", color: "Green", filename: "00 - meme sounds - rizz-sound-effect.ogg" },
    { id: "accha-hamko-sikha", emoji: "🤓", name: "accha-hamko-sikha", color: "Green", filename: "00 - meme sounds - accha-hamko-sikha.ogg" },
    { id: "ye-ladki-tum-bohut-bolti", emoji: "🗣️", name: "ye-ladki-tum-bohut-bolti", color: "Green", filename: "00 - meme sounds - ye-ladki-tum-bohut-bolti-ho-chapad-chapad.ogg" },
    { id: "hacker-hai-bhai-hacker", emoji: "💻", name: "hacker-hai-bhai", color: "Green", filename: "00 - meme sounds - hacker-hai-bhai-hacker.ogg" },
    { id: "crore", emoji: "💰", name: "crore", color: "Green", filename: "07 - meme sounds - crore.ogg" },
    { id: "thik-ha", emoji: "👍", name: "thik-ha", color: "Green", filename: "00 - meme sounds - thik-ha.ogg" },
    { id: "chachaa", emoji: "👴", name: "chachaa", color: "Green", filename: "00 - meme sounds - chachaa.ogg" },
    { id: "modi-ji", emoji: "🧔", name: "modi-ji", color: "Green", filename: "00 - meme sounds - modi-ji.ogg" },
    { id: "modi-ji-bhojyam", emoji: "🍛", name: "modi-ji-bhojyam", color: "Green", filename: "00 - meme sounds - modi-ji-bhojyam.ogg" },
    { id: "music-oh-ho-ho", emoji: "🎶", name: "music-oh ho ho", color: "Green", filename: "00 - meme sounds - music-oh ho ho.ogg" }
  ];
  ```

- [ ] **Step 2: Add Express static route for serving meme folder**
  In `backend/src/server.ts`, import `path` and configure the static route `/meme` to point to `/home/priyangshu/WebTabletop/meme sound ogg`:
  ```typescript
  import path from 'path';
  // ...
  app.use('/meme', express.static('/home/priyangshu/WebTabletop/meme sound ogg'));
  ```

- [ ] **Step 3: Run backend build and verify**
  Run: `npm run build` in `backend`. Verify it compiles cleanly.

---

### Task 2: P2P Meme Syncing & Sound Control Modes

**Files:**
- Modify: `client/src/network/syncEngine.ts:100-140`, `client/src/network/syncEngine.ts:320-330`
- Modify: `client/src/sandbox/soundManager.ts`

**Interfaces:**
- Consumes: `SyncEngine`, `SoundManager`
- Produces:
  - `syncEngine.sendMeme(memeId)` method
  - `syncEngine.onMemeReceived` callback hook
  - `soundManager.setSoundMode(mode)` and `soundManager.playMeme(filename)`

- [ ] **Step 1: Add PLAY_MEME event broadcasting to SyncEngine**
  In `client/src/network/syncEngine.ts`, add the public listener `onMemeReceived` and handling logic inside `webrtcManager.onMessage`:
  ```typescript
  // In SyncEngine class properties:
  public onMemeReceived?: (playerId: string, memeId: string) => void;

  // Inside webrtcManager.onMessage:
  if (data.type === 'PLAY_MEME') {
    if (this.isHost) {
      this.webrtcManager.broadcastExcept(senderId, data);
    }
    this.onMemeReceived?.(data.playerId, data.memeId);
    return;
  }
  ```

- [ ] **Step 2: Add sendMeme method to SyncEngine**
  In `client/src/network/syncEngine.ts`, add `sendMeme`:
  ```typescript
  public sendMeme(memeId: string) {
    try {
      this.webrtcManager.broadcast({ type: 'PLAY_MEME', playerId: this.playerId, memeId });
      this.onMemeReceived?.(this.playerId, memeId);
    } catch (_) {}
  }
  ```

- [ ] **Step 3: Extend SoundManager with modes and playMeme**
  In `client/src/sandbox/soundManager.ts`, implement sound control modes (`on`, `game-only`, `meme-only`, `off`) and simple HTML5 Audio playback for meme sounds:
  ```typescript
  // In SoundManager class:
  private soundMode: 'on' | 'game-only' | 'meme-only' | 'off' = 'on';

  constructor() {
    const saved = localStorage.getItem('webtabletop-sound-mode');
    if (saved) this.soundMode = saved as any;
  }

  public setSoundMode(mode: 'on' | 'game-only' | 'meme-only' | 'off') {
    this.soundMode = mode;
    localStorage.setItem('webtabletop-sound-mode', mode);
  }

  public getSoundMode() {
    return this.soundMode;
  }

  public playMemeSound(filename: string) {
    if (this.soundMode !== 'on' && this.soundMode !== 'meme-only') return;
    
    // Play using native HTML5 Audio element for efficient streaming
    const audio = new Audio(`http://localhost:3000/meme/${encodeURIComponent(filename)}`);
    audio.volume = 1.0;
    audio.play().catch(err => console.error("Meme play failed:", err));
  }
  ```
  Wrap all existing synth sound triggers inside `soundManager.ts` (like `playCardPlay`, `playCardDraw`, etc.) with mode filters:
  ```typescript
  if (this.soundMode !== 'on' && this.soundMode !== 'game-only') return;
  ```

- [ ] **Step 4: Verify client builds**
  Run: `npm run build` in `client`. Verify it compiles cleanly.

---

### Task 3: 3D Face Emoji Swap

**Files:**
- Modify: `client/src/sandbox/threeRenderer.ts:320-380`, `client/src/sandbox/threeRenderer.ts:835-860`

**Interfaces:**
- Consumes: `ThreeRenderer`
- Produces:
  - `threeRenderer.tempOverrideFaceEmoji(playerId, emoji)`

- [ ] **Step 1: Add face swap support to ThreeRenderer**
  In `client/src/sandbox/threeRenderer.ts`, keep track of active face override timeouts and dynamically update the face sprite:
  ```typescript
  // In ThreeRenderer properties:
  private faceOverrideTimeouts: Map<string, any> = new Map();
  private originalFaceEmojis: Map<string, string> = new Map();

  // New method:
  public tempOverrideFaceEmoji(playerId: string, emoji: string) {
    const avatarGroup = this.avatarsMap.get(playerId);
    if (!avatarGroup) return;

    // Cancel existing timeout if any
    const existingTimeout = this.faceOverrideTimeouts.get(playerId);
    if (existingTimeout) clearTimeout(existingTimeout);

    // Save original emoji if not already overridden
    if (!this.originalFaceEmojis.has(playerId)) {
      const orig = this.currentState?.players[playerId]?.emojiFace || '🦊';
      this.originalFaceEmojis.set(playerId, orig);
    }

    this.updateAvatarFaceSprite(avatarGroup, emoji);

    // Set 3s restore timeout
    const timeout = setTimeout(() => {
      const orig = this.originalFaceEmojis.get(playerId) || '🦊';
      this.updateAvatarFaceSprite(avatarGroup, orig);
      this.originalFaceEmojis.delete(playerId);
      this.faceOverrideTimeouts.delete(playerId);
    }, 3000);

    this.faceOverrideTimeouts.set(playerId, timeout);
  }
  ```

- [ ] **Step 2: Add helper method to redraw the face sprite**
  In `client/src/sandbox/threeRenderer.ts`, split off face creation logic into a reusable helper `updateAvatarFaceSprite(avatarGroup, emoji)`:
  ```typescript
  private updateAvatarFaceSprite(avatarGroup: THREE.Group, emoji: string) {
    const existingFace = avatarGroup.getObjectByName('avatar-face') as THREE.Sprite;
    if (!existingFace) return;

    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = 128;
    faceCanvas.height = 128;
    const faceCtx = faceCanvas.getContext('2d');
    if (faceCtx) {
      faceCtx.font = '72px sans-serif';
      faceCtx.textAlign = 'center';
      faceCtx.textBaseline = 'middle';
      faceCtx.fillText(emoji, 64, 64);
    }
    const faceTex = new THREE.CanvasTexture(faceCanvas);
    existingFace.material.map = faceTex;
    existingFace.material.needsUpdate = true;
  }
  ```

- [ ] **Step 3: Modify syncSeatedAvatars to label the face sprite**
  Ensure the face sprite created in `syncSeatedAvatars` is named `'avatar-face'`:
  ```typescript
  faceSprite.name = 'avatar-face';
  ```

- [ ] **Step 4: Verify client builds**
  Run: `npm run build` in `client`. Verify it compiles cleanly.

---

### Task 4: Lobby Customization of Meme Wheel

**Files:**
- Modify: `client/src/sandbox/main.ts:renderLobbyRoom`

**Interfaces:**
- Consumes: `localStorage`, `MEME_DATABASE`
- Produces: Customizable Quick Meme Wheel UI in Lobby

- [ ] **Step 1: Add quick-access wheel configuration markup to Lobby Roster panel**
  In `client/src/sandbox/main.ts` inside `renderLobbyRoom()`, add HTML markup for configuring the 6 quick-access wheel memes. Load selected memes from local storage (defaulting to the first 6 memes):
  ```typescript
  // Load wheel selection
  let savedWheel = JSON.parse(localStorage.getItem('webtabletop-meme-wheel') || '[]');
  if (savedWheel.length !== 6) {
    savedWheel = MEME_DATABASE.slice(0, 6).map(m => m.id);
    localStorage.setItem('webtabletop-meme-wheel', JSON.stringify(savedWheel));
  }
  ```
  Render the 6 slots under the Avatar Profile customization section:
  ```html
  <div style="margin-top: 14px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px;">
    <div style="color: #94a3b8; font-weight: bold; font-size: 12px; margin-bottom: 8px;">QUICK MEME WHEEL (6 SLOTS)</div>
    <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px;" id="lobby-meme-wheel-slots">
      ${savedWheel.map((mid: string, idx: number) => {
        const meme = MEME_DATABASE.find(m => m.id === mid) || MEME_DATABASE[idx];
        return `
          <button class="action-btn meme-slot-btn" data-slot-idx="${idx}" style="padding: 8px 4px; font-size: 16px; background: rgba(30,41,59,0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; cursor: pointer; text-align: center;" title="${meme.name}">
            ${meme.emoji}
          </button>
        `;
      }).join('')}
    </div>
  </div>
  ```

- [ ] **Step 2: Bind click listener to open Selection Modal for slots**
  In the lobby room rendering script, handle clicking a slot to show a scrollable grid of all 49 memes categorized by color, letting the player assign a meme to that slot:
  ```typescript
  document.querySelectorAll('.meme-slot-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const slotIdx = parseInt((e.currentTarget as HTMLButtonElement).dataset.slotIdx || '0');
      
      // Render scrollable selector modal
      const modal = document.createElement('div');
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.width = '100vw';
      modal.style.height = '100vh';
      modal.style.background = 'rgba(15, 23, 42, 0.7)';
      modal.style.backdropFilter = 'blur(8px)';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      modal.style.zIndex = '999999';

      modal.innerHTML = `
        <div style="background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 24px; width: 340px; max-height: 480px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; pointer-events: auto;">
          <h3 style="margin: 0; color: white;">Choose Meme for Slot ${slotIdx + 1}</h3>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
            ${MEME_DATABASE.map(meme => `
              <button class="action-btn select-meme-btn" data-meme-id="${meme.id}" style="padding: 10px; font-size: 20px; background: rgba(30,41,59,0.8); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; cursor: pointer;" title="${meme.name}">
                ${meme.emoji}
              </button>
            `).join('')}
          </div>
          <button id="close-meme-selector" style="background: #475569; color: white; border: none; border-radius: 8px; padding: 8px; font-weight: bold; cursor: pointer;">Cancel</button>
        </div>
      `;

      document.body.appendChild(modal);

      modal.querySelectorAll('.select-meme-btn').forEach(mBtn => {
        mBtn.addEventListener('click', (ev) => {
          const mid = (ev.currentTarget as HTMLButtonElement).dataset.memeId || '';
          const currentWheel = JSON.parse(localStorage.getItem('webtabletop-meme-wheel') || '[]');
          currentWheel[slotIdx] = mid;
          localStorage.setItem('webtabletop-meme-wheel', JSON.stringify(currentWheel));
          modal.remove();
          renderLobbyRoom(gameState); // Re-render to update slot emojis
        });
      });

      modal.querySelector('#close-meme-selector')?.addEventListener('click', () => modal.remove());
    });
  });
  ```

---

### Task 5: Radial Meme Wheel Controls

**Files:**
- Modify: `client/src/sandbox/main.ts:buildGameplayLayout`

**Interfaces:**
- Consumes: Mouse/Touch drag coordinates on right side of viewport, `SyncEngine`
- Produces: 6-sector Radial Overlay HUD for triggering memes

- [ ] **Step 1: Add Radial HTML markup to gameplay viewport**
  Add a hidden radial menu HTML container inside `camera-viewport` in `buildGameplayLayout()`:
  ```html
  <div id="radial-meme-menu" style="display: none; position: absolute; width: 180px; height: 180px; border-radius: 50%; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px); border: 1.5px solid rgba(255,255,255,0.15); box-shadow: 0 10px 40px rgba(0,0,0,0.6); z-index: 10000; pointer-events: none;">
    <!-- Sectors populated dynamically -->
  </div>
  ```

- [ ] **Step 2: Bind PC Right-Click and Mobile Touch-Hold controls to Radial Wheel**
  Handle PC Right-Click (on the right half of the screen) and Mobile Touch-Hold (on the right half of the screen) to show the radial wheel. When dragging outward into a sector and releasing, trigger `syncEngine.sendMeme(memeId)`:
  ```typescript
  let radialActive = false;
  let radialCenterX = 0;
  let radialCenterY = 0;
  let selectedSector = -1;
  let touchHoldTimeout: any = null;

  const radialEl = document.getElementById('radial-meme-menu');

  const openRadial = (x: number, y: number) => {
    if (!radialEl) return;
    radialActive = true;
    radialCenterX = x;
    radialCenterY = y;
    radialEl.style.left = `${x - 90}px`;
    radialEl.style.top = `${y - 90}px`;
    radialEl.style.display = 'block';
    renderRadialSectors();
  };

  const closeRadial = () => {
    if (!radialEl || !radialActive) return;
    if (selectedSector !== -1) {
      const wheel = JSON.parse(localStorage.getItem('webtabletop-meme-wheel') || '[]');
      const mid = wheel[selectedSector];
      if (mid && syncEngine) {
        syncEngine.sendMeme(mid);
      }
    }
    radialActive = false;
    radialEl.style.display = 'none';
    selectedSector = -1;
  };

  // PC Right-click handling on right side
  window.addEventListener('contextmenu', (e) => {
    if (e.clientX >= window.innerWidth / 2) {
      e.preventDefault();
      openRadial(e.clientX, e.clientY);
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) { // right click release
      closeRadial();
    }
  });

  // Mobile Touch Hold handling on right side
  window.addEventListener('touchstart', (e) => {
    if (e.touches[0] && e.touches[0].clientX >= window.innerWidth / 2) {
      const touch = e.touches[0];
      touchHoldTimeout = setTimeout(() => {
        openRadial(touch.clientX, touch.clientY);
      }, 500); // 500ms tap hold
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (touchHoldTimeout) clearTimeout(touchHoldTimeout);
    closeRadial();
  });

  // Mouse/Touch Drag angle resolution
  const handleDragMove = (clientX: number, clientY: number) => {
    if (!radialActive) return;
    const dx = clientX - radialCenterX;
    const dy = clientY - radialCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 20) {
      selectedSector = -1; // Deadzone
    } else {
      let angle = Math.atan2(dy, dx); // -PI to PI
      if (angle < 0) angle += Math.PI * 2; // 0 to 2PI
      selectedSector = Math.floor((angle / (Math.PI * 2)) * 6) % 6;
    }
    renderRadialSectors();
  };

  window.addEventListener('mousemove', (e) => {
    if (radialActive) handleDragMove(e.clientX, e.clientY);
  });

  window.addEventListener('touchmove', (e) => {
    if (radialActive && e.touches[0]) {
      handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });
  ```

- [ ] **Step 3: Implement renderRadialSectors sector rendering**
  Dynamically draw the circular sectors (SVG or absolute divs) showing emojis of the 6 selected memes. Highlight the `selectedSector` sector:
  ```typescript
  const renderRadialSectors = () => {
    if (!radialEl) return;
    const wheel = JSON.parse(localStorage.getItem('webtabletop-meme-wheel') || '[]');
    let html = '';
    
    for (let i = 0; i < 6; i++) {
      const mid = wheel[i];
      const meme = MEME_DATABASE.find(m => m.id === mid) || MEME_DATABASE[i];
      const isHighlighted = i === selectedSector;
      const angle = (i * 60 + 30) * (Math.PI / 180);
      const x = Math.cos(angle) * 55 + 90;
      const y = Math.sin(angle) * 55 + 90;

      html += `
        <div style="position: absolute; left: ${x - 18}px; top: ${y - 18}px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; font-size: 22px; transition: transform 0.15s; transform: scale(${isHighlighted ? '1.4' : '1.0'}); text-shadow: ${isHighlighted ? '0 0 10px #3b82f6' : 'none'};" title="${meme.name}">
          ${meme.emoji}
        </div>
      `;
    }

    radialEl.innerHTML = html;
  };
  ```

---

### Task 5.5: Sound Mode Toggle Setup

**Files:**
- Modify: `client/src/sandbox/main.ts:buildGameplayLayout`

**Interfaces:**
- Consumes: `SoundManager`
- Produces: Top Left settings button mode toggle handler

- [ ] **Step 1: Add Sound Mode Toggle handler to Top-Left Button**
  Inside `buildGameplayLayout()`, wire up the mute button (`uno-btn-mute`) to toggle between the 4 modes: ON (`🔊`), GAME ONLY (`🎮`), MEME ONLY (`🗣️`), OFF (`🔇`). Ensure it displays the correct icon:
  ```typescript
  const muteBtn = document.getElementById('uno-btn-mute');
  const updateMuteIcon = () => {
    if (!muteBtn) return;
    const mode = soundManager.getSoundMode();
    const icons: Record<string, string> = { on: '🔊', 'game-only': '🎮', 'meme-only': '🗣️', off: '🔇' };
    muteBtn.innerText = icons[mode] || '🔊';
  };

  updateMuteIcon();

  muteBtn?.addEventListener('click', () => {
    const current = soundManager.getSoundMode();
    const modes: ('on' | 'game-only' | 'meme-only' | 'off')[] = ['on', 'game-only', 'meme-only', 'off'];
    const next = modes[(modes.indexOf(current) + 1) % modes.length];
    soundManager.setSoundMode(next);
    updateMuteIcon();
    triggerFloatingAlert(`Sound Mode: ${next.toUpperCase().replace('-', ' ')}`);
  });
  ```

---

### Task 6: Chat Meme List Panel

**Files:**
- Modify: `client/src/sandbox/main.ts:buildGameplayLayout`

**Interfaces:**
- Consumes: `SyncEngine`, `MEME_DATABASE`, `localStorage`
- Produces: Color-coded, scrollable panel above the chat input box

- [ ] **Step 1: Inject Meme Panel HTML above Chat Bar**
  In `client/src/sandbox/main.ts`, find the sidebar chat input container. Inject a scrollable meme panel directly above the chat text bar:
  ```html
  <!-- Scrollable Meme list panel (covers no more than 40% height) -->
  <div id="chat-meme-panel" style="max-height: 140px; overflow-y: auto; padding: 6px; background: rgba(15,23,42,0.4); border-top: 1px solid rgba(255,255,255,0.08); display: flex; flex-wrap: wrap; gap: 6px; box-sizing: border-box; pointer-events: auto;">
    <!-- Color coded pills dynamically rendered -->
  </div>
  ```

- [ ] **Step 2: Bind Chat Meme Panel renderer & click listener**
  In `client/src/sandbox/main.ts` where UI updates occur (or immediately inside `buildGameplayLayout`), render the scrollable list of memes (excluding those assigned to the quick wheel):
  ```typescript
  const renderChatMemePanel = () => {
    const panel = document.getElementById('chat-meme-panel');
    if (!panel) return;

    const wheel = JSON.parse(localStorage.getItem('webtabletop-meme-wheel') || '[]');
    const colorMap: Record<string, string> = {
      Blue: '#3b82f6',
      Red: '#ef4444',
      Purple: '#8b5cf6',
      Orange: '#f59e0b',
      Green: '#10b981'
    };

    // Exclude wheel memes to keep panel clean
    const otherMemes = MEME_DATABASE.filter(m => !wheel.includes(m.id));

    panel.innerHTML = otherMemes.map(meme => {
      const color = colorMap[meme.color] || '#cbd5e1';
      return `
        <button class="chat-meme-pill-btn" data-meme-id="${meme.id}" style="background: rgba(15,23,42,0.65); border: 1.5px solid ${color}; color: ${color}; border-radius: 12px; padding: 4px 10px; font-size: 11px; font-weight: bold; cursor: pointer; transition: background 0.15s; pointer-events: auto;">
          ${meme.emoji} ${meme.name.replace(/-/g, ' ')}
        </button>
      `;
    }).join('');

    // Bind click listeners
    panel.querySelectorAll('.chat-meme-pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mid = (e.currentTarget as HTMLButtonElement).dataset.memeId || '';
        if (syncEngine && mid) {
          syncEngine.sendMeme(mid);
        }
      });
    });
  };

  renderChatMemePanel();
  ```
  Ensure we hook `renderChatMemePanel()` when the lobby room re-renders as well, so changes to wheel slots automatically update which memes are in the chat panel.

---

### Task 7: WebRTC Message Reception Connection

**Files:**
- Modify: `client/src/sandbox/main.ts:initializeSync`

**Interfaces:**
- Consumes: `syncEngine.onMemeReceived`
- Produces: Sync receiver logic to trigger local sound and face emoji overrides

- [ ] **Step 1: Hook onMemeReceived callback**
  Inside `initializeSync()`, right after `syncEngine` is created, define the receiver hook:
  ```typescript
  syncEngine.onMemeReceived = (senderId, memeId) => {
    const meme = MEME_DATABASE.find(m => m.id === memeId);
    if (!meme) return;

    // 1. Play the local audio clip
    soundManager.playMemeSound(meme.filename);

    // 2. Override 3D avatar face emoji
    if (threeRenderer) {
      threeRenderer.tempOverrideFaceEmoji(senderId, meme.emoji);
    }
  };
  ```

---

## Verification Plan

### Automated Tests
Run client tests to verify compilation and baseline logic:
```bash
npm run build && npm run test
```

### Manual Verification
1.  **Backend static asset serving**:
    Run `curl http://localhost:3000/meme/00%20-%20meme%20sounds%20-%20bruh.ogg` to verify the ogg file is served correctly by Express.
2.  **Matchmaking custom slot configuration**:
    Open the lobby page. Custom slots (6 circular buttons) should appear under your avatar setup. Clicking a slot should open a popup with the 49 memes. Selecting a meme should update the button emoji.
3.  **Chat scrollable panel**:
    Enter the game. A color-coded meme list panel covering no more than 40% height should appear above the chat bar. Clicking a meme pill should trigger the sound and swap your avatar's face emoji.
4.  **Radial quick menu**:
    Hold right-click (PC) or touch-hold on the right half of the screen. A 6-sector menu showing your customized quick emojis should appear. Dragging out and releasing should trigger the meme play.
5.  **Settings sound modes**:
    Clicking the top-left sound settings button should cycle through `🔊` -> `🎮` -> `🗣️` -> `🔇`. Verify sound filtering matches the selected mode.
