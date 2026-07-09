# Tabletop Platform - Design Taste & UI Aesthetics Guide

This guide details the premium matte slate-blue layout, typography, color palette, and mobile responsiveness guidelines established for the Tabletop project. Use this as a reference when building new UI panels, pages, or components to ensure a consistent, high-end look and feel.

---

## 1. Matte Slate-Blue Color Palette

We moved away from high-contrast neon purple/green themes to a curated, high-end matte slate-gray and indigo color scheme extracted from premium tabletop designs:

| Element | CSS Variable / Value | Description |
| :--- | :--- | :--- |
| **Main Background** | `#0f141c` | Deep dark slate base. |
| **Sidebar Background** | `#131a23` | Matte charcoal gray. |
| **Panel Background** | `#161e28` | Slate-blue/charcoal panel backing. |
| **Panel Border** | `rgba(255, 255, 255, 0.08)` | Muted white border line. |
| **Text Muted** | `#64748b` or `#94a3b8` | Cool slate grays for minor details. |
| **Primary/Accent Blue** | `#60a5fa` | Soft light blue for primary labels, lobby codes. |
| **Accent Glow** | `rgba(96, 165, 250, 0.3)` | Soft blue glow text-shadows. |
| **Primary Indigo** | `#4f46e5` | Indigo accent for primary buttons and selection highlights. |
| **Accent Indigo Hover** | `#6366f1` | Vibrant soft indigo for hovered highlights. |
| **Pawn Color Swatches**| Muted hex values | Muted blues, reds, greens, oranges, etc. (no neon). |

---

## 2. Layout & Spacing Rules

To keep panels from floating with awkward gaps or looking squished, use these responsive layout spacing guidelines:

### 2.1. Pre-Game Lobby Layout
- **PC/Desktop View**: Use `display: flex; gap: 32px; justify-content: center; align-items: stretch;`. Set the container height to `calc(100vh - 48px)` so that panels occupy the entire vertical screen area.
  - **Panel 1 (Lobby seats)**: `flex: 1; max-width: 460px;`
  - **Panel 2 (Game & Rules)**: `flex: 1.5; max-width: 760px;`
- **Mobile View (<= 960px)**: Force `flex-direction: column !important; align-items: center !important; height: auto !important;` so that panels stack vertically (top and bottom) and center horizontally. Restrict panels to a maximum width of `600px` (`max-width: 600px !important; width: 100% !important;`) to leave elegant side margins (breathing space) on wide phone landscape viewports.

### 2.2. Matchmaking / Welcome Screen (PC vs Phone Isolated Views)
For complex page structures where PC and mobile designs differ fundamentally, render both layouts and show/hide them using CSS class targets:
- **PC Layout (`.desktop-matchmaking-layout`)**:
  - Grid: `280px 1fr` (Left Sidebar and Right column).
  - Avatar Profile Card: Set `max-width: 680px` to occupy screen space comfortably.
  - Card Merging: Style the Avatar Card (`border-bottom: none; border-bottom-left-radius: 0; border-bottom-right-radius: 0;`) and the Replay Card below it (`margin-top: 0; border-top-left-radius: 0; border-top-right-radius: 0; border-top: 1px solid var(--panel-border);`) to touch and merge into a single unified card appearance.
- **Mobile Layout (`.mobile-matchmaking-layout`)**:
  - Hides Left Sidebar.
  - **Landscape Phones (600px - 960px)**: Displays side-by-side using percentages: compact actions panel on the left (`width: 18%`, `min-width: 90px`), setup columns on the right (`width: 79%`), and a gap of `3%`. Hides button description sub-text (`span { display: none; }`) and styles buttons with `box-sizing: border-box` to prevent horizontal scrolling overflow.
  - **Portrait Phones (<= 600px)**: Stacks vertically (`flex-direction: column !important; align-items: center !important;`) with a maximum card width of `440px`.

---

## 3. Component Aesthetics & CSS Tokens

### 3.1. Glassmorphic Panels (`.sandbox-panel`)
All interactive panels should have rounded corners, subtle shadows, and borders to look tactile:
```css
.sandbox-panel {
  background-color: #161e28;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 24px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
```

### 3.2. Pinned Chats
- **Positioning**: Render pinned messages in a separate container `#chat-pinned-container` positioned **above** the scrollable messages area, preventing them from scrolling away.
- **Highlighting**: Use a solid white border and a warm semi-transparent backing to make them stand out:
```css
#chat-pinned-container .chat-msg-row {
  border: 1.5px solid #ffffff !important;
  background: rgba(255, 255, 255, 0.06) !important;
  color: #ffffff !important;
  border-radius: 8px;
}
```

### 3.3. Cycle Settings Selector Row
For rule editors, use cycling selectors rather than inputs:
```css
.rule-cycle-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: white;
  border-radius: 4px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: bold;
}
.rule-cycle-btn:hover {
  background: rgba(99, 102, 241, 0.2);
  border-color: #6366f1;
}
.rule-cycle-val {
  font-size: 13px;
  font-weight: bold;
  color: #818cf8; /* Soft indigo shade */
}
```

### 3.4. Roster Hover micro-animations
When hovering elements, keep animations subtle to feel premium:
```css
.player-list-row {
  transition: border-color 0.2s ease, transform 0.2s ease;
}
.player-list-row:hover {
  border-color: rgba(255, 255, 255, 0.15) !important;
  transform: translateY(-1px);
}
```

### 3.5. Glowing Elements (Lobby Code / Crowns)
```css
/* Pulsing Lobby Code Status Dot */
.pulse-green-dot {
  width: 6px;
  height: 6px;
  background-color: #10b981;
  border-radius: 50%;
  animation: pulse-dot 1.8s infinite;
}
@keyframes pulse-dot {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 5px rgba(16, 185, 129, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

/* Host Crown Gold Shadow */
.host-crown {
  text-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
}
```

### 3.6. Mobile Drawers & Viewports (`100dvh` & `45%` Width)
When building full-height drawer overlays on mobile devices, use the dynamic viewport height `100dvh` (rather than standard `100vh`) to prevent inputs or buttons at the bottom (like Chat Send or Rule Save/Cancel) from being pushed off-screen. Additionally, configure drawer widths to `45%` on mobile viewports so that they only occupy a portion of the screen, leaving plenty of space for the main UI to breathe.
```css
.chat-drawer, .rules-drawer {
  height: 100vh;
  height: 100dvh; /* Dynamic viewport height standard */
}

@media (max-width: 960px) {
  .chat-drawer {
    width: 45% !important;
    right: -45% !important;
    height: 100dvh !important;
    padding: 16px 12px !important;
    min-width: 260px !important;
  }
  
  .chat-drawer.active {
    right: 0 !important;
  }

  .chat-drawer-toggle.active {
    right: calc(45% - 36px) !important;
  }

  .rules-drawer {
    width: 45% !important;
    left: -45% !important;
    height: 100dvh !important;
    padding: 16px 12px !important;
    min-width: 260px !important;
  }
  
  .rules-drawer.active {
    left: 0 !important;
  }
}
```
