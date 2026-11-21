// ─────────────────────────────────────────────────────────────────────────────
//  Raj Subway Game — main.ts
//  Day 3: Endless procedural track + object pooling
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

// Track segment constants
const SEG_LEN           = 20;    // length of each road segment (z-axis)
const SEG_GROUND_W      = 20;    // total ground width per segment
const ROAD_W            = 5.4;   // road/asphalt width
const POOL_SIZE         = 14;    // number of segments in the pool
const RECYCLE_BEHIND    = 25;    // recycle a segment when this far behind player

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
//  SHARED MATERIALS  (create once, reuse across all segments = fewer GPU calls)
// ═══════════════════════════════════════════════════════════════════════════════

const MAT_GROUND  = new THREE.MeshLambertMaterial({ color: 0x4a7c59 });
const MAT_ROAD    = new THREE.MeshLambertMaterial({ color: 0x555555 });
const MAT_LINE    = new THREE.MeshLambertMaterial({ color: 0xffffff });
const MAT_TRUNK   = new THREE.MeshLambertMaterial({ color: 0x8B5E3C });
const MAT_LEAVES  = new THREE.MeshLambertMaterial({ color: 0x2d7a2d });

// Shared geometries — built once, shared across every segment
const GEO_GROUND  = new THREE.PlaneGeometry(SEG_GROUND_W, SEG_LEN);
const GEO_ROAD    = new THREE.PlaneGeometry(ROAD_W, SEG_LEN);
const GEO_LINE    = new THREE.PlaneGeometry(0.08, SEG_LEN);
const GEO_TRUNK   = new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6);
const GEO_LEAVES  = new THREE.ConeGeometry(0.7, 2, 6);

// ═══════════════════════════════════════════════════════════════════════════════
//  TRACK SEGMENT CLASS
//  Each segment is a self-contained piece of road 20 units long.
//  When it falls behind the player it gets "reset" to the front.
// ═══════════════════════════════════════════════════════════════════════════════

class TrackSegment {
  group: THREE.Group;
  posZ:  number = 0;          // world-z of the segment's START (front edge)
  private trees: THREE.Group[];

  constructor() {
    this.group = new THREE.Group();
    scene.add(this.group);

    // ── Ground plane ──
    const ground = new THREE.Mesh(GEO_GROUND, MAT_GROUND);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -SEG_LEN / 2;   // local centre of the segment
    ground.receiveShadow = true;
    this.group.add(ground);

    // ── Road ──
    const road = new THREE.Mesh(GEO_ROAD, MAT_ROAD);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, -SEG_LEN / 2);
    road.receiveShadow = true;
    this.group.add(road);

    // ── Lane divider lines ──
    [-1.8, 1.8].forEach(x => {
      const line = new THREE.Mesh(GEO_LINE, MAT_LINE);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.02, -SEG_LEN / 2);
      this.group.add(line);
    });

    // ── Trees: 2 per side = 4 per segment ──
    // We pre-build them and just reposition on reset (no create/destroy)
    this.trees = [];
    for (let i = 0; i < 4; i++) {
      const t = this.buildTree();
      this.group.add(t);
      this.trees.push(t);
    }
  }

  private buildTree(): THREE.Group {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(GEO_TRUNK, MAT_TRUNK);
    trunk.position.y = 0.6;
    trunk.castShadow = true;
    g.add(trunk);
    const leaves = new THREE.Mesh(GEO_LEAVES, MAT_LEAVES);
    leaves.position.y = 2.2;
    leaves.castShadow = true;
    g.add(leaves);
    return g;
  }

  /** Move this segment to a new world-Z position and randomise tree placement. */
  reset(newPosZ: number): void {
    this.posZ           = newPosZ;
    this.group.position.z = newPosZ;

    // Two random z offsets within the segment for tree rows
    const zA = -(Math.random() * SEG_LEN * 0.4 + 1);
    const zB = -(Math.random() * SEG_LEN * 0.4 + SEG_LEN * 0.45);

    const lx = -(4.5 + Math.random() * 0.8);   // left side x (varies slightly)
    const rx =   4.5 + Math.random() * 0.8;    // right side x

    this.trees[0].position.set(lx, 0, zA);
    this.trees[1].position.set(rx, 0, zA);
    this.trees[2].position.set(lx + (Math.random() - 0.5), 0, zB);
    this.trees[3].position.set(rx + (Math.random() - 0.5), 0, zB);

    // Randomise tree sizes slightly for visual variety
    this.trees.forEach(t => {
      const s = 0.7 + Math.random() * 0.6;
      t.scale.setScalar(s);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TRACK MANAGER  — builds the pool and recycles segments every frame
// ═══════════════════════════════════════════════════════════════════════════════

class TrackManager {
  private pool: TrackSegment[] = [];

  constructor() {
    // Initialise POOL_SIZE segments stretching ahead from z = SEG_LEN
    for (let i = 0; i < POOL_SIZE; i++) {
      const seg = new TrackSegment();
      // posZ descends: SEG_LEN, 0, -SEG_LEN, -2*SEG_LEN, ...
      seg.reset(SEG_LEN - i * SEG_LEN);
      this.pool.push(seg);
    }
  }

  /** Call once per frame with the player's current z coordinate. */
  update(playerZ: number): void {
    // Find the z of the leading (furthest ahead = most negative) segment
    let leadZ = Infinity;
    for (const seg of this.pool) {
      if (seg.posZ < leadZ) leadZ = seg.posZ;
    }

    for (const seg of this.pool) {
      // A segment is "behind" the player when its front edge (posZ) is
      // more than RECYCLE_BEHIND units behind (more positive z than) the player.
      if (seg.posZ > playerZ + RECYCLE_BEHIND) {
        // Recycle: jump it in front of the current leader
        leadZ -= SEG_LEN;
        seg.reset(leadZ);
      }
    }
  }
}

const track = new TrackManager();

// ═══════════════════════════════════════════════════════════════════════════════
//  PLAYER MESH
// ═══════════════════════════════════════════════════════════════════════════════

const playerGroup = new THREE.Group();
scene.add(playerGroup);

const playerBody = new THREE.Mesh(
  new THREE.BoxGeometry(PLAYER_W, PLAYER_H, PLAYER_W),
  new THREE.MeshLambertMaterial({ color: 0xff6600 })
);
playerBody.castShadow = true;
playerBody.position.y = PLAYER_H / 2;
playerGroup.add(playerBody);

// Eyes
const eyeGeo = new THREE.SphereGeometry(0.08, 6, 6);
const eyeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
[-0.18, 0.18].forEach(ex => {
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
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
    isDead: false, speed: BASE_SPEED,
    score: 0, coins: 0, timeAlive: 0,
  });
  cancelSlide();
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
  player.isJumping = true;
  player.velocityY = JUMP_FORCE;
}
function trySlide(): void {
  if (player.isDead || player.isJumping || player.isSliding) return;
  player.isSliding  = true;
  player.slideTimer = SLIDE_DURATION;
  playerBody.scale.set(1, 0.5, 1);
  playerBody.position.y = PLAYER_H * 0.25;
}
function cancelSlide(): void {
  player.isSliding  = false;
  player.slideTimer = 0;
  playerBody.scale.set(1, 1, 1);
  playerBody.position.y = PLAYER_H / 2;
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

let touchStartX = 0, touchStartY = 0;
window.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });
window.addEventListener('touchend', e => {
  if (gameState !== 'playing') return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const MIN = 30;
  if (Math.abs(dx) > Math.abs(dy)) { if (Math.abs(dx) > MIN) dx > 0 ? switchLane(1) : switchLane(-1); }
  else                              { if (Math.abs(dy) > MIN) dy < 0 ? tryJump()     : trySlide();     }
}, { passive: true });

// ═══════════════════════════════════════════════════════════════════════════════
//  GAME STATE + SCREENS
// ═══════════════════════════════════════════════════════════════════════════════

type Screen = 'loading' | 'menu' | 'playing' | 'paused' | 'gameover';
let gameState: Screen = 'loading';
let highScore = parseInt(localStorage.getItem('raj-highscore') ?? '0');

function showScreen(name: Screen): void {
  (['loading','menu','pause','gameover'] as const).forEach(id =>
    document.getElementById(`screen-${id}`)?.classList.add('hidden')
  );
  if (name !== 'playing') {
    document.getElementById(`screen-${name === 'paused' ? 'pause' : name}`)?.classList.remove('hidden');
  }
}

function triggerGameOver(): void {
  player.isDead = true;
  if (player.score > highScore) { highScore = player.score; localStorage.setItem('raj-highscore', String(highScore)); }
  gameState = 'gameover';
  (document.getElementById('score-display')     as HTMLElement).textContent = `SCORE: ${player.score}`;
  (document.getElementById('highscore-display') as HTMLElement).textContent = `BEST: ${highScore}`;
  showScreen('gameover');
}

// Buttons
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
  if (player.isDead) return;

  // Forward movement + speed ramp
  player.timeAlive += dt;
  player.speed      = BASE_SPEED + Math.floor(player.timeAlive / 10) * SPEED_INCREMENT;
  player.z         -= player.speed * dt;
  player.score      = Math.floor(-player.z / 2);

  // Lane smooth slide
  player.currentX += (player.targetX - player.currentX) * Math.min(LANE_SWITCH_SPEED * dt, 1);

  // Jump physics
  if (player.isJumping) {
    player.velocityY += GRAVITY * dt;
    player.y         += player.velocityY * dt;
    if (player.y <= 0) { player.y = 0; player.velocityY = 0; player.isJumping = false; }
  }

  // Slide countdown
  if (player.isSliding) { player.slideTimer -= dt; if (player.slideTimer <= 0) cancelSlide(); }

  // Apply to mesh
  playerGroup.position.set(player.currentX, player.y, player.z);

  // Running body-bob
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
//  LOADING SCREEN
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
//  GAME LOOP  ← the heartbeat — runs ~60× per second
// ═══════════════════════════════════════════════════════════════════════════════

const clock = new THREE.Clock();

function gameLoop(): void {
  requestAnimationFrame(gameLoop);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (gameState === 'playing') {
    updatePlayer(dt);
    track.update(player.z);   // ← recycle track segments every frame
    updateCamera();
  }

  if (gameState === 'menu' || gameState === 'loading') {
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, -10);
  }

  renderer.render(scene, camera);
}

gameLoop();
