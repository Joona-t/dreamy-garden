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

function spawnFloat(cx, cy) { gs.floatTexts.push({x:cx, y:cy, life:1}); }

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
        ctx.fillStyle = '#f9a8d4';
        ctx.fillText('+1', t.x, t.y);
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
    if (isHead) { ctx.shadowColor = color; ctx.shadowBlur = 16; }

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

    // 1. Connections (behind everything)
    drawConnections(pos);

    // 2. Segments tail→head so head renders on top
    for (let i = snake.length-1; i >= 0; i--) {
        const col = SEG_COLS[i % SEG_COLS.length];
        drawSegment(pos[i][0], pos[i][1], col, i === 0, dirIdx);
    }
}

// ─── Game Logic ──────────────────────────────────────────────────────────────

function placeFood() {
    const occ = new Set(gs.snake.map(s=>`${s.x},${s.y}`));
    let x, y;
    do { x = rndInt(GRID); y = rndInt(GRID); }
    while (occ.has(`${x},${y}`));
    gs.food = { x, y, mush: rndInt(MUSHROOMS.length) };
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
    const nhx = snake[0].x + nextDir.x;
    const nhy = snake[0].y + nextDir.y;

    // 3. Collision: walls
    if (nhx < 0 || nhx >= GRID || nhy < 0 || nhy >= GRID) { die(); return; }

    // 4. Collision: self (skip last tail — it will cascade away)
    for (let i = 0; i < snake.length - 1; i++) {
        if (snake[i].x === nhx && snake[i].y === nhy) { die(); return; }
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
}

function die() {
    gs.phase = 'dead';
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

// ─── Game Loop ───────────────────────────────────────────────────────────────

function gameLoop(ts) {
    gs.frame++;

    // Discrete movement tick
    if (gs.phase === 'playing' && ts - gs.lastTick >= MOVE_MS) {
        gs.lastTick = ts;
        tick();
    }

    // Smooth interpolation factor (0→1 between ticks)
    const progress = gs.phase === 'playing'
        ? Math.min(1, (ts - gs.lastTick) / MOVE_MS)
        : 1;

    updateParticles();
    updateFloats();

    // ── Draw ──
    drawBoard();
    drawParticles();

    // Food mushroom
    const f = gs.food;
    drawMushroom(f.x*CELL+CELL/2, f.y*CELL+CELL/2, f.mush, gs.frame);

    if (gs.snake.length) drawSnake(progress);
    drawFloats();

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
