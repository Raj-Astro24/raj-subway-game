// ─────────────────────────────────────────────────────────────────────────────
//  Raj Subway Game — character.ts
//  Day 5: Procedural low-poly character with run / jump / slide / crash poses
//  By Raj Computers
//
//  HOW IT WORKS
//  ─────────────────────────────────────────────────────────────────────────────
//  We build the character from simple Three.js boxes and capsules (like a
//  stylised action-figure). Each body part is a separate mesh inside a Group,
//  so we can rotate limbs individually every frame to create smooth animations.
//
//  To swap in a real Mixamo .glb later:
//    1. Download your character from mixamo.com as .glb (with animations)
//    2. Drop it into /public/models/character.glb
//    3. Uncomment the GLTFLoader block at the bottom of this file
//    4. Delete the buildProceduralCharacter() call
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

// ── Skin colours ──────────────────────────────────────────────────────────────
const C_SKIN    = 0xE8A87C;   // warm tan
const C_SHIRT   = 0x1a73e8;   // Raj blue
const C_PANTS   = 0x222244;   // dark navy
const C_SHOES   = 0xFFD700;   // gold shoes (Raj Computers brand colour)
const C_HAIR    = 0x1a0a00;   // dark hair
const C_EYE_W   = 0xffffff;
const C_EYE_P   = 0x000000;

// ── Helper: make a coloured box mesh ─────────────────────────────────────────
function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  m.castShadow = true;
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────
//  CHARACTER CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class Character {
  root:       THREE.Group;   // attach this to playerGroup
  state:      'run' | 'jump' | 'slide' | 'crash' = 'run';
  private t = 0;             // animation timer

  // Body parts we animate each frame
  private head:     THREE.Group;
  private torso:    THREE.Mesh;
  private armL:     THREE.Group;
  private armR:     THREE.Group;
  private legL:     THREE.Group;
  private legR:     THREE.Group;
  private forearmL: THREE.Mesh;
  private forearmR: THREE.Mesh;
  private shinL:    THREE.Mesh;
  private shinR:    THREE.Mesh;

  constructor() {
    this.root = new THREE.Group();

    // ── Head (with hair, eyes, and a smile) ──────────────────────────────────
    this.head = new THREE.Group();

    const skull = box(0.42, 0.42, 0.42, C_SKIN);
    this.head.add(skull);

    // Hair (flat box on top)
    const hair = box(0.44, 0.1, 0.44, C_HAIR);
    hair.position.y = 0.26;
    this.head.add(hair);

    // Eyes
    [[-0.1, 0.05, -0.22], [0.1, 0.05, -0.22]].forEach(([x, y, z]) => {
      const eyeW = box(0.1, 0.08, 0.04, C_EYE_W);
      eyeW.position.set(x, y, z);
      const pupil = box(0.05, 0.05, 0.04, C_EYE_P);
      pupil.position.set(x, y, z - 0.02);
      this.head.add(eyeW, pupil);
    });

    this.head.position.y = 1.6;   // sits on top of torso
    this.root.add(this.head);

    // ── Torso ─────────────────────────────────────────────────────────────────
    this.torso = box(0.42, 0.5, 0.28, C_SHIRT);
    this.torso.position.y = 1.15;
    this.root.add(this.torso);

    // Raj logo stripe on shirt
    const stripe = box(0.44, 0.06, 0.29, C_SHOES);
    stripe.position.y = 1.22;
    this.root.add(stripe);

    // ── Arms ──────────────────────────────────────────────────────────────────
    // Each arm is: upper arm group (pivot at shoulder) → forearm child

    const makeArm = (side: -1 | 1): [THREE.Group, THREE.Mesh] => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.33, 1.3, 0);

      const upper = box(0.14, 0.3, 0.14, C_SHIRT);
      upper.position.y = -0.15;        // hang below shoulder pivot
      shoulder.add(upper);

      const forearm = box(0.12, 0.28, 0.12, C_SKIN);
      forearm.position.y = -0.44;
      shoulder.add(forearm);

      // Hand
      const hand = box(0.14, 0.12, 0.14, C_SKIN);
      hand.position.y = -0.62;
      shoulder.add(hand);

      this.root.add(shoulder);
      return [shoulder, forearm];
    };

    [this.armL, this.forearmL] = makeArm(-1);
    [this.armR, this.forearmR] = makeArm(1);

    // ── Legs ──────────────────────────────────────────────────────────────────
    const makeLeg = (side: -1 | 1): [THREE.Group, THREE.Mesh] => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.14, 0.9, 0);

      const thigh = box(0.18, 0.36, 0.18, C_PANTS);
      thigh.position.y = -0.18;
      hip.add(thigh);

      const shin = box(0.15, 0.34, 0.15, C_PANTS);
      shin.position.y = -0.52;
      hip.add(shin);

      // Shoe
      const shoe = box(0.18, 0.1, 0.24, C_SHOES);
      shoe.position.set(0, -0.72, 0.04);
      hip.add(shoe);

      this.root.add(hip);
      return [hip, shin];
    };

    [this.legL, this.shinL] = makeLeg(-1);
    [this.legR, this.shinR] = makeLeg(1);

    // Position the whole character so its feet are at y = 0
    this.root.position.y = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  UPDATE  — called every frame with delta time (dt) in seconds
  //  Drives the limb rotations for each animation state.
  // ─────────────────────────────────────────────────────────────────────────

  update(dt: number): void {
    this.t += dt;

    switch (this.state) {
      case 'run':   this.animRun();   break;
      case 'jump':  this.animJump();  break;
      case 'slide': this.animSlide(); break;
      case 'crash': this.animCrash(); break;
    }
  }

  // ── Running: arms and legs swing opposite to each other ──────────────────
  private animRun(): void {
    const freq  = 8;                           // swing frequency
    const swing = Math.sin(this.t * freq);    // −1 … +1

    // Reset torso to upright
    this.root.rotation.x = 0;
    this.head.rotation.x = 0;
    this.torso.position.y = 1.15;
    this.head.position.y  = 1.6;

    // Legs: opposite swing
    this.legL.rotation.x =  swing * 0.6;
    this.legR.rotation.x = -swing * 0.6;

    // Arms: opposite to legs
    this.armL.rotation.x = -swing * 0.5;
    this.armR.rotation.x =  swing * 0.5;

    // Slight body bob
    this.root.position.y = Math.abs(Math.sin(this.t * freq)) * 0.04;
  }

  // ── Jumping: arms out, legs tuck slightly ────────────────────────────────
  private animJump(): void {
    const tuck = 0.4;
    this.legL.rotation.x = THREE.MathUtils.lerp(this.legL.rotation.x, -tuck, 0.2);
    this.legR.rotation.x = THREE.MathUtils.lerp(this.legR.rotation.x, -tuck, 0.2);
    this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, -1.0, 0.2);
    this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, -1.0, 0.2);
    this.root.rotation.x  = 0;
    this.root.position.y  = 0;
  }

  // ── Sliding: whole body leans forward / squishes ─────────────────────────
  private animSlide(): void {
    this.root.rotation.x  = 1.2;              // lean forward hard
    this.root.position.y  = -0.5;            // drop to ground
    this.head.rotation.x  = -0.5;            // chin up
    this.legL.rotation.x  = 0.4;
    this.legR.rotation.x  = 0.4;
    this.armL.rotation.x  = 0.6;
    this.armR.rotation.x  = 0.6;
  }

  // ── Crash: ragdoll-ish spin ───────────────────────────────────────────────
  private animCrash(): void {
    this.root.rotation.z  = Math.sin(this.t * 10) * 0.4;
    this.legL.rotation.x  = Math.sin(this.t * 12) * 0.8;
    this.legR.rotation.x  = -Math.sin(this.t * 12) * 0.8;
    this.armL.rotation.x  = Math.sin(this.t * 10) * 1.0;
    this.armR.rotation.x  = -Math.sin(this.t * 10) * 1.0;
  }
}
