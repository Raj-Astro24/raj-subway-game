// ─────────────────────────────────────────────────────────────────────────────
//  Raj Subway Game — main.ts
//  Day 4: Obstacles · Coins · Collision · Game Over · High Score
//  By Raj Computers
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const LANE_X            = [-1.8, 0, 1.8] as const;
const LANE_SWITCH_SPEED = 12;
const JUMP_FORCE        = 8;
const GRAVITY           = -20;
const SLIDE_DURATION    = 0.7;
const BASE_SPEED        = 10;
const SPEED_INCREMENT   = 0.5;
const PLAYER_H          = 1.6;
const PLAYER_W          = 0.8;

const SEG_LEN        = 20;
const SEG_GND_W      = 20;
const ROAD_W         = 5.4;
const POOL_SIZE      = 14;
const RECYCLE_BHD    = 25;

const OBS_AHEAD      = 65;   // how far ahead to keep obstacles spawned
const OBS_MIN_GAP    = 20;   // min z-distance between spawns
const OBS_MAX_GAP    = 38;   // max z-distance between spawns
const OBS_GRACE      = 35;   // no obstacles in the first N units
const OBS_POOL_SZ    = 10;   // 7 barriers + 3 lowbeams

const COIN_AHEAD     = 50;
const COIN_MIN_GAP   = 10;
const COIN_MAX_GAP   = 22;
const COIN_GRACE     = 18;
const COIN_POOL_SZ   = 42;   // 42 slots (coins spawn in clusters of 1-6)

// ═══════════════════════════════════════════════════════════════════════════════
//  RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

const canvas   = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// ═══════════════════════════════════════════════════════════════════════════════
//  SCENE + CAMERA
// ═══════════════════════════════════════════════════════════════════════════════

const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog        = new THREE.Fog(0x87CEEB, 35, 90);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 150);

// ═══════════════════════════════════════════════════════════════════════════════
//  LIGHTING
// ═══════════════════════════════════════════════════════════════════════════════

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xfff4e0, 1.2);
sun.position.set(10, 20, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

// ═══════════════════════════════════════════════════════════════════════════════
//  SHARED MATERIALS  (one object per material — shared by all meshes using it)
// ═══════════════════════════════════════════════════════════════════════════════

const MAT_GROUND   = new THREE.MeshLambertMaterial({ color: 0x4a7c59 });
const MAT_ROAD     = new THREE.MeshLambertMaterial({ color: 0x555555 });
const MAT_LINE     = new THREE.MeshLambertMaterial({ color: 0xffffff });
const MAT_TRUNK    = new THREE.MeshLambertMaterial({ color: 0x8B5E3C });
const MAT_LEAVES   = new THREE.MeshLambertMaterial({ color: 0x2d7a2d });
const MAT_BARRIER  = new THREE.MeshLambertMaterial({ color: 0xdd2222 });  // red barrier
const MAT_STRIPE   = new THREE.MeshLambertMaterial({ color: 0xFFAA00 });  // orange warning stripe
const MAT_BEAM     = new THREE.MeshLambertMaterial({ color: 0x3355cc });  // blue low beam
const MAT_COIN     = new THREE.MeshLambertMaterial({ color: 0xFFD700, emissive: new THREE.Color(0x664400) });
const MAT_PLAYER   = new THREE.MeshLambertMaterial({ color: 0xff6600 });
const MAT_EYE      = new THREE.MeshLambertMaterial({ color: 0xffffff });

// ═══════════════════════════════════════════════════════════════════════════════
//  TRACK SYSTEM  (from Day 3 — object pooling)
// ═══════════════════════════════════════════════════════════════════════════════

const GEO_GROUND = new THREE.PlaneGeometry(SEG_GND_W, SEG_LEN);
const GEO_ROAD   = new THREE.PlaneGeometry(ROAD_W, SEG_LEN);
const GEO_LINE   = new THREE.PlaneGeometry(0.08, SEG_LEN);
const GEO_TRUNK  = new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6);
const GEO_LEAVES = new THREE.ConeGeometry(0.7, 2, 6);

class TrackSegment {
  group: THREE.Group; posZ = 0;
  private trees: THREE.Group[];
  constructor() {
    this.group = new THREE.Group(); scene.add(this.group);
    const gnd  = new THREE.Mesh(GEO_GROUND, MAT_GROUND);
    gnd.rotation.x  = -Math.PI / 2; gnd.position.z = -SEG_LEN / 2; gnd.receiveShadow = true;
    this.group.add(gnd);
    const road = new THREE.Mesh(GEO_ROAD, MAT_ROAD);
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, -SEG_LEN / 2); road.receiveShadow = true;
    this.group.add(road);
    [-1.8, 1.8].forEach(x => {
      const l = new THREE.Mesh(GEO_LINE, MAT_LINE);
      l.rotation.x = -Math.PI / 2; l.position.set(x, 0.02, -SEG_LEN / 2);
      this.group.add(l);
    });
    this.trees = [];
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Group();
      const tr = new THREE.Mesh(GEO_TRUNK, MAT_TRUNK); tr.position.y = 0.6; tr.castShadow = true; t.add(tr);
      const lv = new THREE.Mesh(GEO_LEAVES, MAT_LEAVES); lv.position.y = 2.2; lv.castShadow = true; t.add(lv);
      this.group.add(t); this.trees.push(t);
    }
  }
  reset(z: number): void {
    this.posZ = z; this.group.position.z = z;
    const zA = -(Math.random() * SEG_LEN * 0.4 + 1);
    const zB = -(Math.random() * SEG_LEN * 0.4 + SEG_LEN * 0.45);
    const lx = -(4.5 + Math.random() * 0.8), rx = 4.5 + Math.random() * 0.8;
    this.trees[0].position.set(lx, 0, zA); this.trees[1].position.set(rx, 0, zA);
    this.trees[2].position.set(lx, 0, zB); this.trees[3].position.set(rx, 0, zB);
    this.trees.forEach(t => t.scale.setScalar(0.7 + Math.random() * 0.6));
  }
}

class TrackManager {
  private pool: TrackSegment[] = [];
  constructor() {
    for (let i = 0; i < POOL_SIZE; i++) {
      const s = new TrackSegment(); s.reset(SEG_LEN - i * SEG_LEN); this.pool.push(s);
    }
  }
  update(pz: number): void {
    let leadZ = Infinity;
    for (const s of this.pool) if (s.posZ < leadZ) leadZ = s.posZ;
    for (const s of this.pool) {
      if (s.posZ > pz + RECYCLE_BHD) { leadZ -= SEG_LEN; s.reset(leadZ); }
    }
  }
}
const track = new TrackManager();

// ═══════════════════════════════════════════════════════════════════════════════
//  OBSTACLE SYSTEM
//  Two types:
//    barrier  — tall red box in ONE lane  → player must JUMP over it
//    lowbeam  — wide blue bar across ALL lanes → player must SLIDE under it
// ═══════════════════════════════════════════════════════════════════════════════

type ObsType = 'barrier' | 'lowbeam';

interface ObsData {
  group:  THREE.Group;
  type:   ObsType;
  worldZ: number;
  active: boolean;
  // Collision box in world space (cz = worldZ, set when activated)
  cx: number; cy: number;
  hw: number; hh: number; hd: number;
}

function makeBarrierGroup(): THREE.Group {
  const g = new THREE.Group();
  // Main red body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.3, 0.55), MAT_BARRIER);
  body.position.y = 0.65; body.castShadow = true; g.add(body);
  // Orange warning stripe on top
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.2, 0.55), MAT_STRIPE);
  stripe.position.y = 1.4; g.add(stripe);
  return g;
}

function makeLowBeamGroup(): THREE.Group {
  const g = new THREE.Group();
  // Horizontal bar
  const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W, 0.45, 0.55), MAT_BEAM);
  beam.position.y = 1.125; beam.castShadow = true; g.add(beam);
  // Two support poles on sides
  [-2.4, 2.4].forEach(x => {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.55), MAT_BEAM);
    pole.position.set(x, 0.45, 0); g.add(pole);
  });
  return g;
}

// Pre-build obstacle pool: 7 barriers + 3 lowbeams
const obsPool: ObsData[] = [];
for (let i = 0; i < OBS_POOL_SZ; i++) {
  const isBeam = i >= 7;
  const group  = isBeam ? makeLowBeamGroup() : makeBarrierGroup();
  group.visible = false; scene.add(group);
  obsPool.push({
    group, type: isBeam ? 'lowbeam' : 'barrier',
    worldZ: 0, active: false,
    // Collision half-extents (set at spawn; hardcoded by type)
    cx: 0, cy: isBeam ? 1.125 : 0.65,
    hw: isBeam ? 2.4 : 0.38,
    hh: isBeam ? 0.22 : 0.65,
    hd: 0.28,
  });
}

let nextObsZ  = 0;   // reset each game — set in resetSpawners()

function activateObstacle(atZ: number): void {
  // 25 % chance of lowbeam (but not before score 60)
  const wantBeam = Math.random() < 0.25 && atZ < -(OBS_GRACE + 20);
  const candidates = obsPool.filter(o => !o.active && o.type === (wantBeam ? 'lowbeam' : 'barrier'));
  if (!candidates.length) return;

  const obs    = candidates[0];
  const laneIdx = Math.floor(Math.random() * 3);
  const laneX   = obs.type === 'barrier' ? LANE_X[laneIdx] : 0;

  obs.active  = true;
  obs.worldZ  = atZ;
  obs.cx      = laneX;
  obs.group.position.set(laneX, 0, atZ);
  obs.group.visible = true;
}

function updateObstacles(playerZ: number): void {
  // Spawn obstacles ahead of player up to OBS_AHEAD distance
  while (nextObsZ > playerZ - OBS_AHEAD) {
    if (nextObsZ > playerZ - OBS_GRACE) { nextObsZ -= 10; continue; }
    activateObstacle(nextObsZ);
    nextObsZ -= OBS_MIN_GAP + Math.random() * (OBS_MAX_GAP - OBS_MIN_GAP);
  }
  // Recycle obstacles that have passed behind the player
  for (const o of obsPool) {
    if (o.active && o.worldZ > playerZ + 20) {
      o.active = false; o.group.visible = false;
    }
  }
}

function resetObstacles(playerZ: number): void {
  for (const o of obsPool) { o.active = false; o.group.visible = false; }
  nextObsZ = playerZ - OBS_GRACE;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  COIN SYSTEM
//  Gold spinning discs. Spawn in clusters of 3-5 in a single lane.
// ═══════════════════════════════════════════════════════════════════════════════

interface CoinData {
  mesh:   THREE.Mesh;
  worldZ: number;
  laneX:  number;
  active: boolean;
}

const coinPool: CoinData[] = [];
const GEO_COIN = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 10);

for (let i = 0; i < COIN_POOL_SZ; i++) {
  const mesh = new THREE.Mesh(GEO_COIN, MAT_COIN);
  mesh.rotation.x = Math.PI / 2;  // face the camera (stand vertically)
  mesh.castShadow  = false;
  mesh.visible     = false;
  scene.add(mesh);
  coinPool.push({ mesh, worldZ: 0, laneX: 0, active: false });
}

let nextCoinZ = 0;

function spawnCoinCluster(atZ: number): void {
  const laneIdx = Math.floor(Math.random() * 3);
  const laneX   = LANE_X[laneIdx];
  const count   = 3 + Math.floor(Math.random() * 3); // 3–5 coins
  const spacing = 1.8;

  for (let i = 0; i < count; i++) {
    const slot = coinPool.find(c => !c.active);
    if (!slot) return;
    slot.active  = true;
    slot.worldZ  = atZ - i * spacing;
    slot.laneX   = laneX;
    slot.mesh.position.set(laneX, 0.55, slot.worldZ);
    slot.mesh.visible = true;
    slot.mesh.scale.setScalar(1);
  }
}

function updateCoins(playerZ: number, dt: number): void {
  // Spawn
  while (nextCoinZ > playerZ - COIN_AHEAD) {
    if (nextCoinZ > playerZ - COIN_GRACE) { nextCoinZ -= 8; continue; }
    spawnCoinCluster(nextCoinZ);
    nextCoinZ -= COIN_MIN_GAP + Math.random() * (COIN_MAX_GAP - COIN_MIN_GAP);
  }
  // Animate (spin) + recycle
  for (const c of coinPool) {
    if (!c.active) continue;
    c.mesh.rotation.y += dt * 3;           // spin each frame
    c.mesh.position.y = 0.55 + Math.sin(performance.now() * 0.003 + c.worldZ) * 0.08; // gentle float
    if (c.worldZ > playerZ + 12) { c.active = false; c.mesh.visible = false; }
  }
}

function resetCoins(playerZ: number): void {
  for (const c of coinPool) { c.active = false; c.mesh.visible = false; }
  nextCoinZ = playerZ - COIN_GRACE;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PLAYER MESH
// ═══════════════════════════════════════════════════════════════════════════════

const playerGroup = new THREE.Group(); scene.add(playerGroup);

const playerBody = new THREE.Mesh(
  new THREE.BoxGeometry(PLAYER_W, PLAYER_H, PLAYER_W), MAT_PLAYER
);
playerBody.castShadow = true; playerBody.position.y = PLAYER_H / 2;
playerGroup.add(playerBody);

const GEO_EYE = new THREE.SphereGeometry(0.08, 6, 6);
[-0.18, 0.18].forEach(ex => {
  const eye = new THREE.Mesh(GEO_EYE, MAT_EYE);
  eye.position.set(ex, PLAYER_H * 0.75, -PLAYER_W / 2 - 0.05);
  playerGroup.add(eye);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PLAYER STATE
// ═══════════════════════════════════════════════════════════════════════════════

interface PlayerState {
  lane: number; targetX: number; currentX: number;
  z: number; velocityY: number; y: number;
  isJumping: boolean; isSliding: boolean; slideTimer: number;
  isDead: boolean; speed: number;
  score: number; coins: number; timeAlive: number;
}

const player: PlayerState = {
  lane: 1, targetX: LANE_X[1], currentX: LANE_X[1],
  z: 0, velocityY: 0, y: 0,
  isJumping: false, isSliding: false, slideTimer: 0,
  isDead: false, speed: BASE_SPEED,
  score: 0, coins: 0, timeAlive: 0,
};

function resetPlayer(): void {
  Object.assign(player, {
    lane: 1, targetX: LANE_X[1], currentX: LANE_X[1],
    z: 0, velocityY: 0, y: 0,
    isJumping: false, isSliding: false, slideTimer: 0,
    isDead: false, speed: BASE_SPEED, score: 0, coins: 0, timeAlive: 0,
  });
  cancelSlide();
  MAT_PLAYER.color.set(0xff6600); // restore orange
  resetObstacles(0);
  resetCoins(0);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════════════════════════════════════════

function switchLane(dir: -1 | 1): void {
  if (player.isDead) return;
  const n = Math.max(0, Math.min(2, player.lane + dir));
  if (n !== player.lane) { player.lane = n; player.targetX = LANE_X[n]; }
}
function tryJump(): void {
  if (player.isDead || player.isJumping) return;
  if (player.isSliding) { cancelSlide(); return; }
  player.isJumping = true; player.velocityY = JUMP_FORCE;
}
function trySlide(): void {
  if (player.isDead || player.isJumping || player.isSliding) return;
  player.isSliding = true; player.slideTimer = SLIDE_DURATION;
  playerBody.scale.set(1, 0.5, 1); playerBody.position.y = PLAYER_H * 0.25;
}
function cancelSlide(): void {
  player.isSliding = false; player.slideTimer = 0;
  playerBody.scale.set(1, 1, 1); playerBody.position.y = PLAYER_H / 2;
}

window.addEventListener('keydown', e => {
  if (gameState === 'playing') {
    switch (e.key) {
      case 'ArrowLeft':  case 'a': case 'A': switchLane(-1); break;
      case 'ArrowRight': case 'd': case 'D': switchLane(1);  break;
      case 'ArrowUp':    case 'w': case 'W': tryJump();      break;
      case 'ArrowDown':  case 's': case 'S': trySlide();     break;
      case 'Escape': gameState = 'paused'; showScreen('paused'); break;
    }
  } else if (gameState === 'paused' && e.key === 'Escape') {
    gameState = 'playing'; showScreen('playing');
  }
});

let touchX = 0, touchY = 0;
window.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }, { passive: true });
window.addEventListener('touchend',   e => {
  if (gameState !== 'playing') return;
  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dx) > Math.abs(dy)) { if (Math.abs(dx) > 30) dx > 0 ? switchLane(1) : switchLane(-1); }
  else                              { if (Math.abs(dy) > 30) dy < 0 ? tryJump()     : trySlide();     }
}, { passive: true });

// ═══════════════════════════════════════════════════════════════════════════════
//  COLLISION DETECTION  — simple AABB (Axis-Aligned Bounding Box)
//  Returns true if two boxes overlap (with a small forgiveness margin).
// ═══════════════════════════════════════════════════════════════════════════════

function hitAABB(
  px: number, py: number, pz: number, phx: number, phy: number, phz: number,
  ox: number, oy: number, oz: number, ohx: number, ohy: number, ohz: number
): boolean {
  const margin = 0.08; // forgiveness: makes the hitbox slightly smaller than the visual
  return (
    Math.abs(px - ox) < (phx + ohx - margin) &&
    Math.abs(py - oy) < (phy + ohy - margin) &&
    Math.abs(pz - oz) < (phz + ohz - margin)
  );
}

function checkCollisions(): 'obstacle' | 'coin' | null {
  // ── Player bounding box ──
  // Normal standing: player extends from y=0 to y=PLAYER_H (1.6)
  // Sliding (squished 0.5×): extends from y=0 to y=0.8
  const pHalfH = player.isSliding ? PLAYER_H * 0.25 : PLAYER_H / 2;
  const pCY    = player.y + pHalfH;       // center y in world space
  const pHW    = 0.35, pHD = 0.35;        // half width + depth

  // ── Check obstacles ──
  for (const o of obsPool) {
    if (!o.active) continue;
    if (hitAABB(
      player.currentX, pCY, player.z, pHW, pHalfH, pHD,
      o.cx,            o.cy, o.worldZ, o.hw,  o.hh,   o.hd
    )) return 'obstacle';
  }

  // ── Check coins ──
  for (const c of coinPool) {
    if (!c.active) continue;
    if (hitAABB(
      player.currentX, pCY, player.z, pHW, pHalfH, pHD,
      c.laneX, 0.55, c.worldZ, 0.32, 0.32, 0.1
    )) {
      // Collect!
      c.active = false; c.mesh.visible = false;
      player.coins++;
      return 'coin';
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  GAME STATE + SCREENS
// ═══════════════════════════════════════════════════════════════════════════════

type Screen = 'loading' | 'menu' | 'playing' | 'paused' | 'gameover';
let gameState: Screen = 'loading';
let highScore = parseInt(localStorage.getItem('raj-highscore') ?? '0');
let deathTimer = 0; // brief delay before showing game over screen

function showScreen(name: Screen): void {
  (['loading','menu','pause','gameover'] as const).forEach(id =>
    document.getElementById(`screen-${id}`)?.classList.add('hidden')
  );
  if (name !== 'playing') {
    document.getElementById(`screen-${name === 'paused' ? 'pause' : name}`)?.classList.remove('hidden');
  }
}

function triggerDeath(): void {
  if (player.isDead) return;
  player.isDead = true;
  if (player.score > highScore) { highScore = player.score; localStorage.setItem('raj-highscore', String(highScore)); }
  MAT_PLAYER.color.set(0xff0000); // flash red
  deathTimer = 0.6;               // wait 0.6 s then show game over screen
}

document.getElementById('btn-play')!   .addEventListener('click', () => { resetPlayer(); gameState = 'playing'; showScreen('playing'); });
document.getElementById('btn-resume')! .addEventListener('click', () => { gameState = 'playing'; showScreen('playing'); });
document.getElementById('btn-quit')!   .addEventListener('click', () => { gameState = 'menu';    showScreen('menu'); });
document.getElementById('btn-restart')!.addEventListener('click', () => { resetPlayer(); gameState = 'playing'; showScreen('playing'); });
document.getElementById('btn-menu')!   .addEventListener('click', () => { gameState = 'menu';    showScreen('menu'); });

// ═══════════════════════════════════════════════════════════════════════════════
//  HUD
// ═══════════════════════════════════════════════════════════════════════════════

function updateHUD(): void {
  (document.getElementById('hud-score') as HTMLElement).textContent = `SCORE: ${player.score}`;
  (document.getElementById('hud-coins') as HTMLElement).textContent = `🪙 ${player.coins}`;
  (document.getElementById('hud-hi')    as HTMLElement).textContent = `BEST: ${highScore}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PLAYER UPDATE
// ═══════════════════════════════════════════════════════════════════════════════

function updatePlayer(dt: number): void {
  // Handle death cooldown
  if (player.isDead) {
    if (deathTimer > 0) {
      deathTimer -= dt;
      // Wobble the player box a little on death
      playerGroup.rotation.z = Math.sin(performance.now() * 0.02) * 0.3;
      if (deathTimer <= 0) {
        playerGroup.rotation.z = 0;
        gameState = 'gameover';
        (document.getElementById('score-display')     as HTMLElement).textContent = `SCORE: ${player.score}`;
        (document.getElementById('highscore-display') as HTMLElement).textContent = `BEST: ${highScore}`;
        showScreen('gameover');
      }
    }
    return;
  }

  // ── Forward movement ──
  player.timeAlive += dt;
  player.speed      = BASE_SPEED + Math.floor(player.timeAlive / 10) * SPEED_INCREMENT;
  player.z         -= player.speed * dt;
  player.score      = Math.floor(-player.z / 2) + player.coins * 5;

  // ── Lane switch ──
  player.currentX += (player.targetX - player.currentX) * Math.min(LANE_SWITCH_SPEED * dt, 1);

  // ── Jump ──
  if (player.isJumping) {
    player.velocityY += GRAVITY * dt;
    player.y         += player.velocityY * dt;
    if (player.y <= 0) { player.y = 0; player.velocityY = 0; player.isJumping = false; }
  }

  // ── Slide timer ──
  if (player.isSliding) { player.slideTimer -= dt; if (player.slideTimer <= 0) cancelSlide(); }

  // ── Apply to mesh ──
  playerGroup.position.set(player.currentX, player.y, player.z);
  playerGroup.rotation.z = 0;

  // Running bob
  if (!player.isJumping && !player.isSliding) {
    playerBody.position.y = PLAYER_H / 2 + Math.sin(player.timeAlive * 12) * 0.04;
  }

  updateHUD();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CAMERA
// ═══════════════════════════════════════════════════════════════════════════════

function updateCamera(): void {
  const tX = player.currentX * 0.3;
  camera.position.x += (tX - camera.position.x) * 0.1;
  camera.position.y  = player.y + 5;
  camera.position.z  = player.z + 10;
  camera.lookAt(player.currentX * 0.1, player.y + 1, player.z - 5);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  RESIZE
// ═══════════════════════════════════════════════════════════════════════════════

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  LOADING
// ═══════════════════════════════════════════════════════════════════════════════

let loadPct = 0;
const bar   = document.getElementById('loading-bar') as HTMLElement;
const lid   = setInterval(() => {
  loadPct += Math.random() * 15 + 10;
  if (loadPct >= 100) {
    loadPct = 100; clearInterval(lid);
    setTimeout(() => { gameState = 'menu'; showScreen('menu'); updateHUD(); }, 300);
  }
  bar.style.width = `${loadPct}%`;
}, 120);

// ═══════════════════════════════════════════════════════════════════════════════
//  GAME LOOP
// ═══════════════════════════════════════════════════════════════════════════════

const clock = new THREE.Clock();

function gameLoop(): void {
  requestAnimationFrame(gameLoop);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (gameState === 'playing' || (gameState === 'playing' && player.isDead)) {
    updatePlayer(dt);

    if (!player.isDead) {
      track.update(player.z);
      updateObstacles(player.z);
      updateCoins(player.z, dt);

      // ── COLLISION CHECK ──
      const hit = checkCollisions();
      if (hit === 'obstacle') triggerDeath();
      // 'coin' hit is already handled inside checkCollisions()
    }

    updateCamera();
  }

  if (gameState === 'menu' || gameState === 'loading') {
    camera.position.set(0, 5, 10); camera.lookAt(0, 0, -10);
  }

  renderer.render(scene, camera);
}

gameLoop();
