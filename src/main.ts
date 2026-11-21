// ─────────────────────────────────────────────────────────────────────────────
//  Raj Subway Game — main.ts
//  Day 2: Player movement — lanes, jump, slide, keyboard + touch controls
//  By Raj Computers
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const LANE_POSITIONS = [-1.8, 0, 1.8] as const; // x positions for left/centre/right lane
const LANE_SWITCH_SPEED = 12;    // how fast the player slides to the new lane
const JUMP_FORCE       = 8;      // initial upward velocity on jump
const GRAVITY          = -20;    // downward pull (units per second²)
const SLIDE_DURATION   = 0.7;    // how long a slide lasts (seconds)
const BASE_SPEED       = 10;     // forward speed at game start (units/sec)
const SPEED_INCREMENT  = 0.5;    // speed added every 10 seconds
const PLAYER_HEIGHT    = 1.6;    // normal standing height
const PLAYER_WIDTH     = 0.8;
const PLAYER_DEPTH     = 0.8;

// ─── RENDERER ────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// ─── SCENE ───────────────────────────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 30, 80);

// ─── CAMERA ──────────────────────────────────────────────────────────────────
// The camera follows behind and above the player every frame.
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);

// ─── LIGHTING ────────────────────────────────────────────────────────────────

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.2);
sunLight.position.set(10, 20, 10);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
scene.add(sunLight);

// ─── GROUND + ROAD ───────────────────────────────────────────────────────────

const groundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 1000),
  new THREE.MeshLambertMaterial({ color: 0x4a7c59 })
);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

const roadMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(5.4, 1000),
  new THREE.MeshLambertMaterial({ color: 0x555555 })
);
roadMesh.rotation.x = -Math.PI / 2;
roadMesh.position.y = 0.01;
roadMesh.receiveShadow = true;
scene.add(roadMesh);

// Lane divider lines
const lineMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
[-1.8, 1.8].forEach(x => {
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 1000), lineMat);
  line.rotation.x = -Math.PI / 2;
  line.position.set(x, 0.02, 0);
  scene.add(line);
});

// ─── TREES ───────────────────────────────────────────────────────────────────

function makeTree(x: number, z: number): void {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6),
    new THREE.MeshLambertMaterial({ color: 0x8B5E3C })
  );
  trunk.position.set(x, 0.6, z);
  trunk.castShadow = true;
  scene.add(trunk);
  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 2, 6),
    new THREE.MeshLambertMaterial({ color: 0x2d7a2d })
  );
  leaves.position.set(x, 2.2, z);
  leaves.castShadow = true;
  scene.add(leaves);
}

for (let z = 0; z > -500; z -= 8) {
  makeTree(-4.5 + (Math.random() - 0.5) * 1.5, z);
  makeTree( 4.5 + (Math.random() - 0.5) * 1.5, z);
}

// ─── PLAYER MESH ─────────────────────────────────────────────────────────────
// Still a box — Day 5 we swap it for a real 3D character.
// Using a Group so we can scale the visual without affecting logic.
const playerGroup = new THREE.Group();
scene.add(playerGroup);

const playerBodyGeo = new THREE.BoxGeometry(PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_DEPTH);
const playerBodyMat = new THREE.MeshLambertMaterial({ color: 0xff6600 });
const playerBody    = new THREE.Mesh(playerBodyGeo, playerBodyMat);
playerBody.castShadow = true;
// The mesh origin is at its centre; we offset it up so the bottom sits on y=0
playerBody.position.y = PLAYER_HEIGHT / 2;
playerGroup.add(playerBody);

// Eyes — just so it's clear which way the player faces
const eyeGeo = new THREE.SphereGeometry(0.08, 6, 6);
const eyeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
[-0.18, 0.18].forEach(ex => {
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
  eye.position.set(ex, PLAYER_HEIGHT * 0.75, -PLAYER_DEPTH / 2 - 0.05);
  playerGroup.add(eye);
});

// ─── PLAYER STATE ─────────────────────────────────────────────────────────────
// Everything about the player in one place — easy to read and change.

interface PlayerState {
  lane:        number;   // 0 = left, 1 = centre, 2 = right
  targetX:     number;   // x position we're sliding toward
  currentX:    number;   // actual x position right now
  z:           number;   // how far forward the player has run
  velocityY:   number;   // vertical speed (positive = up)
  y:           number;   // current height above ground
  isJumping:   boolean;
  isSliding:   boolean;
  slideTimer:  number;   // countdown timer for slide
  isDead:      boolean;
  speed:       number;   // current forward speed
  score:       number;   // distance score
  coins:       number;
  timeAlive:   number;   // total seconds played
}

const player: PlayerState = {
  lane: 1, targetX: LANE_POSITIONS[1], currentX: LANE_POSITIONS[1],
  z: 0, velocityY: 0, y: 0,
  isJumping: false, isSliding: false, slideTimer: 0,
  isDead: false, speed: BASE_SPEED,
  score: 0, coins: 0, timeAlive: 0,
};

// ─── INPUT HANDLING ───────────────────────────────────────────────────────────
// We collect inputs here and apply them in the update loop.

function switchLane(dir: -1 | 1): void {
  if (player.isDead) return;
  const newLane = Math.max(0, Math.min(2, player.lane + dir));
  if (newLane !== player.lane) {
    player.lane    = newLane;
    player.targetX = LANE_POSITIONS[newLane];
  }
}

function tryJump(): void {
  if (player.isDead || player.isJumping) return;
  if (player.isSliding) { cancelSlide(); return; } // down-slide → up cancels slide
  player.isJumping  = true;
  player.velocityY  = JUMP_FORCE;
}

function trySlide(): void {
  if (player.isDead || player.isJumping || player.isSliding) return;
  player.isSliding  = true;
  player.slideTimer = SLIDE_DURATION;
  // Squish the visual body down — hitbox stays the same (Day 4 adds real hitboxes)
  playerBody.scale.set(1, 0.5, 1);
  playerBody.position.y = PLAYER_HEIGHT * 0.25; // keep it on the ground
}

function cancelSlide(): void {
  player.isSliding  = false;
  player.slideTimer = 0;
  playerBody.scale.set(1, 1, 1);
  playerBody.position.y = PLAYER_HEIGHT / 2;
}

// ── Keyboard ──
window.addEventListener('keydown', (e) => {
  if (gameState !== 'playing') return;
  switch (e.key) {
    case 'ArrowLeft':  case 'a': case 'A': switchLane(-1); break;
    case 'ArrowRight': case 'd': case 'D': switchLane( 1); break;
    case 'ArrowUp':    case 'w': case 'W': tryJump();      break;
    case 'ArrowDown':  case 's': case 'S': trySlide();     break;
    case 'Escape':
      if (gameState === 'playing') { gameState = 'paused'; showScreen('paused'); }
      break;
  }
});

// ── Touch / Swipe ──
// Detects which direction the finger moved and maps to an action.
let touchStartX = 0;
let touchStartY = 0;

window.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchend', (e) => {
  if (gameState !== 'playing') return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const minSwipe = 30; // pixels — ignore tiny accidental touches
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal swipe
    if (Math.abs(dx) > minSwipe) dx > 0 ? switchLane(1) : switchLane(-1);
  } else {
    // Vertical swipe
    if (Math.abs(dy) > minSwipe) dy < 0 ? tryJump() : trySlide();
  }
}, { passive: true });

// ─── GAME STATE + SCREENS ─────────────────────────────────────────────────────

type Screen = 'loading' | 'menu' | 'playing' | 'paused' | 'gameover';
let gameState: Screen = 'loading';
let highScore = parseInt(localStorage.getItem('raj-highscore') ?? '0');

function showScreen(name: Screen): void {
  (['loading', 'menu', 'pause', 'gameover'] as const).forEach(id => {
    document.getElementById(`screen-${id}`)?.classList.add('hidden');
  });
  if (name !== 'playing') {
    document.getElementById(
      `screen-${name === 'paused' ? 'pause' : name}`
    )?.classList.remove('hidden');
  }
}

function saveHighScore(): void {
  if (player.score > highScore) {
    highScore = player.score;
    localStorage.setItem('raj-highscore', String(highScore));
  }
}

function resetPlayer(): void {
  player.lane = 1; player.targetX = LANE_POSITIONS[1]; player.currentX = LANE_POSITIONS[1];
  player.z = 0; player.velocityY = 0; player.y = 0;
  player.isJumping = false; player.isSliding = false; player.slideTimer = 0;
  player.isDead = false; player.speed = BASE_SPEED;
  player.score = 0; player.coins = 0; player.timeAlive = 0;
  cancelSlide();
}

function triggerGameOver(): void {
  player.isDead = true;
  gameState     = 'gameover';
  saveHighScore();
  (document.getElementById('score-display')    as HTMLElement).textContent = `SCORE: ${player.score}`;
  (document.getElementById('highscore-display') as HTMLElement).textContent = `BEST: ${highScore}`;
  showScreen('gameover');
}

// ── Buttons ──
document.getElementById('btn-play')!.addEventListener('click', () => {
  resetPlayer();
  gameState = 'playing';
  showScreen('playing');
});
document.getElementById('btn-resume')!.addEventListener('click', () => {
  gameState = 'playing'; showScreen('playing');
});
document.getElementById('btn-quit')!.addEventListener('click', () => {
  gameState = 'menu'; showScreen('menu');
});
document.getElementById('btn-restart')!.addEventListener('click', () => {
  resetPlayer(); gameState = 'playing'; showScreen('playing');
});
document.getElementById('btn-menu')!.addEventListener('click', () => {
  gameState = 'menu'; showScreen('menu');
});

// ─── HUD UPDATE ───────────────────────────────────────────────────────────────

function updateHUD(): void {
  (document.getElementById('hud-score') as HTMLElement).textContent = `SCORE: ${player.score}`;
  (document.getElementById('hud-coins') as HTMLElement).textContent = `🪙 ${player.coins}`;
  (document.getElementById('hud-hi')    as HTMLElement).textContent = `BEST: ${highScore}`;
}

// ─── PLAYER UPDATE ────────────────────────────────────────────────────────────
// Called every frame while the game is running.

function updatePlayer(dt: number): void {
  if (player.isDead) return;

  // ── Forward movement ──
  player.timeAlive += dt;
  // Gradually increase speed every 10 seconds of play
  player.speed = BASE_SPEED + Math.floor(player.timeAlive / 10) * SPEED_INCREMENT;
  player.z    -= player.speed * dt; // moving in -z direction (into the screen)
  player.score = Math.floor(-player.z / 2); // 1 score point per 2 units

  // ── Lane switching (smooth lerp) ──
  // lerp = "blend" current position toward target position each frame
  player.currentX += (player.targetX - player.currentX) * Math.min(LANE_SWITCH_SPEED * dt, 1);

  // ── Jump physics ──
  if (player.isJumping) {
    player.velocityY += GRAVITY * dt; // gravity pulls down
    player.y         += player.velocityY * dt;
    if (player.y <= 0) {             // landed back on ground
      player.y         = 0;
      player.velocityY = 0;
      player.isJumping = false;
    }
  }

  // ── Slide timer ──
  if (player.isSliding) {
    player.slideTimer -= dt;
    if (player.slideTimer <= 0) cancelSlide();
  }

  // ── Apply to mesh ──
  playerGroup.position.set(player.currentX, player.y, player.z);

  // ── Running bob (subtle up-down when on ground) ──
  if (!player.isJumping && !player.isSliding) {
    const bob = Math.sin(player.timeAlive * 12) * 0.04;
    playerBody.position.y = PLAYER_HEIGHT / 2 + bob;
  }

  updateHUD();
}

// ─── CAMERA FOLLOW ────────────────────────────────────────────────────────────
// Camera sits behind and above the player, always looking slightly ahead.

function updateCamera(): void {
  const targetCamX = player.currentX * 0.3;         // slight lean when switching lanes
  const camX = camera.position.x + (targetCamX - camera.position.x) * 0.1;
  camera.position.set(camX, player.y + 5, player.z + 10);
  camera.lookAt(player.currentX * 0.1, player.y + 1, player.z - 5);
}

// ─── RESIZE ───────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── LOADING SCREEN ───────────────────────────────────────────────────────────

let loadProgress = 0;
const loadingBar = document.getElementById('loading-bar') as HTMLElement;
const loadInterval = setInterval(() => {
  loadProgress += Math.random() * 15 + 10;
  if (loadProgress >= 100) {
    loadProgress = 100;
    clearInterval(loadInterval);
    setTimeout(() => {
      gameState = 'menu';
      showScreen('menu');
      updateHUD();
    }, 300);
  }
  loadingBar.style.width = `${loadProgress}%`;
}, 120);

// ─── GAME LOOP ────────────────────────────────────────────────────────────────

const clock = new THREE.Clock();

function gameLoop(): void {
  requestAnimationFrame(gameLoop);
  const dt = Math.min(clock.getDelta(), 0.05); // cap dt to avoid huge jumps on tab switch

  if (gameState === 'playing') {
    updatePlayer(dt);
    updateCamera();
  }

  // Camera rest position on menu/gameover — look down the empty track
  if (gameState === 'menu' || gameState === 'loading') {
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, -10);
  }

  renderer.render(scene, camera);
}

gameLoop();
