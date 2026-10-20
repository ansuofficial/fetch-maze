(() => {
/* ---------- Settings ---------- */
// Levels grow bigger and twistier as you go. Each tier holds five levels, and values blend from its first level to its last.
// size: cells per side. twist: how often the carver keeps digging from its newest cell (higher means longer, windier halls).
// straight: how often a hall keeps its heading (higher means longer straight runs).
const TIERS = [
  { tag: "Easy",   sizes: [7, 8, 9, 10, 11],    twist: [0.35, 0.6],  straight: [0.5, 0.35] },
  { tag: "Medium", sizes: [12, 13, 14, 15, 16], twist: [0.65, 0.85], straight: [0.3, 0.15] },
  { tag: "Hard",   sizes: [17, 18, 19, 21, 23], twist: [0.9, 1],     straight: [0.1, 0] }
];
const PATH = [1.7, 4.8];    // shortest allowed solution, in maze widths, on the first level and on the last
const MOVE = { step: 0.13, delay: 0.3, every: 0.16 };   // a cell takes `step` seconds. Holding waits `delay`, then steps every `every` seconds.
const COLLARS = ["blue", "green", "purple", "pink", "teal"];   // each name matches a --collar-* color in the CSS
const BOARD = { max: 680, cellMax: 56, pad: 18, gap: 16, stats: 34 };   // board limits, padding inside the card, the stats row under it
const PAD = { size: 148, gap: 24, reach: 20, dead: 12 };   // joystick: size, space from the board, knob travel, dead zone (pixels)
const DRAG = 18;        // pixels a finger travels on a touch screen before a drag counts
const T = { intro: 0.5, reveal: 3.2, slide: 0.45, shake: 0.42, flash: 0.45, pop: 0.45, sweep: 0.8, cheer: 1.15 };   // effect timings in seconds
const SAVE = "fetch-maze-v1";   // the browser storage key for settings and best times
const TAU = Math.PI * 2;
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];   // directions: 0 up, 1 right, 2 down, 3 left. Cells keep open sides as bits 1, 2, 4, 8.

const lerp = (a, b, t) => a + (b - a) * t;
const LEVELS = TIERS.flatMap((tier, ti) => tier.sizes.map((size, i) => {
  const f = i / (tier.sizes.length - 1);
  return { tier: ti, tag: tier.tag, size, twist: lerp(tier.twist[0], tier.twist[1], f), straight: lerp(tier.straight[0], tier.straight[1], f) };
}));
LEVELS.forEach((lv, i) => {
  const p = i / (LEVELS.length - 1);
  lv.n = i + 1;
  lv.minPath = Math.round(lv.size * lerp(PATH[0], PATH[1], p));
});

/* ---------- Setup ---------- */
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d"), stage = $("stage"), hud = $("hud"), tip = $("tip"), padEl = $("pad"), knob = $("knob");
const chevs = [...padEl.querySelectorAll(".chev")];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const touchFirst = matchMedia("(pointer: coarse)").matches;

const css = getComputedStyle(document.documentElement);
const tok = n => css.getPropertyValue("--" + n).trim();
const C = {
  cream: tok("cream"), floor: tok("floor"), card: tok("card"), ink: tok("ink"), hair: tok("hair"), orange: tok("orange"), red: tok("red"),
  shadowInk: tok("shadow-ink"), shadowSoft: tok("shadow-soft"), shadowTight: tok("shadow-tight")
};
const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mix = (a, b, t) => "rgb(" + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",") + ")";
const rgba = (c, a) => "rgba(" + c.join(",") + "," + a + ")";
const CREAM = rgb(C.cream), CARD = rgb(C.card), INK = rgb(C.ink), HAIR = rgb(C.hair), ORANGE = rgb(C.orange);

const rand = n => Math.random() * n | 0;
const clamp01 = v => Math.min(1, Math.max(0, v));
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(2 - 2 * t, 3) / 2;

// Everything is kept in one object under SAVE: level, collar, sound, joystick and the best time for each level.
let saved = {};
try { saved = JSON.parse(localStorage.getItem(SAVE)) || {}; } catch (e) { /* storage blocked: play without saving */ }
function store(k, v) {
  if (v === undefined) return k in saved ? String(saved[k]) : null;
  saved[k] = v;
  try { localStorage.setItem(SAVE, JSON.stringify(saved)); } catch (e) { /* ignore */ }
  return null;
}
const bestTime = n => parseInt(store("best-" + n) || "0", 10);

/* ---------- State ---------- */
// Everything the game knows lives here. step() changes it, draw() only reads it.
const G = {
  mode: "start",          // start, play, paused, won (celebrating), done (finish card)
  level: Math.min(LEVELS.length - 1, Math.max(0, (parseInt(store("level"), 10) || 1) - 1)),   // index into LEVELS
  collar: Math.max(0, COLLARS.indexOf(store("color"))),
  sound: store("sound") !== "off",
  joystick: store("joystick") === "on",   // off unless the player turns it on
  maze: null,             // { cols, rows, cells, order, start, goal }
  reveal: null,           // start screen only: the walls still standing while the maze draws itself
  at: 0, from: 0, t: 0, dir: -1,   // the dog steps from cell `from` to cell `at`, heading `dir`, while t runs from 0 to 1
  next: -1,               // a press made during a step, taken as soon as the step ends
  held: -1, holdT: 0,     // a direction held down, and seconds until its next step
  face: 1, tilt: 0, gait: 0, walk: 0,   // the dog: facing (1 right, -1 left), lean on up and down steps, walk cycle, how much it walks
  trail: [], route: [],   // every cell visited in order, and the current path back to the start
  started: false, time: 0, moves: 0, prevBest: 0, newBest: false, firstSolve: false, hinted: false,
  intro: 1, fromStart: false, slideY: 0, slideT: 1, shake: 0, flash: null, pop: 0, cheer: 0, doneAt: 0,
  parts: [], rings: []
};

function applyCollar() {   // the collar and the trail follow the chosen color
  const hex = tok("collar-" + COLLARS[G.collar]);
  C.collar = hex; C.trail = mix(CARD, rgb(hex), .16);
  stage.style.setProperty("--collar", hex);
}

/* ---------- Maze ---------- */
const isOpen = (m, c, d) => (m.cells[c] >> d & 1) === 1;
const toward = (m, c, d) => c + DX[d] + DY[d] * m.cols;

// Growing-tree carver. Every cell links to every other by exactly one path, so a maze is always solvable.
function carve(cols, rows, twist, straight) {
  const n = cols * rows, cells = new Uint8Array(n), seen = new Uint8Array(n), came = new Int8Array(n).fill(-1);
  const order = [], first = rand(n), active = [first];
  seen[first] = 1;
  while (active.length) {
    const i = Math.random() < twist ? active.length - 1 : rand(active.length);
    const c = active[i], x = c % cols, y = (c / cols) | 0, free = [];
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[ny * cols + nx]) free.push(d);
    }
    if (!free.length) { active.splice(i, 1); continue; }
    let d = free[rand(free.length)];
    if (free.includes(came[c]) && Math.random() < straight) d = came[c];
    const next = c + DX[d] + DY[d] * cols;
    cells[c] |= 1 << d;
    cells[next] |= 1 << ((d + 2) % 4);
    seen[next] = 1; came[next] = d; active.push(next);
    order.push(c, d);   // kept so the start screen can replay the carving
  }
  return { cols, rows, cells, order };
}

// Steps on the path from start to goal (breadth-first search).
function pathLength(m) {
  const dist = new Int32Array(m.cells.length).fill(-1), queue = [m.start];
  dist[m.start] = 0;
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h];
    for (let d = 0; d < 4; d++) {
      if (!isOpen(m, c, d)) continue;
      const n = toward(m, c, d);
      if (dist[n] < 0) { dist[n] = dist[c] + 1; queue.push(n); }
    }
  }
  return dist[m.goal];
}

function newMaze(animate) {
  const lv = LEVELS[G.level];
  let m;
  for (let tries = 0; tries < 40; tries++) {   // carve again if the solution is too short for the level
    m = carve(lv.size, lv.size, lv.twist, lv.straight);
    const corners = [0, m.cols - 1, (m.rows - 1) * m.cols, m.rows * m.cols - 1], k = rand(4);
    m.start = corners[k]; m.goal = corners[3 - k];   // opposite corners
    if (pathLength(m) >= lv.minPath) break;
  }
  G.maze = m;
  G.reveal = animate && !reduceMotion ? { bits: new Uint8Array(m.cells.length), k: 0, t: 0 } : null;
  layout();
}

/* ---------- Layout ---------- */
let W = 0, H = 0, DPR = 1;
const B = { x: 0, y: 0, size: 0, cell: 0, ox: 0, oy: 0, wall: 2, r: 20 };   // board geometry in CSS pixels
const ROOM = 72;                                     // margin around the cached board for its shadow
const boardImg = document.createElement("canvas");   // the board card and its shadow, painted once per layout

// With the joystick on, it sits in the right margin when there is room, otherwise under the stats.
// The start screen keeps the board where play will put it, except that it is centered without the joystick below.
function layout() {
  const n = G.maze ? G.maze.cols : LEVELS[G.level].size;
  const below = BOARD.gap + BOARD.stats, room = G.joystick ? PAD.gap + PAD.size : 0;
  const limit = Math.min(BOARD.max, n * BOARD.cellMax + BOARD.pad * 2);   // small mazes get a smaller board
  const beside = Math.min(limit, W - 2 * (16 + room), H - 32 - below);
  const under = Math.min(limit, W - 32, H - 32 - below - room);
  const side = G.joystick && beside >= under;
  const outer = Math.max(140, side ? beside : under);
  const inset = outer < 440 ? 12 : BOARD.pad;
  B.cell = Math.max(6, Math.floor((outer - inset * 2) / n));
  B.size = B.cell * n + inset * 2;
  B.x = Math.round((W - B.size) / 2);
  B.y = Math.round((H - B.size - below - (side || G.mode === "start" ? 0 : room)) / 2);
  B.ox = B.x + inset; B.oy = B.y + inset;
  B.wall = Math.min(3.5, Math.max(1.5, B.cell * .08));
  B.r = Math.min(22, B.size * .045);
  hud.style.left = B.x + 6 + "px";
  hud.style.width = B.size - 12 + "px";
  hud.style.top = B.y + B.size + BOARD.gap + "px";
  tip.style.left = B.x + "px";
  tip.style.width = B.size + "px";
  tip.style.top = B.y + B.size + below + 8 + "px";
  padEl.style.left = (side ? B.x + B.size + PAD.gap : Math.round((W - PAD.size) / 2)) + "px";
  padEl.style.top = (side ? B.y + B.size - PAD.size : B.y + B.size + below + PAD.gap) + "px";
  stage.style.setProperty("--pad", PAD.size + "px");
  stage.style.setProperty("--lift", -below / 2 + "px");   // keeps the start buttons on the board's center
  stage.style.setProperty("--ldw", Math.max(16, Math.min(22, Math.floor((W - 72) / LEVELS.length))) + "px");
  paintBoard();
}

function paintBoard() {
  const s = B.size + ROOM * 2, b = boardImg.getContext("2d");
  boardImg.width = Math.round(s * DPR); boardImg.height = Math.round(s * DPR);
  b.setTransform(DPR, 0, 0, DPR, 0, 0);
  b.fillStyle = C.card;
  b.shadowColor = C.shadowSoft; b.shadowBlur = 48 * DPR; b.shadowOffsetY = 18 * DPR;
  rr(b, ROOM, ROOM, B.size, B.size, B.r); b.fill();
  b.shadowColor = C.shadowTight; b.shadowBlur = 2 * DPR; b.shadowOffsetY = DPR;
  b.fill();
  b.shadowColor = "transparent";
  b.lineWidth = 1; b.strokeStyle = C.hair;
  rr(b, ROOM + .5, ROOM + .5, B.size - 1, B.size - 1, B.r - .5); b.stroke();
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = stage.clientWidth; H = stage.clientHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  layout();
}

/* ---------- Game flow ---------- */
function toStart() {
  releaseInputs();
  G.mode = "start";
  G.parts = []; G.rings = []; G.shake = 0; G.flash = null;
  newMaze(true);
  $("hud").hidden = true; padEl.hidden = true; $("pause").hidden = true; $("done").hidden = true; $("start").hidden = false;
  tip.hidden = true; shown.tip = false;
  renderStart();
}

function startRound() {
  const fromStart = G.mode === "start", y0 = B.y, lv = LEVELS[G.level];
  releaseInputs();
  G.mode = "play";
  if (fromStart) { G.reveal = null; layout(); }   // play the maze that was drawing itself behind the Start button
  else newMaze(false);
  const m = G.maze;
  Object.assign(G, {
    at: m.start, from: m.start, t: 0, dir: -1, next: -1,
    face: cx(m.goal) >= cx(m.start) ? 1 : -1, tilt: 0, walk: 0,   // the dog starts out facing its ball
    trail: [m.start], route: [m.start], started: false, time: 0, moves: 0,
    intro: 0, fromStart, slideY: fromStart ? y0 - B.y : 0, slideT: 0, shake: 0, flash: null, pop: 0, cheer: 0, parts: [], rings: []
  });
  const r0 = pieceR(), r1 = Math.max(30, B.cell * 1.6);
  ring(cx(m.start), cy(m.start), C.collar, r0, r1, .7, .15);   // here you are
  ring(cx(m.goal), cy(m.goal), C.orange, r0, r1, .7, .35);     // and here is the ball
  $("start").hidden = true; $("pause").hidden = true; $("done").hidden = true; $("hud").hidden = false; padEl.hidden = !G.joystick;
  setText("sLevel", "Level " + lv.n); setText("sTag", lv.tag);
  updateHud();
  sfx.start();
}

function advance() {   // after a solve, the next level is the default
  if (G.level < LEVELS.length - 1) { G.level++; store("level", String(G.level + 1)); }
}

function setPaused(p) {
  if (G.mode !== (p ? "play" : "paused")) return;
  if (p) releaseInputs();
  G.mode = p ? "paused" : "play";
  $("pause").hidden = !p;
}

function setJoystick(on) {   // can change at any time, even mid-round
  if (on === G.joystick) return;
  releaseInputs();
  const y0 = B.y;
  G.joystick = on;
  store("joystick", on ? "on" : "off");
  layout();
  if (G.mode !== "start") { G.slideY = y0 - B.y; G.slideT = 0; }   // the board glides to make room
  padEl.hidden = !on || G.mode === "start" || G.mode === "done";
  renderJoystick();
  updateHud();
  sfx.tap();
}

function win() {
  const m = G.maze, lv = LEVELS[G.level];
  releaseInputs();
  G.mode = "won"; G.dir = -1; G.from = G.at; G.t = 0; G.cheer = 0;
  G.prevBest = bestTime(lv.n);
  G.firstSolve = !G.prevBest;
  G.newBest = G.firstSolve || G.time < G.prevBest;
  if (G.newBest) store("best-" + lv.n, String(Math.round(G.time)));
  const x = cx(m.goal), y = cy(m.goal);
  if (!reduceMotion) G.pop = T.pop;
  burst(x, y, [C.orange, C.orange, C.collar], 36, 170 + B.cell * 3);
  ring(x, y, C.orange, pieceR(), B.size * .16, .6);
  ring(x, y, C.collar, pieceR(), B.size * .24, .75, .08);
  ring(x, y, C.orange, pieceR(), B.size * .32, .9, .16);
  updateHud();
  sfx.win(G.newBest);
}

function showFinish() {
  const lv = LEVELS[G.level], el = $("rBest");
  G.mode = "done"; G.doneAt = performance.now();
  $("rSub").textContent = `Level ${lv.n} · ${lv.tag} · ${lv.size} × ${lv.size}`;
  $("rTime").textContent = fmt(G.time);
  $("rMoves").textContent = G.moves.toLocaleString();
  if (G.firstSolve) { el.className = "badge"; el.textContent = `Level ${lv.n} solved`; }
  else if (G.newBest) { el.className = "badge"; el.textContent = "New best time"; }
  else { el.className = "note"; el.textContent = `Best time ${fmt(G.prevBest)}`; }
  $("nextBtn").textContent = G.level < LEVELS.length - 1 ? "Next level" : "New maze";
  $("hud").hidden = true; padEl.hidden = true; tip.hidden = true; shown.tip = false; $("done").hidden = false;
}

function pickLevel(n) {
  n = Math.max(0, Math.min(LEVELS.length - 1, n));
  if (n === G.level || G.mode !== "start") return;
  const hadFocus = levelDots.includes(document.activeElement);
  G.level = n;
  store("level", String(n + 1));
  renderStart();
  newMaze(true);   // the faint maze redraws at the new level's size
  if (hadFocus) levelDots[n].focus();
  sfx.tap();
}

function cycleCollar() {
  G.collar = (G.collar + 1) % COLLARS.length;
  store("color", COLLARS[G.collar]);
  applyCollar(); renderStart(); sfx.tap();
}

function toggleSound() {
  G.sound = !G.sound;
  store("sound", G.sound ? "on" : "off");
  renderSound();
  sfx.tap();   // only heard when sound just came on
}

/* ---------- Moving the dog ---------- */
// One press is one cell. The dog never moves on its own: holding keeps stepping at a calm pace,
// and letting go stops it at the next cell. Inputs call press() or hold(); draw() shows the result.
function press(d) {
  if (G.mode !== "play") return;
  if (G.dir >= 0) { G.next = d; return; }   // mid-step: take it as soon as this step ends
  if (!isOpen(G.maze, G.at, d)) return bump(d);
  if (!G.started) { G.started = true; G.hinted = true; }   // the clock starts on the first move
  go(d);
}

function go(d) {
  G.dir = d; G.from = G.at; G.at = toward(G.maze, G.at, d); G.t = 0;
  if (d === 1 || d === 3) G.face = d === 1 ? 1 : -1;   // the dog turns to face left or right
}

function arrive() {
  const m = G.maze, c = G.at, r = G.route;
  G.moves++;
  G.trail.push(c);
  if (r.length > 1 && r[r.length - 2] === c) r.pop(); else r.push(c);   // stepping back shortens the route
  G.dir = -1; G.from = c; G.t = 0;
  if (c === m.goal) return win();
  sfx.step();
  if (G.next >= 0) { const d = G.next; G.next = -1; press(d); }
}

function bump(d) {
  G.flash = { c: G.at, d, life: T.flash };
  if (d === 1 || d === 3) G.face = d === 1 ? 1 : -1;   // it looks at the wall it bumped
  if (!reduceMotion) G.shake = T.shake;
  sfx.bump();
}

/* ---------- Effects ---------- */
function burst(x, y, colors, n, speed) {
  if (reduceMotion) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, sp = speed * (.3 + Math.random() * .7);
    G.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * .3, life: .6 + Math.random() * .5, r: 1.6 + Math.random() * 2, color: colors[i % colors.length] });
  }
}

function ring(x, y, color, r0, r1, life, delay = 0) {
  G.rings.push({ x, y, color, r0, r1, life, max: life, delay });
}

/* ---------- Sound ---------- */
// Small synthesized sounds, so there are no files to load. Nothing plays until the player presses something.
let audio = null, out = null;
function ac() {
  if (!G.sound) return null;
  try {
    if (!audio) {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      const comp = audio.createDynamicsCompressor();
      out = audio.createGain(); out.gain.value = .5;
      out.connect(comp); comp.connect(audio.destination);
    }
    if (audio.state === "suspended") audio.resume();
    return audio;
  } catch (e) { return null; }
}

function tone(freq, { at = 0, len = .15, type = "sine", vol = .1, bend = 1 } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + at, osc = a.createOscillator(), env = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (bend !== 1) osc.frequency.exponentialRampToValueAtTime(freq * bend, t + len);
  env.gain.setValueAtTime(.0001, t);
  env.gain.exponentialRampToValueAtTime(vol, t + .006);
  env.gain.exponentialRampToValueAtTime(.0001, t + len);
  osc.connect(env); env.connect(out);
  osc.start(t); osc.stop(t + len + .03);
}

const sfx = {
  step: () => tone(G.moves % 2 ? 540 : 500, { len: .07, vol: .045, bend: .7 }),   // a soft tick for each cell
  bump: () => { tone(170, { len: .18, type: "triangle", vol: .16, bend: .55 }); tone(85, { len: .2, vol: .12, bend: .8 }); },
  start: () => { tone(784, { len: .2, vol: .06 }); tone(1175, { at: .1, len: .28, vol: .06 }); },
  tap: () => tone(1320, { len: .05, vol: .035, bend: .8 }),
  win: best => {   // a rising chime, plus a sparkle for a best time
    [1047, 1319, 1568, 2093].forEach((f, i) => { tone(f, { at: i * .08, len: .55, vol: .075 }); tone(f * 2, { at: i * .08, len: .3, vol: .018 }); });
    if (best) [2637, 3136, 3951].forEach((f, i) => tone(f, { at: .42 + i * .06, len: .35, vol: .03 }));
  }
};

/* ---------- Update ---------- */
function step(dt) {
  if (G.mode === "paused") return;
  G.intro = Math.min(1, G.intro + dt / T.intro);
  G.slideT = Math.min(1, G.slideT + dt / T.slide);
  G.shake = Math.max(0, G.shake - dt);
  G.pop = Math.max(0, G.pop - dt);
  if (G.flash && (G.flash.life -= dt) <= 0) G.flash = null;

  if (G.reveal) {   // start screen: replay the carving, a few walls at a time
    const r = G.reveal, m = G.maze, total = m.order.length / 2;
    r.t = Math.min(1, r.t + dt / T.reveal);
    for (const until = Math.round(easeInOut(r.t) * total); r.k < until; r.k++) {
      const c = m.order[r.k * 2], d = m.order[r.k * 2 + 1];
      r.bits[c] |= 1 << d;
      r.bits[toward(m, c, d)] |= 1 << ((d + 2) % 4);
    }
    if (r.t >= 1) G.reveal = null;
  }

  if (G.mode === "play") {
    if (G.started) G.time += dt * 1000;
    if (G.dir >= 0 && (G.t += dt / MOVE.step) >= 1) arrive();
    if (G.held >= 0 && G.mode === "play") {   // a held direction steps again once it is due and the way is open
      G.holdT -= dt;
      if (G.holdT <= 0 && G.dir < 0 && isOpen(G.maze, G.at, G.held)) { go(G.held); G.holdT = MOVE.every; }
    }
  }
  if (G.mode === "won" || G.mode === "done") G.cheer += dt;
  if (G.mode === "won" && G.cheer >= T.cheer) showFinish();

  // The dog's legs, nod and lean follow its movement, easing in and out so steps blend together
  const moving = G.dir >= 0, lean = G.dir === 0 ? 1 : G.dir === 2 ? -1 : 0;
  G.walk += ((moving ? 1 : 0) - G.walk) * Math.min(1, dt * (moving ? 14 : 6));
  G.gait += dt * TAU / (MOVE.step * 2.4) * G.walk;
  G.tilt += (lean - G.tilt) * Math.min(1, dt * 10);

  const damp = Math.pow(.08, dt);
  for (const p of G.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= damp; p.vy = p.vy * damp + 420 * dt; p.life -= dt; }
  for (const o of G.rings) { if (o.delay > 0) o.delay -= dt; else o.life -= dt; }
  G.parts = G.parts.filter(p => p.life > 0);
  G.rings = G.rings.filter(o => o.life > 0);
}

/* ---------- Rendering ---------- */
const cx = c => B.ox + (c % G.maze.cols + .5) * B.cell;
const cy = c => B.oy + (((c / G.maze.cols) | 0) + .5) * B.cell;
const pieceR = () => Math.min(20, B.cell * .3);   // about the size of the dog's body, for rings

function dogPos() {
  const f = G.dir >= 0 ? 1 - (1 - G.t) * (1 - G.t) : 0;   // each step starts quick and settles softly
  return { x: cx(G.from) + (cx(G.at) - cx(G.from)) * f, y: cy(G.from) + (cy(G.at) - cy(G.from)) * f };
}

function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// All walls as one path: the top and left edges, then each cell's right and bottom sides.
function drawWalls(bits, color, width) {
  const m = G.maze, s = B.cell, x0 = B.ox, y0 = B.oy;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + m.rows * s); ctx.lineTo(x0, y0); ctx.lineTo(x0 + m.cols * s, y0);
  for (let y = 0; y < m.rows; y++) {
    for (let x = 0; x < m.cols; x++) {
      const v = bits[y * m.cols + x], px = x0 + x * s, py = y0 + y * s;
      if (!(v & 2)) { ctx.moveTo(px + s, py); ctx.lineTo(px + s, py + s); }
      if (!(v & 4)) { ctx.moveTo(px, py + s); ctx.lineTo(px + s, py + s); }
    }
  }
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.stroke();
}

// A line through the centers of the first `count` cells, ending at `tail` (usually the dog).
function strokeCells(cells, count, tail, color, width) {
  if (!count) return;
  ctx.beginPath();
  ctx.moveTo(cx(cells[0]), cy(cells[0]));
  for (let i = 1; i < count; i++) ctx.lineTo(cx(cells[i]), cy(cells[i]));
  ctx.lineTo(tail.x, tail.y);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.stroke();
}

// A soft, wide cream patch at the board's center, so the start controls sit on a quiet spot.
function clearing(alpha) {
  if (alpha <= 0) return;
  const r = Math.max(B.size * .42, 170);
  ctx.save();
  ctx.translate(B.x + B.size / 2, B.y + B.size / 2);
  ctx.scale(1.3, 1);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, rgba(CREAM, .97 * alpha)); g.addColorStop(.6, rgba(CREAM, .8 * alpha)); g.addColorStop(1, rgba(CREAM, 0));
  ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

/*__DOG__*/

function draw(now) {
  const m = G.maze;
  ctx.fillStyle = C.cream; ctx.fillRect(0, 0, W, H);
  if (!m) return;
  if (G.mode === "start") {
    drawWalls(G.reveal ? G.reveal.bits : m.cells, C.hair, Math.max(1, B.wall * .75));
    clearing(1);
    return;
  }

  const k = easeOut(G.intro), s = B.cell, won = G.mode === "won" || G.mode === "done";
  const shakeX = G.shake > 0 ? Math.sin((T.shake - G.shake) * TAU * 8) * Math.min(7, B.size * .012) * Math.pow(G.shake / T.shake, 1.5) : 0;
  ctx.save();
  ctx.translate(shakeX, G.slideY * (1 - easeOut(G.slideT)));   // the board glides when the layout changes

  ctx.globalAlpha = k;
  ctx.drawImage(boardImg, B.x - ROOM, B.y - ROOM, B.size + ROOM * 2, B.size + ROOM * 2);
  if (G.mode === "paused") { ctx.restore(); return; }   // the maze hides while paused, so the clock stays fair

  // Start pad, explored halls, and the current route
  ctx.fillStyle = C.floor;
  rr(ctx, cx(m.start) - s * .36, cy(m.start) - s * .36, s * .72, s * .72, s * .2); ctx.fill();
  const p = dogPos(), r = G.route;
  strokeCells(G.trail, G.trail.length, p, C.trail, Math.min(30, s * .42));
  const backing = G.dir >= 0 && r.length > 1 && G.at === r[r.length - 2];
  strokeCells(r, backing ? r.length - 1 : r.length, p, C.collar, Math.min(6, Math.max(2, s * .1)));

  // Solved: the route lights up from start to goal
  if (won) {
    const f = (reduceMotion ? 1 : easeOut(clamp01(G.cheer / T.sweep))) * (r.length - 1), i = Math.floor(f);
    const a = r[i], b = r[Math.min(i + 1, r.length - 1)];
    strokeCells(r, i + 1, { x: cx(a) + (cx(b) - cx(a)) * (f - i), y: cy(a) + (cy(b) - cy(a)) * (f - i) }, C.collar, Math.min(12, Math.max(3, s * .24)));
  }

  // The ball, with a slow breathing halo, until the dog picks it up
  if (!won) {
    const gx = cx(m.goal), gy = cy(m.goal), gr = Math.min(16, s * .28);
    const breathe = reduceMotion ? .5 : .5 + .5 * Math.sin(now * .0035);
    ctx.fillStyle = C.orange;
    ctx.globalAlpha = k * (.14 + .1 * breathe);
    ctx.beginPath(); ctx.arc(gx, gy, gr * (1.6 + .3 * breathe), 0, TAU); ctx.fill();
    ctx.globalAlpha = k;
    drawBall(gx, gy, gr);
  }

  // Walls ink in from the faint start-screen color
  ctx.globalAlpha = 1;
  drawWalls(m.cells, mix(HAIR, INK, k), B.wall);

  // Bumped wall glows red for a moment
  if (G.flash) {
    const fl = G.flash, x = B.ox + (fl.c % m.cols) * s, y = B.oy + ((fl.c / m.cols) | 0) * s;
    const seg = [[x, y, x + s, y], [x + s, y, x + s, y + s], [x, y + s, x + s, y + s], [x, y, x, y + s]][fl.d];
    ctx.globalAlpha = fl.life / T.flash;
    ctx.strokeStyle = C.red; ctx.lineWidth = B.wall * 1.8; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(seg[0], seg[1]); ctx.lineTo(seg[2], seg[3]); ctx.stroke();
  }

  // The dog: a small flinch away from a bumped wall, a happy hop and fast wag once it has the ball
  let fx = 0, fy = 0;
  if (G.flash && !reduceMotion) {
    const f = Math.sin(Math.PI * Math.min(1, (1 - G.flash.life / T.flash) * 2.2)) * s * .08;
    fx = -DX[G.flash.d] * f; fy = -DY[G.flash.d] * f;
  }
  const t = now / 1000;
  ctx.globalAlpha = k;
  drawDog({
    x: p.x + fx, y: p.y + fy, size: Math.min(64, Math.max(s * 1.05, Math.min(20, s * 1.3))),
    face: G.face, tilt: -G.tilt * .14 * G.face, gait: G.gait, walk: G.walk,
    wag: reduceMotion ? .15 : won ? .45 * Math.sin(t * TAU * 5.5) : (.2 + .1 * G.walk) * Math.sin(t * TAU * (1.5 + G.walk)),
    blink: now % 3800 < 130,
    hop: G.pop > 0 ? Math.sin(Math.PI * (1 - G.pop / T.pop)) * 12 : 0,
    hold: won
  });

  // Rings and particles
  for (const o of G.rings) {
    if (o.delay > 0) continue;
    const tt = 1 - o.life / o.max, e = reduceMotion ? .6 : easeOut(tt);
    ctx.globalAlpha = (1 - tt) * .55; ctx.strokeStyle = o.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r0 + (o.r1 - o.r0) * e, 0, TAU); ctx.stroke();
  }
  for (const q of G.parts) {
    ctx.globalAlpha = Math.min(1, q.life * 2); ctx.fillStyle = q.color;
    ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (G.fromStart && k < 1) clearing(1 - k);   // the start screen's quiet patch dissolves as the board inks in
  ctx.restore();
}

/* ---------- Readouts ---------- */
function fmt(ms) {
  const tenths = Math.floor(ms / 100), sec = Math.floor(tenths / 10);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}.${tenths % 10}`;
}

const shown = {};
function setText(id, text) { if (shown[id] !== text) $(id).textContent = shown[id] = text; }

function updateHud() {
  setText("sTime", fmt(G.time));
  setText("sMoves", G.moves.toLocaleString());
  const showTip = G.mode === "play" && !G.hinted && !G.joystick;   // the first-round tip, until the first move
  if (shown.tip !== showTip) { shown.tip = showTip; tip.hidden = !showTip; }
}

// Level dots, built once from LEVELS: one button per level, grouped by tier, with a tag button under each group.
const levelsEl = $("levels"), levelDots = [], tierEls = [];
TIERS.forEach((tier, ti) => {
  const group = document.createElement("div"), dots = document.createElement("div"), tag = document.createElement("button");
  group.className = "tier"; dots.className = "dots";
  LEVELS.filter(lv => lv.tier === ti).forEach(lv => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "ld";
    b.onclick = () => pickLevel(lv.n - 1);
    levelDots.push(b); dots.append(b);
  });
  tag.type = "button"; tag.className = "tag"; tag.textContent = tier.tag;
  tag.setAttribute("aria-label", `${tier.tag} levels`);
  tag.onclick = () => {   // jump to the first unsolved level in this tier
    const inTier = LEVELS.filter(lv => lv.tier === ti);
    pickLevel((inTier.find(lv => !bestTime(lv.n)) || inTier[0]).n - 1);
  };
  group.append(dots, tag); levelsEl.append(group); tierEls.push(group);
});

function renderStart() {
  const lv = LEVELS[G.level], best = bestTime(lv.n);
  levelDots.forEach((b, i) => {
    const t = bestTime(i + 1), cur = i === G.level;
    b.classList.toggle("solved", t > 0);
    if (cur) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    b.tabIndex = cur ? 0 : -1;   // one tab stop for the dots; arrow keys move along them
    b.setAttribute("aria-label", `Level ${i + 1}, ${LEVELS[i].tag}` + (t ? `, best ${fmt(t)}` : ""));
  });
  tierEls.forEach((el, ti) => el.classList.toggle("on", ti === lv.tier));
  $("levelLine").textContent = `Level ${lv.n}` + (best ? ` · Best ${fmt(best)}` : "");
  const name = COLLARS[G.collar], label = name[0].toUpperCase() + name.slice(1) + " collar";
  $("optColor").querySelector("span").textContent = label;
  $("optColor").setAttribute("aria-label", `Collar color: ${label}. Activate to change.`);
  renderSound();
}

function renderSound() {
  $("optSound").firstElementChild.textContent = G.sound ? "Sound on" : "Sound off";
  $("optSound").setAttribute("aria-label", `Sound: ${G.sound ? "on" : "off"}. Activate to change.`);
  $("soundBtn").textContent = G.sound ? "Turn sound off" : "Turn sound on";
}

function renderJoystick() { $("padBtn").setAttribute("aria-checked", G.joystick ? "true" : "false"); }

/* ---------- Input ---------- */
// Keys use physical positions, so WASD also works as ZQSD on French keyboards.
const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
const dirOf = (dx, dy) => Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
const nearDiagonal = (dx, dy) => Math.abs(Math.abs(dx) - Math.abs(dy)) < Math.hypot(dx, dy) * .2;

// A key, the joystick or a finger held down: one step now, then more at a calm pace until it lets go. The newest hold wins.
let holdFrom = null;
function hold(src, d) { holdFrom = src; G.held = d; G.holdT = MOVE.delay; press(d); }
function letGo(src) { if (holdFrom === src) { holdFrom = null; G.held = -1; } }

const keysDown = [];   // codes of movement keys held down, newest last
let swipe = null, touch = null, padId = null, padDir = -1;
function releaseInputs() {
  keysDown.length = 0; swipe = null; touch = null; holdFrom = null; G.held = -1; G.next = -1;
  padId = null; padDir = -1; padEl.classList.remove("held"); knob.style.transform = "";
  chevs.forEach(c => c.classList.remove("on"));
}

document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === "KeyM") { if (!e.repeat) toggleSound(); return; }             // M mutes or unmutes anywhere
  if (e.code === "KeyJ") { if (!e.repeat) setJoystick(!G.joystick); return; }  // J shows or hides the joystick
  if (e.key === "Escape") {
    if (G.mode === "play" || G.mode === "paused") { e.preventDefault(); setPaused(G.mode === "play"); }
    return;
  }
  const onButton = e.target.closest && e.target.closest("button");
  if (e.key === "Enter" && G.mode === "start") { e.preventDefault(); startRound(); return; }   // even with a level dot focused
  if (e.key === "Enter" && !onButton) {
    if (G.mode === "paused") { e.preventDefault(); setPaused(false); }
    else if (G.mode === "done" && performance.now() - G.doneAt > 400) { e.preventDefault(); advance(); startRound(); }
    return;
  }
  const d = KEYS[e.code];
  if (d === undefined) return;
  if (G.mode === "start") {   // left and right page through the levels
    if (d === 1 || d === 3) { e.preventDefault(); pickLevel(G.level + (d === 1 ? 1 : -1)); }
    return;
  }
  if (G.mode !== "play") return;
  e.preventDefault();
  if (e.repeat || keysDown.includes(e.code)) return;   // holding is timed by the game, not by key repeat
  keysDown.push(e.code);
  hold("key", d);
});
document.addEventListener("keyup", e => {
  const i = keysDown.indexOf(e.code);
  if (i < 0) return;
  keysDown.splice(i, 1);
  if (!keysDown.length) return letGo("key");
  if (holdFrom === "key") { G.held = KEYS[keysDown[keysDown.length - 1]]; G.holdT = MOVE.delay; }   // a key still held takes over, without an extra step
});

// Joystick: press a side, or drag the knob like a thumbstick. Holding keeps the dog going.
function padAt(e) {
  const box = padEl.getBoundingClientRect();
  const x = e.clientX - (box.left + box.width / 2), y = e.clientY - (box.top + box.height / 2), len = Math.hypot(x, y);
  const k = len > PAD.reach ? PAD.reach / len : 1;
  knob.style.transform = `translate(calc(-50% + ${x * k}px), calc(-50% + ${y * k}px))`;
  let d = len > PAD.dead ? dirOf(x, y) : -1;
  if (d >= 0 && padDir >= 0 && d !== padDir && nearDiagonal(x, y)) d = padDir;   // near a diagonal: keep going
  if (d === padDir) return;
  padDir = d;
  chevs.forEach((c, i) => c.classList.toggle("on", i === d));
  if (d >= 0) hold("pad", d); else letGo("pad");
}
function padUp(e) {
  if (e.pointerId !== padId) return;
  padId = null; padDir = -1;
  padEl.classList.remove("held"); knob.style.transform = "";
  chevs.forEach(c => c.classList.remove("on"));
  letGo("pad");
}
padEl.addEventListener("pointerdown", e => {
  e.preventDefault(); e.stopPropagation();
  if (G.mode !== "play" || padId !== null) return;
  padId = e.pointerId;
  padEl.setPointerCapture(e.pointerId);
  padEl.classList.add("held");
  padAt(e);
});
padEl.addEventListener("pointermove", e => {
  if (e.pointerId !== padId) return;
  if (e.pointerType === "mouse" && !e.buttons) return padUp(e);   // the button came up where we could not hear it
  padAt(e);
});
["pointerup", "pointercancel", "lostpointercapture"].forEach(type => padEl.addEventListener(type, padUp));

// Touch screens: drag anywhere and the dog steps the way you drag. Keep the finger down to keep going; lift it to stop.
// A tap never moves the dog. On the start screen, a sideways swipe pages through the levels.
stage.addEventListener("pointerdown", e => {
  if (!e.isPrimary || e.button !== 0 || e.target.closest("button, .pad")) return;
  if (G.mode === "start") {
    swipe = { id: e.pointerId, x0: e.clientX };
    stage.setPointerCapture(e.pointerId);
  } else if (G.mode === "play" && e.pointerType !== "mouse") {   // mouse players use the keys and the joystick
    touch = { id: e.pointerId, x: e.clientX, y: e.clientY, dir: -1 };
    stage.setPointerCapture(e.pointerId);
  }
});
stage.addEventListener("pointermove", e => {
  if (!touch || e.pointerId !== touch.id) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  if (Math.hypot(dx, dy) < DRAG) return;
  let d = dirOf(dx, dy);
  if (touch.dir >= 0 && d !== touch.dir && nearDiagonal(dx, dy)) d = touch.dir;   // near a diagonal: keep going
  touch.x = e.clientX; touch.y = e.clientY;   // measure the next turn from here
  if (d !== touch.dir) { touch.dir = d; hold("touch", d); }
});
function pointerEnd(e) {
  if (swipe && e.pointerId === swipe.id) {
    const dx = e.clientX - swipe.x0;
    swipe = null;
    if (e.type === "pointerup" && Math.abs(dx) > 40) pickLevel(G.level + (dx < 0 ? 1 : -1));
  }
  if (touch && e.pointerId === touch.id) { touch = null; letGo("touch"); }
}
["pointerup", "pointercancel", "lostpointercapture"].forEach(type => stage.addEventListener(type, pointerEnd));
window.addEventListener("blur", () => { releaseInputs(); setPaused(true); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { releaseInputs(); setPaused(true); } });

// A mouse click lets go of the button's focus, so Enter and Space go back to the game. Keyboard users keep their place.
const clicked = e => { if (e.detail > 0) e.currentTarget.blur(); };
$("startBtn").onclick = startRound;
$("optColor").onclick = cycleCollar;
$("optSound").onclick = toggleSound;
$("pauseBtn").onclick = e => { clicked(e); setPaused(true); };
$("padBtn").onclick = e => { clicked(e); setJoystick(!G.joystick); };
$("resumeBtn").onclick = () => setPaused(false);
$("soundBtn").onclick = toggleSound;
$("quitBtn").onclick = toStart;
$("nextBtn").onclick = () => { advance(); startRound(); };
$("homeBtn").onclick = () => { advance(); toStart(); };

/* ---------- Start ---------- */
tip.textContent = touchFirst ? "Drag to move, hold to keep going" : "Use the arrow keys or WASD to move";
if (touchFirst) $("pauseNote").textContent = "The clock is stopped.";
applyCollar();
setupDog();
renderJoystick();
new ResizeObserver(resize).observe(stage);
resize();
toStart();

let last = performance.now();
function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  step(dt);
  if (G.mode === "play") updateHud();
  draw(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
})();