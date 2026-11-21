// ─────────────────────────────────────────────────────────────────────────────
//  Raj Subway Game — main.ts
//  Day 1: Project setup + empty 3D scene
//  By Raj Computers
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

// ── 1. RENDERER ──────────────────────────────────────────────────────────────
// The renderer is what draws the 3D world onto the HTML canvas element.
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap at 2x for perf
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // allows objects to cast shadows

// ── 2. SCENE ─────────────────────────────────────────────────────────────────
// The "scene" is a container that holds everything — ground, lights, player, etc.
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // sky-blue background
scene.fog = new THREE.Fog(0x87CEEB, 30, 80);  // fog fades distant objects out

// ── 3. CAMERA ────────────────────────────────────────────────────────────────
// A perspective camera mimics how the human eye sees — things farther away look smaller.
// Arguments: field-of-view (degrees), aspect ratio, near clip, far clip
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 5, 10);   // lifted up and pulled back so we look down the track
camera.lookAt(0, 0, 0);          // always looking toward the origin (where the player will be)

// ── 4. LIGHTING ──────────────────────────────────────────────────────────────
// Ambient light: soft base light that fills everything equally (no shadows from this)
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

// Directional light: acts like the sun — casts shadows, gives depth
const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.2);
sunLight.position.set(10, 20, 10);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 1024;
sunLight.shadow.mapSize.height = 1024;
scene.add(sunLight);

// ── 5. GROUND PLANE ──────────────────────────────────────────────────────────
// A flat rectangle that acts as our road/track base
const groundGeo = new THREE.PlaneGeometry(9, 200); // 9 units wide, 200 long
const groundMat = new THREE.MeshLambertMaterial({ color: 0x4a7c59 }); // green ground
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2; // planes are vertical by default — rotate flat
ground.receiveShadow = true;
scene.add(ground);

// Road surface on top of ground
const roadGeo = new THREE.PlaneGeometry(5.4, 200);
const roadMat = new THREE.MeshLambertMaterial({ color: 0x555555 }); // grey road
const road = new THREE.Mesh(roadGeo, roadMat);
road.rotation.x = -Math.PI / 2;
road.position.y = 0.01; // just above ground to avoid z-fighting flicker
road.receiveShadow = true;
scene.add(road);

// Lane dividers (the dashed lines you see on a road)
const lineMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
[-1.8, 1.8].forEach(x => {
  const lineGeo = new THREE.PlaneGeometry(0.08, 200);
  const line = new THREE.Mesh(lineGeo, lineMat);
  line.rotation.x = -Math.PI / 2;
  line.position.set(x, 0.02, 0);
  scene.add(line);
});

// ── 6. PLAYER PLACEHOLDER ────────────────────────────────────────────────────
// Day 1: just a coloured box. Day 5 we replace this with a real character.
const playerGeo = new THREE.BoxGeometry(0.8, 1.6, 0.8);
const playerMat = new THREE.MeshLambertMaterial({ color: 0xff6600 }); // orange cube
const player = new THREE.Mesh(playerGeo, playerMat);
player.position.set(0, 0.8, 4); // centre lane, sitting on the road, a bit in front
player.castShadow = true;
scene.add(player);

// ── 7. SOME BACKGROUND TREES (simple cylinders + cones) ──────────────────────
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

// Plant trees on both sides of the track
for (let z = -80; z < 10; z += 8) {
  makeTree(-4.5, z);
  makeTree(4.5, z);
}

// ── 8. RESIZE HANDLER ────────────────────────────────────────────────────────
// When the browser window is resized, update camera and renderer to match
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── 9. SCREEN MANAGEMENT ─────────────────────────────────────────────────────
type Screen = 'loading' | 'menu' | 'playing' | 'paused' | 'gameover';

function showScreen(name: Screen): void {
  ['loading', 'menu', 'pause', 'gameover'].forEach(id => {
    const el = document.getElementById(`screen-${id}`);
    if (el) el.classList.add('hidden');
  });
  if (name !== 'playing') {
    const el = document.getElementById(`screen-${name === 'paused' ? 'pause' : name}`);
    if (el) el.classList.remove('hidden');
  }
}

// ── 10. GAME STATE ───────────────────────────────────────────────────────────
let gameState: Screen = 'loading';
let highScore = parseInt(localStorage.getItem('raj-highscore') ?? '0');

// Update the best score display on game-over
function updateHighScore(score: number): void {
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('raj-highscore', String(highScore));
  }
  (document.getElementById('hud-hi') as HTMLElement).textContent = `BEST: ${highScore}`;
}

// ── 11. BUTTON WIRING ────────────────────────────────────────────────────────
document.getElementById('btn-play')!.addEventListener('click', () => {
  gameState = 'playing';
  showScreen('playing');
});

document.getElementById('btn-resume')!.addEventListener('click', () => {
  gameState = 'playing';
  showScreen('playing');
});

document.getElementById('btn-quit')!.addEventListener('click', () => {
  gameState = 'menu';
  showScreen('menu');
});

document.getElementById('btn-restart')!.addEventListener('click', () => {
  gameState = 'playing';
  showScreen('playing');
});

document.getElementById('btn-menu')!.addEventListener('click', () => {
  gameState = 'menu';
  showScreen('menu');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (gameState === 'playing') { gameState = 'paused'; showScreen('paused'); }
    else if (gameState === 'paused') { gameState = 'playing'; showScreen('playing'); }
  }
});

// ── 12. LOADING SIMULATION ───────────────────────────────────────────────────
// Fake a loading bar for now — Day 3+ this will track real asset loading
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
      updateHighScore(0); // init best-score display
    }, 300);
  }
  loadingBar.style.width = `${loadProgress}%`;
}, 120);

// ── 13. GAME LOOP ─────────────────────────────────────────────────────────────
// This runs ~60 times per second. It's the heartbeat of the game.
// Every frame: update game logic → render the scene → repeat.
const clock = new THREE.Clock();

function gameLoop(): void {
  requestAnimationFrame(gameLoop); // asks the browser to call us again next frame

  const delta = clock.getDelta(); // time (in seconds) since last frame — keeps speed consistent

  // ── Animate the player box (simple bob) so the scene feels alive ──
  if (gameState === 'playing') {
    player.position.y = 0.8 + Math.sin(clock.getElapsedTime() * 4) * 0.05;
    player.rotation.y += delta * 0.3; // slow spin as a placeholder
  }

  renderer.render(scene, camera); // draw everything
}

gameLoop(); // start the loop!
