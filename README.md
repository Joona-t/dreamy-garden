# 🐛 Dreamy Garden

> A psychedelic fuzzy caterpillar Snake game browser extension with cozy dreamy vibes.

---

## ✨ Aesthetic

Soft pastel psychedelic palette — pinks, purples, mints, blues — on a deep dreamy dark background. Floating sparkles, breathing glow effects, and a fuzzy multi-colored caterpillar snake. Retro cute, trippy soft.

---

## 📁 File Structure

```
dreamy-garden/
├── manifest.json           Chrome/Firefox extension manifest (MV3)
├── newtab.html             New-tab override: the game page
├── styles.css              Animated background, sparkles, layout
├── game.js                 Canvas snake engine + state machine
├── popup.html              Extension toolbar popup
├── icons/
│   ├── icon.svg            Master SVG icon (source)
│   ├── generate_icons.html Open in browser → download PNG icons
│   ├── icon16.png          (generate these – see below)
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## 🚀 Installation

### Step 1 — Generate PNG Icons

1. Open `icons/generate_icons.html` in your browser
2. Click each download button (`icon16.png`, `icon48.png`, `icon128.png`)
3. Move the downloaded files into the `icons/` folder

### Step 2 — Load in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dreamy-garden/` folder
5. Open a new tab → the game appears! 🌸

### Step 3 — Load in Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `dreamy-garden/manifest.json`
4. Open a new tab → the game appears!

> **Permanent Firefox install:** Package the folder as a `.zip`, sign it via [addons.mozilla.org](https://addons.mozilla.org), and install the signed `.xpi`.

---

## 🎮 How to Play

| Action | Keys |
|--------|------|
| Move   | `↑ ↓ ← →` or `W A S D` |
| Pause  | `Space` or `P` or `Esc` |
| Start / Restart | `Enter` or `Space` on the overlay |

**Objective:** Guide your fuzzy caterpillar to eat sparkle gems without hitting the walls or yourself. Each gem eaten grows your caterpillar and scores a point!

---

## 🧩 Technical Details

### Architecture

- **Pure vanilla JS** — no dependencies, no build step
- **Canvas 2D API** — game renders at 60fps via `requestAnimationFrame`
- **Discrete movement** — snake steps every 130ms; direction queued per tick
- **`localStorage`** — persists your best score

### State Machine

```
idle ──[Start]──► playing ──[wall/self]──► dead ──[Restart]──► playing
                     │                              ▲
                  [Space/P]                         │
                     ▼                              │
                  paused ─────[Continue]────────────┘
```

### Rendering Pipeline (per frame)

1. `drawBoard()` — frosted glass overlay + subtle grid dots
2. `drawParticles()` — ambient floating sparkles
3. `drawFood()` — pulsing rotating sparkle gem
4. `drawSnake()` → `drawConnections()` + `drawSegment()` per cell
5. `drawFloatTexts()` — "+1" score pop-ups

### Fuzzy Caterpillar

Each segment is rendered as:
- 4× concentric semi-transparent halos (the "fuzz")
- A main circle with radial gradient (highlight + base color)
- A specular shine dot
- Head: cute face with eyes, pupils, shine, and curved antennae

---

## 🌸 Customisation

| Thing to change | Where |
|----------------|-------|
| Snake speed    | `MOVE_MS` in `game.js` |
| Color palette  | `SEG_COLORS` array in `game.js` |
| Grid size      | `GRID` and `CELL` constants |
| Background     | `--bg-layer-1` gradient in `styles.css` |
| Sparkle count  | `MAX_SPARKS` in `game.js` |

---

## 🔒 Permissions

No special permissions required. High scores are saved locally using `localStorage`.

No data is sent anywhere. Everything stays on your device.

---

## 🛠 Browser Compatibility

| Browser | Support |
|---------|---------|
| Chrome 88+ | ✅ Full |
| Edge 88+   | ✅ Full |
| Firefox 109+ | ✅ Full (MV3) |
| Safari | ❌ Does not support MV3 new-tab override |

---

*Dreamy Garden — part of the LoveSpark Suite 🩷*
