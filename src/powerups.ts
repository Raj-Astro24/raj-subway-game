// ─────────────────────────────────────────────────────────────────────────────
//  Raj Subway Game — powerups.ts
//  Day 7: Coin Magnet and Shield power-ups
//  By Raj Computers
//
//  HOW IT WORKS
//  Power-up pickups spawn on the track exactly like coins.
//  When collected they activate a timed effect:
//    MAGNET  — nearby coins fly to the player automatically for 8 s
//    SHIELD  — the next obstacle hit is absorbed instead of killing you
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

// ── Types ─────────────────────────────────────────────────────────────────────
export type PowerUpKind = 'magnet' | 'shield';

export interface PowerUpPickup {
  mesh:   THREE.Group;
  kind:   PowerUpKind;
  worldZ: number;
  active: boolean;
}

export interface ActiveEffect {
  kind:      PowerUpKind;
  remaining: number;   // seconds left
}

// ── Visual constants ──────────────────────────────────────────────────────────
const COLOR_MAGNET = 0xff44cc;   // bright magenta
const COLOR_SHIELD = 0x44ddff;   // cyan

// ── Build pickup mesh ─────────────────────────────────────────────────────────
function makeMagnetMesh(): THREE.Group {
  const g = new THREE.Group();
  // A U-shaped magnet from two boxes
  const mat = new THREE.MeshLambertMaterial({ color: COLOR_MAGNET });
  const left  = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.2), mat);
  left.position.set(-0.18, 0.28, 0); g.add(left);
  const right = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.2), mat);
  right.position.set( 0.18, 0.28, 0); g.add(right);
  const top   = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.2, 0.2), mat);
  top.position.set(0, 0.5, 0); g.add(top);
  // North/South pole tips (red + blue)
  const red  = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.22),
    new THREE.MeshLambertMaterial({ color: 0xff2222 }));
  red.position.set(-0.18, -0.02, 0); g.add(red);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.22),
    new THREE.MeshLambertMaterial({ color: 0x2222ff }));
  blue.position.set( 0.18, -0.02, 0); g.add(blue);
  return g;
}

function makeShieldMesh(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: COLOR_SHIELD, transparent: true, opacity: 0.85 });
  // Hexagonal prism for a shield look
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 6), mat);
  body.rotation.x = Math.PI / 2; g.add(body);
  // Star in the centre
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.18),
    new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: new THREE.Color(0x446688) }));
  star.position.z = -0.08; g.add(star);
  return g;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  POWER-UP MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

const POOL_SZ     = 6;
const SPAWN_AHEAD = 55;
const MIN_GAP     = 40;
const MAX_GAP     = 80;
const GRACE       = 60;    // no power-ups in first N units

export class PowerUpManager {
  private pool:      PowerUpPickup[] = [];
  private nextSpawn: number = 0;
  private scene:     THREE.Scene;

  // Currently active effects (at most 2 at a time)
  public effects: ActiveEffect[] = [];

  // Shield visual on the player
  private shieldMesh: THREE.Mesh;
  private shieldAttached = false;

  constructor(scene: THREE.Scene, playerGroup: THREE.Group) {
    this.scene = scene;

    // Build pickup pool (3 magnets, 3 shields)
    for (let i = 0; i < POOL_SZ; i++) {
      const kind: PowerUpKind = i < 3 ? 'magnet' : 'shield';
      const mesh = kind === 'magnet' ? makeMagnetMesh() : makeShieldMesh();
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, kind, worldZ: 0, active: false });
    }

    // Shield bubble that wraps the player when active
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 10, 10),
      new THREE.MeshLambertMaterial({
        color: COLOR_SHIELD, transparent: true, opacity: 0.22, wireframe: false,
      })
    );
    this.shieldMesh.visible = false;
    playerGroup.add(this.shieldMesh);
    this.shieldMesh.position.set(0, 0.8, 0);
  }

  reset(playerZ: number): void {
    for (const p of this.pool) { p.active = false; p.mesh.visible = false; }
    this.effects = [];
    this.nextSpawn = playerZ - GRACE;
    this.shieldMesh.visible = false;
  }

  /** Call every frame while playing. */
  update(dt: number, playerZ: number): void {
    // ── Spawn pickups ahead ──
    while (this.nextSpawn > playerZ - SPAWN_AHEAD) {
      if (this.nextSpawn > playerZ - GRACE) { this.nextSpawn -= 15; continue; }
      this.spawn(this.nextSpawn);
      this.nextSpawn -= MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP);
    }

    // ── Animate pickups (float + spin) ──
    const now = performance.now() * 0.001;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y  = 0.75 + Math.sin(now * 2 + p.worldZ) * 0.12;
      // Recycle if behind player
      if (p.worldZ > playerZ + 15) { p.active = false; p.mesh.visible = false; }
    }

    // ── Tick active effects ──
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].remaining -= dt;
      if (this.effects[i].remaining <= 0) {
        this.effects.splice(i, 1);
      }
    }

    // ── Shield bubble visibility ──
    const hasShield = this.hasEffect('shield');
    if (hasShield !== this.shieldAttached) {
      this.shieldMesh.visible = hasShield;
      this.shieldAttached     = hasShield;
    }
    if (hasShield) {
      // Pulse the shield opacity
      (this.shieldMesh.material as THREE.MeshLambertMaterial).opacity =
        0.15 + Math.sin(now * 6) * 0.07;
    }
  }

  /** Check AABB pickup collision. Returns the kind collected, or null. */
  checkPickup(px: number, py: number, pz: number): PowerUpKind | null {
    for (const p of this.pool) {
      if (!p.active) continue;
      if (Math.abs(px - p.mesh.position.x) < 0.7 &&
          Math.abs(py + 0.8 - p.mesh.position.y) < 0.8 &&
          Math.abs(pz - p.worldZ) < 0.7) {
        p.active = false; p.mesh.visible = false;
        this.activate(p.kind);
        return p.kind;
      }
    }
    return null;
  }

  /** Activate a power-up effect (or extend if already running). */
  private activate(kind: PowerUpKind): void {
    const duration = kind === 'magnet' ? 8 : 6;
    const existing = this.effects.find(e => e.kind === kind);
    if (existing) { existing.remaining = duration; }
    else          { this.effects.push({ kind, remaining: duration }); }
  }

  hasEffect(kind: PowerUpKind): boolean {
    return this.effects.some(e => e.kind === kind && e.remaining > 0);
  }

  /** Consume one shield charge (call when player hits obstacle). Returns true if shielded. */
  consumeShield(): boolean {
    const idx = this.effects.findIndex(e => e.kind === 'shield');
    if (idx === -1) return false;
    this.effects.splice(idx, 1);
    this.shieldMesh.visible = false; this.shieldAttached = false;
    return true;
  }

  private spawn(atZ: number): void {
    const inactive = this.pool.filter(p => !p.active);
    if (!inactive.length) return;
    // Alternate kinds; prefer whichever has more inactive slots
    const magnets = inactive.filter(p => p.kind === 'magnet');
    const shields  = inactive.filter(p => p.kind === 'shield');
    const pick     = (magnets.length >= shields.length ? magnets : shields)[0];
    const laneX    = [-1.8, 0, 1.8][Math.floor(Math.random() * 3)];
    pick.active  = true;
    pick.worldZ  = atZ;
    pick.mesh.position.set(laneX, 0.75, atZ);
    pick.mesh.visible = true;
  }
}
