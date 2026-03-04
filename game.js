/**
 * Dreamy Garden – Fuzzy Caterpillar Snake
 * game.js — Canvas engine with smooth per-segment interpolation
 *
 * Smooth movement: every segment stores (x,y) = current grid pos
 * and (px,py) = previous grid pos. Each frame we lerp between them
 * using the fraction of time elapsed since the last tick. This makes
 * ALL segments slide smoothly, not just the head.
 *
 * Performance: shadowBlur is used sparingly (only for food glow and
 * the single head glow). Body segments use layered transparent circles
 * for the fuzzy halo instead of the GPU-heavy blur filter.
 */

'use strict';

// ─── Constants ──────────────────────────────────────────────────────────────

const GRID     = 20;           // cells per row/col
const CELL     = 25;           // px per cell → canvas 500×500
const SIZE     = GRID * CELL;  // 500
const MOVE_MS  = 140;          // ms per snake step (lower = faster)
const MAX_PART = 50;           // cap on canvas particles

/** Segment colours cycle head→tail */
const SEG_COLS = [
    '#c084fc', // violet-pink   (head)
    '#f9a8d4', // rose-pink
    '#86efac', // mint-green
    '#7dd3fc', // sky-blue
    '#fda4af', // blush
    '#c4b5fd', // wisteria
    '#6ee7b7', // seafoam
    '#fbcfe8', // light pink
];

/** Mushroom variants [cap, underside, stem, spotColour, glowColour] */
const MUSHROOMS = [
    { cap:'#e84040', under:'#b52f2f', stem:'#f5ead7', spot:'#ffffff', glow:'#ff8080' }, // red
    { cap:'#9333ea', under:'#6b21a8', stem:'#ede9fe', spot:'#f3e8ff', glow:'#c084fc' }, // purple
    { cap:'#2563eb', under:'#1d4ed8', stem:'#eff6ff', spot:'#dbeafe', glow:'#7dd3fc' }, // blue
    { cap:'#ea580c', under:'#c2410c', stem:'#fff7ed', spot:'#ffedd5', glow:'#fdba74' }, // orange
    { cap:'#16a34a', under:'#15803d', stem:'#f0fdf4', spot:'#dcfce7', glow:'#86efac' }, // green
];

const SPARK_COLS = ['#f9a8d4','#c084fc','#86efac','#7dd3fc','#fbcfe8','#ffffff'];

// ─── Power-Up Definitions ───────────────────────────────────────────────────

const POWERUP_TYPES = [
    { id: 'speed', label: 'SPEED', icon: '⚡', duration: 6000, color: '#facc15', glow: '#fde68a' },
    { id: 'ghost', label: 'GHOST', icon: '👻', duration: 7000, color: '#a78bfa', glow: '#c4b5fd' },
    { id: 'wrap',  label: 'WRAP',  icon: '🌀', duration: 8000, color: '#34d399', glow: '#6ee7b7' },
];

const POWERUP_SPAWN_INTERVAL = 8000;   // ms between spawn attempts
const POWERUP_SPAWN_CHANCE   = 0.6;    // 60% chance each attempt
const POWERUP_DESPAWN_MS     = 10000;  // disappear after 10s if uneaten
const SPEED_MULTIPLIER       = 0.6;    // 60% of MOVE_MS when speed-boosted
const POWERUP_RAINBOW = ['#f9a8d4','#c084fc','#facc15','#34d399','#7dd3fc','#fb923c'];

// ─── State ──────────────────────────────────────────────────────────────────

const gs = {
    phase:       'idle',  // idle | playing | paused | dead
    snake:       [],      // [{x,y,px,py}, …] head-first
    dir:         {x:1,y:0},
    nextDir:     {x:1,y:0},
    food:        {x:0,y:0,mush:0},
    score:       0,
    best:        0,
    frame:       0,
    lastTick:    0,
    particles:   [],
    floatTexts:  [],
    dirLocked:   false,
    // Power-ups
    powerup:        null,   // on-board: {x, y, type, spawnedAt}
    activePowers:   [],     // active: [{type, expiresAt}]
    lastPowerSpawn: 0,
    speedMultiplier: 1,
};

// ─── DOM ────────────────────────────────────────────────────────────────────

const canvas      = document.getElementById('gameCanvas');
const ctx         = canvas.getContext('2d');
const elScore     = document.getElementById('score');
const elBest      = document.getElementById('best-score');
const elOverlay   = document.getElementById('overlay');
const elTitle     = document.getElementById('overlay-title');
const elMsg       = document.getElementById('overlay-msg');
const elBtn       = document.getElementById('action-btn');
const canvasWrap  = document.querySelector('.canvas-wrap');

// ─── Utilities ──────────────────────────────────────────────────────────────

function lerp(a, b, t) { return a + (b - a) * t; }

function hexRGB(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n>>16)&255, (n>>8)&255, n&255];
}
function rgba(hex, a) {
    const [r,g,b] = hexRGB(hex);
    return `rgba(${r},${g},${b},${a.toFixed(2)})`;
}
function lighten(hex, t) {
    const [r,g,b] = hexRGB(hex);
    return `rgb(${Math.round(r+(255-r)*t)},${Math.round(g+(255-g)*t)},${Math.round(b+(255-b)*t)})`;
}
function rndInt(n) { return Math.floor(Math.random()*n); }

// ─── LocalStorage ───────────────────────────────────────────────────────────

function loadBest()  { try { return +localStorage.getItem('dg_best')||0; } catch { return 0; } }
function saveBest(n) { try { localStorage.setItem('dg_best', n); }      catch {} }

// ─── Overlay ────────────────────────────────────────────────────────────────

function showOverlay(title, msg, btn) {
    elTitle.textContent = title;
    elMsg.textContent   = msg;
    elBtn.textContent   = btn;
    elOverlay.classList.remove('hidden');
    elBtn.focus();
}
function hideOverlay() {
    elOverlay.classList.add('hidden');
    canvas.focus();
}

// ─── Particles ──────────────────────────────────────────────────────────────

function spawnParticle(x, y, burst = false) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = burst ? 1.5 + Math.random()*3.5 : 0.2 + Math.random()*0.5;
    gs.particles.push({
        x, y,
        vx: Math.cos(angle)*spd,
        vy: Math.sin(angle)*spd - (burst ? 0 : 0.6),
        size:  burst ? 2+Math.random()*3 : 1+Math.random()*2,
        color: SPARK_COLS[rndInt(SPARK_COLS.length)],
        life:  1,
        decay: burst ? 0.022+Math.random()*0.018 : 0.007+Math.random()*0.006,
    });
}
function spawnBurst(cx, cy, n) { for (let i=0;i<n;i++) spawnParticle(cx, cy, true); }

function updateParticles() {
    if (gs.frame % 5 === 0 && gs.particles.length < MAX_PART) {
        spawnParticle(Math.random()*SIZE, SIZE+5, false);
    }
    for (let i = gs.particles.length-1; i >= 0; i--) {
        const p = gs.particles[i];
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.05;
        p.life -= p.decay;
        if (p.life <= 0 || p.y < -10) gs.particles.splice(i,1);
    }
}

/** Draw particles WITHOUT shadowBlur – just alpha circles for performance */
function drawParticles() {
    for (const p of gs.particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        ctx.fillStyle = rgba(p.color, p.life * 0.85);
        ctx.fill();
    }
}

// ─── Floating "+1" text ──────────────────────────────────────────────────────

function spawnFloat(cx, cy, text = '+1', color = '#f9a8d4') {
    gs.floatTexts.push({x:cx, y:cy, life:1, text, color});
}

function updateFloats() {
    for (let i = gs.floatTexts.length-1; i >= 0; i--) {
        const t = gs.floatTexts[i];
        t.y -= 1.4; t.life -= 0.028;
        if (t.life <= 0) gs.floatTexts.splice(i,1);
    }
}
function drawFloats() {
    ctx.font = 'bold 17px system-ui';
    ctx.textAlign = 'center';
    for (const t of gs.floatTexts) {
        ctx.globalAlpha = t.life;
        ctx.fillStyle = t.color || '#f9a8d4';
        ctx.fillText(t.text || '+1', t.x, t.y);
    }
    ctx.globalAlpha = 1;
}

// ─── Board ──────────────────────────────────────────────────────────────────

function drawBoard() {
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Frosted dark overlay over the CSS animated background
    ctx.fillStyle = 'rgba(8, 3, 22, 0.52)';
    ctx.beginPath();
    ctx.roundRect(0, 0, SIZE, SIZE, 18);
    ctx.fill();

    // Faint grid dots
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    for (let gx=0; gx<GRID; gx++) {
        for (let gy=0; gy<GRID; gy++) {
            ctx.beginPath();
            ctx.arc(gx*CELL+CELL/2, gy*CELL+CELL/2, 1.1, 0, Math.PI*2);
            ctx.fill();
        }
    }
}

// ─── Mushroom Food ───────────────────────────────────────────────────────────

/**
 * Draw a cute 2D mushroom at canvas coords (cx, cy).
 * Uses a single shadowBlur call only for the cap glow.
 */
function drawMushroom(cx, cy, mushIdx, frame) {
    const m  = MUSHROOMS[mushIdx];
    const sc = CELL * 0.42;                     // scale unit
    const pulse = 1 + 0.1 * Math.sin(frame * 0.1);

    ctx.save();
    ctx.translate(cx, cy + sc * 0.25);
    ctx.scale(pulse, pulse);

    // ── Stem ──
    ctx.fillStyle = m.stem;
    ctx.beginPath();
    ctx.roundRect(-sc*0.28, -sc*0.05, sc*0.56, sc*0.75, sc*0.18);
    ctx.fill();
    // stem highlight stripe
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.roundRect(-sc*0.1, sc*0.02, sc*0.1, sc*0.5, sc*0.05);
    ctx.fill();

    // ── Cap underside ──
    ctx.fillStyle = m.under;
    ctx.beginPath();
    ctx.ellipse(0, -sc*0.05, sc*0.98, sc*0.22, 0, 0, Math.PI);
    ctx.fill();

    // ── Cap dome (one shadowBlur per mushroom, cheap) ──
    ctx.shadowColor = m.glow;
    ctx.shadowBlur  = 14;
    ctx.fillStyle   = m.cap;
    ctx.beginPath();
    ctx.moveTo(-sc, -sc*0.05);
    ctx.bezierCurveTo(-sc, -sc*1.55, sc, -sc*1.55, sc, -sc*0.05);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Cap highlight (soft ellipse near top)
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(-sc*0.18, -sc*0.82, sc*0.38, sc*0.22, -0.5, 0, Math.PI*2);
    ctx.fill();

    // ── White spots ──
    ctx.fillStyle = m.spot;
    const spots = [[0,-0.72],[-0.48,-0.42],[0.48,-0.42],[-0.12,-0.3],[0.28,-0.18]];
    for (const [sx,sy] of spots) {
        ctx.beginPath();
        ctx.ellipse(sx*sc, sy*sc, sc*0.115, sc*0.09, sx*0.3, 0, Math.PI*2);
        ctx.fill();
    }

    ctx.restore();
}

// ─── Power-Up Mushroom (trippy glow) ─────────────────────────────────────────

function drawPowerupMushroom(cx, cy, typeIdx, frame, ts) {
    const def   = POWERUP_TYPES[typeIdx];
    const sc    = CELL * 0.46;
    const pulse = 1 + 0.14 * Math.sin(frame * 0.12);
    const age   = gs.powerup ? ts - gs.powerup.spawnedAt : 0;

    // Blink when about to despawn (last 3 seconds)
    const timeLeft = POWERUP_DESPAWN_MS - age;
    if (timeLeft < 3000 && Math.floor(frame / 6) % 2 === 0) return;

    ctx.save();
    ctx.translate(cx, cy + sc * 0.25);
    ctx.scale(pulse, pulse);

    // Outer glow rings
    const ringPhase = frame * 0.08;
    for (let r = 3; r >= 1; r--) {
        const ringR = sc * (1.2 + r * 0.5) + Math.sin(ringPhase + r) * 4;
        const alpha = 0.08 + 0.04 * Math.sin(ringPhase + r * 2);
        ctx.beginPath();
        ctx.arc(0, -sc * 0.3, ringR, 0, Math.PI * 2);
        ctx.fillStyle = rgba(def.glow, alpha);
        ctx.fill();
    }

    // Stem
    ctx.fillStyle = '#f5ead7';
    ctx.beginPath();
    ctx.roundRect(-sc * 0.28, -sc * 0.05, sc * 0.56, sc * 0.75, sc * 0.18);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.roundRect(-sc * 0.1, sc * 0.02, sc * 0.1, sc * 0.5, sc * 0.05);
    ctx.fill();

    // Cap underside
    ctx.fillStyle = rgba(def.color, 0.7);
    ctx.beginPath();
    ctx.ellipse(0, -sc * 0.05, sc * 0.98, sc * 0.22, 0, 0, Math.PI);
    ctx.fill();

    // Cap dome with rainbow-shifting gradient
    const rainbowIdx = Math.floor(frame * 0.06) % POWERUP_RAINBOW.length;
    const blend = 0.5 + 0.5 * Math.sin(frame * 0.06);

    ctx.shadowColor = def.glow;
    ctx.shadowBlur  = 18 + 6 * Math.sin(frame * 0.1);

    const capGrad = ctx.createLinearGradient(-sc, -sc * 1.2, sc, -sc * 0.2);
    capGrad.addColorStop(0, def.color);
    capGrad.addColorStop(blend, POWERUP_RAINBOW[rainbowIdx]);
    capGrad.addColorStop(1, def.glow);
    ctx.fillStyle = capGrad;
    ctx.beginPath();
    ctx.moveTo(-sc, -sc * 0.05);
    ctx.bezierCurveTo(-sc, -sc * 1.55, sc, -sc * 1.55, sc, -sc * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Cap highlight
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.ellipse(-sc * 0.18, -sc * 0.82, sc * 0.38, sc * 0.22, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // Pulsing sparkle spots
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const spots = [[0, -0.72], [-0.48, -0.42], [0.48, -0.42]];
    for (const [sx, sy] of spots) {
        const spotAlpha = 0.7 + 0.3 * Math.sin(frame * 0.15 + sx * 5);
        ctx.globalAlpha = spotAlpha;
        ctx.beginPath();
        ctx.arc(sx * sc, sy * sc, sc * 0.1, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // Orbiting particles (world space)
    for (let i = 0; i < 4; i++) {
        const angle = frame * 0.04 + i * (Math.PI / 2);
        const orbitR = sc * 1.8;
        const px = cx + Math.cos(angle) * orbitR;
        const py = (cy + sc * 0.25 - sc * 0.3) + Math.sin(angle) * orbitR * 0.6;
        const sparkAlpha = 0.5 + 0.3 * Math.sin(frame * 0.1 + i);
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = rgba(POWERUP_RAINBOW[(i + rainbowIdx) % POWERUP_RAINBOW.length], sparkAlpha);
        ctx.fill();
    }

    // Power-up type icon floating above
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.6 + 0.3 * Math.sin(frame * 0.08);
    ctx.fillText(def.icon, cx, cy - sc * 1.6);
    ctx.globalAlpha = 1;
}

// ─── Caterpillar ─────────────────────────────────────────────────────────────

/**
 * Draw small "hairs" radiating from segment edge.
 * Uses deterministic angles (seeded by segIdx) so they don't flicker.
 * NO shadowBlur here – pure stroke lines for performance.
 */
function drawHairs(cx, cy, r, color, segIdx) {
    const COUNT   = 9;
    const HAIR    = 4.5;
    const GOLDEN  = 2.399; // golden angle radians

    ctx.strokeStyle = rgba(color, 0.52);
    ctx.lineWidth   = 0.9;
    ctx.lineCap     = 'round';

    for (let i = 0; i < COUNT; i++) {
        const angle = i * GOLDEN + segIdx * 1.1;
        const cos   = Math.cos(angle);
        const sin   = Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(cx + cos * (r - 0.5), cy + sin * (r - 0.5));
        ctx.lineTo(cx + cos * (r + HAIR),  cy + sin * (r + HAIR));
        ctx.stroke();
    }
}

/**
 * Draw one fuzzy segment at pixel coords (cx,cy).
 * Halos are transparent circles (no shadowBlur). Only the HEAD gets
 * a single shadowBlur call.
 */
function drawSegment(cx, cy, color, isHead, dirIdx) {
    const r = isHead ? CELL*0.48 : CELL*0.42;

    // ── Fuzzy halo layers (NO shadowBlur, just alpha circles) ──
    const halos = [[3.0, 0.07],[2.2, 0.10],[1.4, 0.14]];
    for (const [mult, alpha] of halos) {
        ctx.beginPath();
        ctx.arc(cx, cy, r + mult*2.5, 0, Math.PI*2);
        ctx.fillStyle = rgba(color, alpha);
        ctx.fill();
    }

    // ── Main body circle (one shadowBlur only on head) ──
    if (isHead) {
        if (gs.activePowers.length > 0) {
            ctx.shadowColor = POWERUP_TYPES[gs.activePowers[0].type].glow;
            ctx.shadowBlur = 24;
        } else {
            ctx.shadowColor = color;
            ctx.shadowBlur = 16;
        }
    }

    const grad = ctx.createRadialGradient(cx-r*0.32, cy-r*0.32, r*0.08, cx, cy, r);
    grad.addColorStop(0, lighten(color, 0.55));
    grad.addColorStop(0.65, color);
    grad.addColorStop(1, rgba(color, 0.88));

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.fillStyle = grad;
    ctx.fill();

    if (isHead) { ctx.shadowBlur = 0; }

    // Specular shine
    ctx.beginPath();
    ctx.arc(cx - r*0.3, cy - r*0.3, r*0.2, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.fill();

    // Hairs
    drawHairs(cx, cy, r, color, isHead ? 0 : cx * 7 + cy * 13);

    if (isHead) drawFace(cx, cy, r, dirIdx);
}

/** Direction index: 0=right 1=left 2=up 3=down */
const EYE_OFF = {
    0: [[ 0.28,-0.38],[ 0.28, 0.38]],
    1: [[-0.28,-0.38],[-0.28, 0.38]],
    2: [[-0.38,-0.28],[ 0.38,-0.28]],
    3: [[-0.38, 0.28],[ 0.38, 0.28]],
};
const ANT_OFF = {
    0: [[ 0.55,-0.7],[ 0.55, 0.7]],
    1: [[-0.55,-0.7],[-0.55, 0.7]],
    2: [[-0.7,-0.55],[ 0.7,-0.55]],
    3: [[-0.7, 0.55],[ 0.7, 0.55]],
};

function drawFace(cx, cy, r, dirIdx) {
    const eyes = EYE_OFF[dirIdx] || EYE_OFF[0];
    const ants = ANT_OFF[dirIdx] || ANT_OFF[0];

    // Antennae (thin curves, no blur)
    ctx.lineWidth   = 1.4;
    ctx.lineCap     = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.62)';

    for (const [ax, ay] of ants) {
        const ex  = cx + ax*r;
        const ey  = cy + ay*r;
        const mid = { x: cx + ax*r*0.55, y: cy + ay*r*0.55 };
        ctx.beginPath();
        ctx.moveTo(mid.x, mid.y);
        ctx.quadraticCurveTo(ex, ey, ex + ax*r*0.28, ey + ay*r*0.22);
        ctx.stroke();
        // Antenna tip dot (tiny, no blur)
        ctx.beginPath();
        ctx.arc(ex + ax*r*0.28, ey + ay*r*0.22, 2.4, 0, Math.PI*2);
        ctx.fillStyle = '#f9a8d4';
        ctx.fill();
    }

    // Eyes
    for (const [ex, ey] of eyes) {
        const ecx = cx + ex*r;
        const ecy = cy + ey*r;
        // white
        ctx.beginPath();
        ctx.arc(ecx, ecy, 3.8, 0, Math.PI*2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        // pupil
        ctx.beginPath();
        ctx.arc(ecx+0.8, ecy+0.8, 2.0, 0, Math.PI*2);
        ctx.fillStyle = '#1e0933';
        ctx.fill();
        // shine
        ctx.beginPath();
        ctx.arc(ecx-0.5, ecy-0.5, 0.85, 0, Math.PI*2);
        ctx.fillStyle = '#fff';
        ctx.fill();
    }
}

/**
 * Draw smooth connection between adjacent segments.
 * Uses the INTERPOLATED positions (rx/ry) passed in.
 * No shadowBlur — uses lineWidth + alpha for a soft join.
 */
function drawConnections(positions) {
    if (positions.length < 2) return;
    ctx.lineCap = 'round';

    for (let i = 0; i < positions.length-1; i++) {
        const [ax, ay] = positions[i];
        const [bx, by] = positions[i+1];
        const colA = SEG_COLS[i   % SEG_COLS.length];
        const colB = SEG_COLS[(i+1)% SEG_COLS.length];

        const grad = ctx.createLinearGradient(ax, ay, bx, by);
        grad.addColorStop(0, rgba(colA, 0.82));
        grad.addColorStop(1, rgba(colB, 0.82));

        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.strokeStyle = grad;
        ctx.lineWidth   = CELL - 10;
        ctx.stroke();
    }
}

/**
 * Render the full snake using interpolated (smooth) positions.
 * @param {number} progress  0→1 fraction between last tick and now
 */
function drawSnake(progress) {
    const { snake, dir } = gs;
    if (!snake.length) return;

    const dirIdx =
        dir.x === 1 ? 0 : dir.x === -1 ? 1 :
        dir.y === -1 ? 2 : 3;

    // Build interpolated pixel positions for all segments
    const pos = snake.map(s => [
        lerp(s.px, s.x, progress) * CELL + CELL/2,
        lerp(s.py, s.y, progress) * CELL + CELL/2,
    ]);

    // Power-up visual modifiers
    const isGhost = hasPower('ghost');
    const isSpeed = hasPower('speed');
    const isWrap  = hasPower('wrap');

    // Ghost: semi-transparent snake
    if (isGhost) ctx.globalAlpha = 0.55;

    // Speed: golden afterimage halo
    if (isSpeed) {
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = 0.15;
        for (let i = snake.length - 1; i >= 0; i--) {
            const r = i === 0 ? CELL * 0.48 : CELL * 0.42;
            ctx.beginPath();
            ctx.arc(pos[i][0], pos[i][1], r + 4, 0, Math.PI * 2);
            ctx.fillStyle = rgba('#facc15', 0.2);
            ctx.fill();
        }
        ctx.globalAlpha = prevAlpha;
    }

    // 1. Connections (behind everything)
    drawConnections(pos);

    // 2. Segments tail→head so head renders on top
    for (let i = snake.length-1; i >= 0; i--) {
        const col = SEG_COLS[i % SEG_COLS.length];
        drawSegment(pos[i][0], pos[i][1], col, i === 0, dirIdx);
    }

    // Wrap: green pulsing ring on each segment
    if (isWrap) {
        const ringAlpha = 0.25 + 0.15 * Math.sin(gs.frame * 0.1);
        for (let i = 0; i < pos.length; i++) {
            const r = i === 0 ? CELL * 0.48 : CELL * 0.42;
            ctx.beginPath();
            ctx.arc(pos[i][0], pos[i][1], r + 3, 0, Math.PI * 2);
            ctx.strokeStyle = rgba('#34d399', ringAlpha);
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }

    ctx.globalAlpha = 1;
}

// ─── Game Logic ──────────────────────────────────────────────────────────────

function placeFood() {
    const occ = new Set(gs.snake.map(s=>`${s.x},${s.y}`));
    let x, y;
    do { x = rndInt(GRID); y = rndInt(GRID); }
    while (occ.has(`${x},${y}`));
    gs.food = { x, y, mush: rndInt(MUSHROOMS.length) };
}

// ─── Power-Up Logic ─────────────────────────────────────────────────────────

function hasPower(id) {
    return gs.activePowers.some(p => POWERUP_TYPES[p.type].id === id);
}

function recalcSpeedMultiplier() {
    gs.speedMultiplier = hasPower('speed') ? SPEED_MULTIPLIER : 1;
}

function trySpawnPowerup(ts) {
    if (gs.powerup) return;
    if (ts - gs.lastPowerSpawn < POWERUP_SPAWN_INTERVAL) return;
    gs.lastPowerSpawn = ts;
    if (Math.random() > POWERUP_SPAWN_CHANCE) return;
    if (gs.score < 3) return;

    const occ = new Set(gs.snake.map(s => `${s.x},${s.y}`));
    occ.add(`${gs.food.x},${gs.food.y}`);
    let x, y, attempts = 0;
    do { x = rndInt(GRID); y = rndInt(GRID); attempts++; }
    while (occ.has(`${x},${y}`) && attempts < 80);
    if (attempts >= 80) return;

    gs.powerup = { x, y, type: rndInt(POWERUP_TYPES.length), spawnedAt: ts };
}

function updatePowerup(ts) {
    if (gs.powerup && ts - gs.powerup.spawnedAt > POWERUP_DESPAWN_MS) {
        const cx = gs.powerup.x * CELL + CELL / 2;
        const cy = gs.powerup.y * CELL + CELL / 2;
        spawnBurst(cx, cy, 8);
        gs.powerup = null;
    }
}

function updateActivePowers(ts) {
    let changed = false;
    for (let i = gs.activePowers.length - 1; i >= 0; i--) {
        if (ts >= gs.activePowers[i].expiresAt) {
            gs.activePowers.splice(i, 1);
            changed = true;
        }
    }
    if (changed) recalcSpeedMultiplier();
}

function collectPowerup(ts) {
    const pu = gs.powerup;
    const def = POWERUP_TYPES[pu.type];
    const cx = pu.x * CELL + CELL / 2;
    const cy = pu.y * CELL + CELL / 2;

    // Rainbow burst
    for (let i = 0; i < 24; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 3;
        gs.particles.push({
            x: cx, y: cy,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: 2.5 + Math.random() * 3,
            color: POWERUP_RAINBOW[rndInt(POWERUP_RAINBOW.length)],
            life: 1,
            decay: 0.018 + Math.random() * 0.012,
        });
    }

    spawnFloat(cx, cy - CELL, def.icon + ' ' + def.label, def.color);

    // Refresh timer if same type already active, else add
    const existing = gs.activePowers.find(p => p.type === pu.type);
    if (existing) {
        existing.expiresAt = ts + def.duration;
    } else {
        gs.activePowers.push({ type: pu.type, expiresAt: ts + def.duration });
    }

    recalcSpeedMultiplier();
    gs.powerup = null;
}

function buildSnake() {
    const sx = Math.floor(GRID/2);
    const sy = Math.floor(GRID/2);
    return [
        {x:sx,   y:sy, px:sx,   py:sy},
        {x:sx-1, y:sy, px:sx-1, py:sy},
        {x:sx-2, y:sy, px:sx-2, py:sy},
    ];
}

/**
 * Discrete movement step (called every MOVE_MS ms).
 *
 * Smooth trick: instead of unshift+pop, we CASCADE positions backward.
 * Each segment takes the previous position of the segment ahead of it.
 * This gives every segment a correct (px→x) pair to interpolate over.
 */
function tick() {
    if (gs.phase !== 'playing') return;

    const { snake, nextDir, food } = gs;
    gs.dir      = { ...nextDir };
    gs.dirLocked = false;

    // 1. Save all current positions as "previous" BEFORE moving
    for (const s of snake) { s.px = s.x; s.py = s.y; }

    // 2. Compute new head position
    let nhx = snake[0].x + nextDir.x;
    let nhy = snake[0].y + nextDir.y;

    // 3. Collision: walls (wrap if powered)
    if (nhx < 0 || nhx >= GRID || nhy < 0 || nhy >= GRID) {
        if (hasPower('wrap')) {
            nhx = ((nhx % GRID) + GRID) % GRID;
            nhy = ((nhy % GRID) + GRID) % GRID;
        } else {
            die(); return;
        }
    }

    // 4. Collision: self (skip if ghost mode, skip last tail — it cascades)
    if (!hasPower('ghost')) {
        for (let i = 0; i < snake.length - 1; i++) {
            if (snake[i].x === nhx && snake[i].y === nhy) { die(); return; }
        }
    }

    // 5. Check food before cascading
    const ate = nhx === food.x && nhy === food.y;

    // 6. CASCADE: each segment takes position of the one before it
    for (let i = snake.length-1; i > 0; i--) {
        snake[i].x = snake[i-1].x;
        snake[i].y = snake[i-1].y;
    }
    snake[0].x = nhx;
    snake[0].y = nhy;

    // Fix interpolation for wall wrap (prevent lerp streak across board)
    if (Math.abs(snake[0].x - snake[0].px) > 1) snake[0].px = snake[0].x;
    if (Math.abs(snake[0].y - snake[0].py) > 1) snake[0].py = snake[0].y;

    // 7. Eat food → grow + score
    if (ate) {
        gs.score++;
        elScore.textContent = gs.score;
        if (gs.score > gs.best) {
            gs.best = gs.score;
            elBest.textContent = gs.best;
            saveBest(gs.best);
        }
        const cx = food.x * CELL + CELL/2;
        const cy = food.y * CELL + CELL/2;
        spawnBurst(cx, cy, 16);
        spawnFloat(cx, cy - CELL);

        // Grow: duplicate tail segment with same prev so it appears in place
        const tail = snake[snake.length-1];
        snake.push({ x:tail.x, y:tail.y, px:tail.px, py:tail.py });

        placeFood();
    }

    // 8. Check power-up collection
    if (gs.powerup && snake[0].x === gs.powerup.x && snake[0].y === gs.powerup.y) {
        collectPowerup(performance.now());
    }
}

function die() {
    gs.phase = 'dead';
    gs.activePowers    = [];
    gs.speedMultiplier = 1;
    gs.powerup         = null;
    const head = gs.snake[0];
    spawnBurst(head.x*CELL+CELL/2, head.y*CELL+CELL/2, 35);

    canvasWrap.classList.remove('shaking');
    void canvasWrap.offsetWidth;
    canvasWrap.classList.add('shaking');
    setTimeout(() => canvasWrap.classList.remove('shaking'), 480);

    setTimeout(() => showOverlay(
        '💔 Oh No! 💔',
        `Score: ${gs.score}${gs.score > 0 ? ' — great run! 🌸' : ' — try again! ✨'}`,
        'Try Again 🍄'
    ), 620);
}

function startGame() {
    hideOverlay();
    gs.phase      = 'playing';
    gs.snake      = buildSnake();
    gs.dir        = {x:1,y:0};
    gs.nextDir    = {x:1,y:0};
    gs.score      = 0;
    gs.particles  = [];
    gs.floatTexts = [];
    gs.dirLocked  = false;
    gs.lastTick   = performance.now();
    gs.powerup        = null;
    gs.activePowers   = [];
    gs.lastPowerSpawn = 0;
    gs.speedMultiplier = 1;
    elScore.textContent = '0';
    placeFood();
}

// ─── Input ──────────────────────────────────────────────────────────────────

function keyToDir(k) {
    if (k==='ArrowRight'||k==='d'||k==='D') return {x: 1,y: 0};
    if (k==='ArrowLeft' ||k==='a'||k==='A') return {x:-1,y: 0};
    if (k==='ArrowUp'   ||k==='w'||k==='W') return {x: 0,y:-1};
    if (k==='ArrowDown' ||k==='s'||k==='S') return {x: 0,y: 1};
    return null;
}

document.addEventListener('keydown', e => {
    const { phase, dir } = gs;

    if ((e.key==='Enter'||e.key===' ') && phase!=='playing' && phase!=='paused') {
        e.preventDefault(); startGame(); return;
    }
    if ((e.key==='p'||e.key==='P'||e.key==='Escape') && phase==='playing') {
        e.preventDefault();
        gs.phase = 'paused';
        showOverlay('⏸ Paused 🌸','Your garden is waiting…','Continue ✨');
        return;
    }
    if ((e.key==='p'||e.key==='P'||e.key==='Escape'||e.key===' ') && phase==='paused') {
        e.preventDefault();
        hideOverlay();
        gs.phase = 'playing';
        gs.lastTick = performance.now();
        return;
    }
    if (e.key===' ' && phase==='playing') {
        e.preventDefault();
        gs.phase = 'paused';
        showOverlay('⏸ Paused 🌸','Your garden is waiting…','Continue ✨');
        return;
    }

    if (phase!=='playing' || gs.dirLocked) return;
    const nd = keyToDir(e.key);
    if (!nd) return;
    if (nd.x !== 0 && nd.x === -dir.x) return;
    if (nd.y !== 0 && nd.y === -dir.y) return;
    e.preventDefault();
    gs.nextDir   = nd;
    gs.dirLocked = true;
});

elBtn.addEventListener('click', () => {
    if (gs.phase==='paused') {
        hideOverlay(); gs.phase='playing'; gs.lastTick=performance.now();
    } else { startGame(); }
});

// ─── Power-Up HUD ───────────────────────────────────────────────────────────

function drawPowerupHUD(ts) {
    if (gs.activePowers.length === 0) return;

    const barW = 60;
    const barH = 6;
    const rowH = 22;
    const startX = 8;
    const startY = 8;

    for (let i = 0; i < gs.activePowers.length; i++) {
        const pw = gs.activePowers[i];
        const def = POWERUP_TYPES[pw.type];
        const remaining = Math.max(0, pw.expiresAt - ts);
        const fraction = remaining / def.duration;
        const y = startY + i * (rowH + 4);

        // Background pill
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.roundRect(startX, y, barW + 34, rowH, 6);
        ctx.fill();

        // Icon
        ctx.font = '12px system-ui';
        ctx.textAlign = 'left';
        ctx.fillStyle = def.color;
        ctx.fillText(def.icon, startX + 4, y + 15);

        // Label
        ctx.font = 'bold 9px system-ui';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(def.label, startX + 20, y + 14);

        // Timer bar background
        const bx = startX + 20;
        const by = y + rowH - barH - 2;
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.roundRect(bx, by, barW, barH, 3);
        ctx.fill();

        // Timer bar fill (flashes when low)
        let barAlpha = 1;
        if (fraction < 0.25) barAlpha = 0.5 + 0.5 * Math.sin(gs.frame * 0.3);
        ctx.fillStyle = rgba(def.color, 0.8 * barAlpha);
        ctx.beginPath();
        ctx.roundRect(bx, by, barW * fraction, barH, 3);
        ctx.fill();
    }
}

// ─── Game Loop ───────────────────────────────────────────────────────────────

function gameLoop(ts) {
    gs.frame++;

    // Power-up lifecycle
    if (gs.phase === 'playing') {
        trySpawnPowerup(ts);
        updatePowerup(ts);
        updateActivePowers(ts);
    }

    // Discrete movement tick (speed-multiplier aware)
    const effMS = MOVE_MS * gs.speedMultiplier;
    if (gs.phase === 'playing' && ts - gs.lastTick >= effMS) {
        gs.lastTick = ts;
        tick();
    }

    // Smooth interpolation factor (0→1 between ticks)
    const progress = gs.phase === 'playing'
        ? Math.min(1, (ts - gs.lastTick) / effMS)
        : 1;

    updateParticles();
    updateFloats();

    // ── Draw ──
    drawBoard();
    drawParticles();

    // Food mushroom
    const f = gs.food;
    drawMushroom(f.x*CELL+CELL/2, f.y*CELL+CELL/2, f.mush, gs.frame);

    // Power-up mushroom
    if (gs.powerup) {
        const pu = gs.powerup;
        drawPowerupMushroom(pu.x*CELL+CELL/2, pu.y*CELL+CELL/2, pu.type, gs.frame, ts);
    }

    if (gs.snake.length) drawSnake(progress);
    drawFloats();
    drawPowerupHUD(ts);

    requestAnimationFrame(gameLoop);
}

// ─── Init ────────────────────────────────────────────────────────────────────

function init() {
    gs.best = loadBest();
    elBest.textContent = gs.best;
    canvas.setAttribute('tabindex','0');
    showOverlay('🍄 Dreamy Garden 🍄','Guide your fuzzy caterpillar and eat the mushrooms!','Start Dreaming ✨');
    requestAnimationFrame(gameLoop);
}

init();
