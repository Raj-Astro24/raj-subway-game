// ─────────────────────────────────────────────────────────────────────────────
//  Raj Subway Game — main.ts
//  Day 7 FINAL: Power-ups · Polish · Difficulty curve
//  By Raj Computers
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { Character } from './character';
import { startMusic, stopMusic, playCoinSfx, playJumpSfx, playCrashSfx, playLaneSfx } from './audio';
import { PowerUpManager } from './powerups';

// ═══════════════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const LANE_X            = [-1.8, 0, 1.8] as const;
const LANE_SWITCH_SPEED = 12;
const JUMP_FORCE        = 8;
const GRAVITY           = -20;
const SLIDE_DURATION    = 0.7;
const BASE_SPEED        = 10;
const SPEED_INCREMENT   = 0.4;
const MAX_SPEED         = 22;
const PLAYER_H          = 1.6;

const SEG_LEN        = 20;
const SEG_GND_W      = 20;
const ROAD_W         = 5.4;
const POOL_SIZE      = 14;
const RECYCLE_BHD    = 25;

const OBS_AHEAD      = 65;
const OBS_GRACE      = 35;
const OBS_POOL_SZ    = 10;

const COIN_AHEAD     = 50;
const COIN_GRACE     = 18;
const COIN_POOL_SZ   = 42;
const MAGNET_RANGE   = 4.5;   // radius coins fly to player when magnet active

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

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xfff4e0, 1.3);
sun.position.set(10, 20, 10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xaad4ff, 0.3);
fill.position.set(-8, 10, -5); scene.add(fill);

// ═══════════════════════════════════════════════════════════════════════════════
//  SHARED MATERIALS + GEOMETRIES
// ═══════════════════════════════════════════════════════════════════════════════

const MAT_GROUND   = new THREE.MeshLambertMaterial({ color: 0x5a9c68 });
const MAT_ROAD     = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
const MAT_LINE     = new THREE.MeshLambertMaterial({ color: 0xdddddd });
const MAT_TRUNK    = new THREE.MeshLambertMaterial({ color: 0x8B5E3C });
const MAT_LEAVES_D = new THREE.MeshLambertMaterial({ color: 0x2d7a2d });
const MAT_LEAVES_L = new THREE.MeshLambertMaterial({ color: 0x3aa34a });
const MAT_BARRIER  = new THREE.MeshLambertMaterial({ color: 0xdd2222 });
const MAT_STRIPE   = new THREE.MeshLambertMaterial({ color: 0xFFAA00 });
const MAT_BEAM     = new THREE.MeshLambertMaterial({ color: 0x3355cc });
const MAT_COIN     = new THREE.MeshLambertMaterial({ color: 0xFFD700, emissive: new THREE.Color(0x664400) });
const MAT_BLDG_A   = new THREE.MeshLambertMaterial({ color: 0xd4a96a });
const MAT_BLDG_B   = new THREE.MeshLambertMaterial({ color: 0x8899aa });
const MAT_BLDG_C   = new THREE.MeshLambertMaterial({ color: 0xcc4422 });
const MAT_WINDOW   = new THREE.MeshLambertMaterial({ color: 0xaaddff, emissive: new THREE.Color(0x113355) });

const GEO_GROUND = new THREE.PlaneGeometry(SEG_GND_W, SEG_LEN);
const GEO_ROAD   = new THREE.PlaneGeometry(ROAD_W, SEG_LEN);
const GEO_LINE   = new THREE.PlaneGeometry(0.08, SEG_LEN);
const GEO_TRUNK  = new THREE.CylinderGeometry(0.15, 0.22, 1.4, 6);
const GEO_COIN   = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 10);

// ═══════════════════════════════════════════════════════════════════════════════
//  ENVIRONMENT BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

function makeTree(tall = false): THREE.Group {
  const g = new THREE.Group(); const h = tall ? 2.0 : 1.4;
  const trunk = new THREE.Mesh(GEO_TRUNK, MAT_TRUNK); trunk.position.y = h * 0.5; trunk.castShadow = true; g.add(trunk);
  [[1.0,2.2,h],[0.72,1.6,h+1.1],[0.44,1.2,h+1.9]].forEach(([r,lh,y]) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r,lh,7), tall ? MAT_LEAVES_D : MAT_LEAVES_L);
    c.position.y = y; c.castShadow = true; g.add(c);
  }); return g;
}
function makeBuilding(): THREE.Group {
  const g = new THREE.Group();
  const w = 1.5+Math.random()*1.5, h = 2+Math.random()*4, d = 1.2+Math.random()*1.0;
  const mat = [MAT_BLDG_A,MAT_BLDG_B,MAT_BLDG_C][Math.floor(Math.random()*3)];
  const body = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  body.position.y = h/2; body.castShadow = true; g.add(body);
  for (let wy=0.6; wy<h-0.4; wy+=1.0) for (let wx=-w*0.3; wx<=w*0.3; wx+=w*0.4) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.35,0.05), MAT_WINDOW);
    win.position.set(wx,wy,-d/2-0.03); g.add(win);
  } return g;
}
function makeLampPost(): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,3.5,6), new THREE.MeshLambertMaterial({color:0x888888}));
  pole.position.y = 1.75; g.add(pole);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6,0.15,0.15), new THREE.MeshLambertMaterial({color:0x666666}));
  head.position.set(-0.25,3.55,0); g.add(head);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1,6,6), new THREE.MeshLambertMaterial({color:0xffffcc,emissive:new THREE.Color(0x887700)}));
  bulb.position.set(-0.42,3.48,0); g.add(bulb); return g;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TRACK SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

class TrackSegment {
  group: THREE.Group; posZ = 0; private decor: THREE.Group[] = [];
  constructor() {
    this.group = new THREE.Group(); scene.add(this.group);
    const gnd = new THREE.Mesh(GEO_GROUND, MAT_GROUND);
    gnd.rotation.x=-Math.PI/2; gnd.position.z=-SEG_LEN/2; gnd.receiveShadow=true; this.group.add(gnd);
    const road = new THREE.Mesh(GEO_ROAD, MAT_ROAD);
    road.rotation.x=-Math.PI/2; road.position.set(0,0.01,-SEG_LEN/2); road.receiveShadow=true; this.group.add(road);
    [-2.85,2.85].forEach(x => {
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.08,SEG_LEN), new THREE.MeshLambertMaterial({color:0x999999}));
      k.position.set(x,0.04,-SEG_LEN/2); this.group.add(k);
    });
    [-1.8,1.8].forEach(x => {
      const l = new THREE.Mesh(GEO_LINE, MAT_LINE);
      l.rotation.x=-Math.PI/2; l.position.set(x,0.02,-SEG_LEN/2); this.group.add(l);
    });
    for (let i=0;i<6;i++) { const d=new THREE.Group(); this.group.add(d); this.decor.push(d); }
  }
  reset(z: number): void {
    this.posZ=z; this.group.position.z=z;
    this.decor.forEach((slot,i) => {
      slot.clear();
      const side=i<3?-1:1, xBase=side*(5.5+Math.random()*2.5), zOff=-(i%3)*(SEG_LEN/3)-Math.random()*4;
      slot.position.set(xBase,0,zOff);
      const roll=Math.random();
      slot.add(roll<0.5?makeTree(Math.random()>0.5):roll<0.8?makeBuilding():makeLampPost());
    });
  }
}
class TrackManager {
  private pool: TrackSegment[]=[];
  constructor() { for(let i=0;i<POOL_SIZE;i++){const s=new TrackSegment();s.reset(SEG_LEN-i*SEG_LEN);this.pool.push(s);} }
  update(pz: number): void {
    let leadZ=Infinity; for(const s of this.pool) if(s.posZ<leadZ) leadZ=s.posZ;
    for(const s of this.pool) if(s.posZ>pz+RECYCLE_BHD){leadZ-=SEG_LEN;s.reset(leadZ);}
  }
}
const track = new TrackManager();

// ═══════════════════════════════════════════════════════════════════════════════
//  OBSTACLE SYSTEM  — gap shrinks as score rises (difficulty curve)
// ═══════════════════════════════════════════════════════════════════════════════

type ObsType='barrier'|'lowbeam';
interface ObsData{group:THREE.Group;type:ObsType;worldZ:number;active:boolean;cx:number;cy:number;hw:number;hh:number;hd:number;}

function makeBarrierGroup():THREE.Group{const g=new THREE.Group();const body=new THREE.Mesh(new THREE.BoxGeometry(0.85,1.3,0.55),MAT_BARRIER);body.position.y=0.65;body.castShadow=true;g.add(body);const stripe=new THREE.Mesh(new THREE.BoxGeometry(1.1,0.2,0.55),MAT_STRIPE);stripe.position.y=1.4;g.add(stripe);return g;}
function makeLowBeamGroup():THREE.Group{const g=new THREE.Group();const beam=new THREE.Mesh(new THREE.BoxGeometry(ROAD_W,0.45,0.55),MAT_BEAM);beam.position.y=1.125;beam.castShadow=true;g.add(beam);[-2.4,2.4].forEach(x=>{const p=new THREE.Mesh(new THREE.BoxGeometry(0.25,0.9,0.55),MAT_BEAM);p.position.set(x,0.45,0);g.add(p);});return g;}

const obsPool:ObsData[]=[];
for(let i=0;i<OBS_POOL_SZ;i++){const isB=i>=7;const group=isB?makeLowBeamGroup():makeBarrierGroup();group.visible=false;scene.add(group);obsPool.push({group,type:isB?'lowbeam':'barrier',worldZ:0,active:false,cx:0,cy:isB?1.125:0.65,hw:isB?2.4:0.38,hh:isB?0.22:0.65,hd:0.28});}
let nextObsZ=0;

function obsGap(): number {
  // Gap shrinks from 35→16 as score rises 0→500, then stays at 16
  const t = Math.min(1, player.score / 500);
  return 35 - t * 19;
}

function activateObstacle(atZ:number):void{
  const wB=Math.random()<0.25&&atZ<-(OBS_GRACE+20);
  const cand=obsPool.filter(o=>!o.active&&o.type===(wB?'lowbeam':'barrier'));
  if(!cand.length)return;
  const obs=cand[0]; const lX=obs.type==='barrier'?LANE_X[Math.floor(Math.random()*3)]:0;
  obs.active=true;obs.worldZ=atZ;obs.cx=lX;obs.group.position.set(lX,0,atZ);obs.group.visible=true;
}
function updateObstacles(pz:number):void{
  while(nextObsZ>pz-OBS_AHEAD){
    if(nextObsZ>pz-OBS_GRACE){nextObsZ-=10;continue;}
    activateObstacle(nextObsZ); nextObsZ-=obsGap();
  }
  for(const o of obsPool){if(o.active&&o.worldZ>pz+20){o.active=false;o.group.visible=false;}}
}
function resetObstacles(pz:number):void{for(const o of obsPool){o.active=false;o.group.visible=false;}nextObsZ=pz-OBS_GRACE;}

// ═══════════════════════════════════════════════════════════════════════════════
//  COIN SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

interface CoinData{mesh:THREE.Mesh;worldZ:number;laneX:number;active:boolean;}
const coinPool:CoinData[]=[];
for(let i=0;i<COIN_POOL_SZ;i++){const m=new THREE.Mesh(GEO_COIN,MAT_COIN);m.rotation.x=Math.PI/2;m.visible=false;scene.add(m);coinPool.push({mesh:m,worldZ:0,laneX:0,active:false});}
let nextCoinZ=0;

function spawnCoinCluster(atZ:number):void{
  const lX=LANE_X[Math.floor(Math.random()*3)];
  const count=3+Math.floor(Math.random()*4); // 3–6 coins
  for(let i=0;i<count;i++){const s=coinPool.find(c=>!c.active);if(!s)return;s.active=true;s.worldZ=atZ-i*1.8;s.laneX=lX;s.mesh.position.set(lX,0.55,s.worldZ);s.mesh.visible=true;}
}
function updateCoins(pz:number, dt:number, magnetActive:boolean, px:number, py:number):void{
  while(nextCoinZ>pz-COIN_AHEAD){
    if(nextCoinZ>pz-COIN_GRACE){nextCoinZ-=8;continue;}
    spawnCoinCluster(nextCoinZ);nextCoinZ-=(10+Math.random()*12);
  }
  const now=performance.now()*0.001;
  for(const c of coinPool){
    if(!c.active)continue;
    c.mesh.rotation.y+=dt*3;

    // Magnet: pull coins toward player
    if(magnetActive){
      const dx=px-c.mesh.position.x, dz=pz-c.worldZ;
      const dist=Math.sqrt(dx*dx+dz*dz);
      if(dist<MAGNET_RANGE){
        const speed=Math.min(1,dt*8*(1-dist/MAGNET_RANGE)+dt*4);
        c.mesh.position.x+=dx*speed;
        c.worldZ+=dz*speed;
        c.mesh.position.z=c.worldZ;
        c.mesh.position.y=0.55+Math.sin(now*4+c.worldZ)*0.06;
      } else {
        c.mesh.position.y=0.55+Math.sin(now*0.003+c.worldZ)*0.08;
      }
    } else {
      c.mesh.position.y=0.55+Math.sin(now*0.003+c.worldZ)*0.08;
    }

    if(c.worldZ>pz+12){c.active=false;c.mesh.visible=false;}
  }
}
function resetCoins(pz:number):void{for(const c of coinPool){c.active=false;c.mesh.visible=false;}nextCoinZ=pz-COIN_GRACE;}

// ═══════════════════════════════════════════════════════════════════════════════
//  PLAYER + CHARACTER + POWER-UPS
// ═══════════════════════════════════════════════════════════════════════════════

const playerGroup=new THREE.Group(); scene.add(playerGroup);
const character=new Character();     playerGroup.add(character.root);
const powerUps=new PowerUpManager(scene, playerGroup);

// ═══════════════════════════════════════════════════════════════════════════════
//  PLAYER STATE
// ═══════════════════════════════════════════════════════════════════════════════

interface PlayerState{lane:number;targetX:number;currentX:number;z:number;velocityY:number;y:number;isJumping:boolean;isSliding:boolean;slideTimer:number;isDead:boolean;speed:number;score:number;coins:number;timeAlive:number;}
const player:PlayerState={lane:1,targetX:LANE_X[1],currentX:LANE_X[1],z:0,velocityY:0,y:0,isJumping:false,isSliding:false,slideTimer:0,isDead:false,speed:BASE_SPEED,score:0,coins:0,timeAlive:0};

function resetPlayer():void{
  Object.assign(player,{lane:1,targetX:LANE_X[1],currentX:LANE_X[1],z:0,velocityY:0,y:0,isJumping:false,isSliding:false,slideTimer:0,isDead:false,speed:BASE_SPEED,score:0,coins:0,timeAlive:0});
  cancelSlide(); character.state='run'; playerGroup.rotation.set(0,0,0);
  resetObstacles(0); resetCoins(0); powerUps.reset(0);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════════════════════════════════════════

function switchLane(dir:-1|1):void{if(player.isDead)return;const n=Math.max(0,Math.min(2,player.lane+dir));if(n!==player.lane){player.lane=n;player.targetX=LANE_X[n];playLaneSfx();}}
function tryJump():void{if(player.isDead||player.isJumping)return;if(player.isSliding){cancelSlide();return;}player.isJumping=true;player.velocityY=JUMP_FORCE;character.state='jump';playJumpSfx();}
function trySlide():void{if(player.isDead||player.isJumping||player.isSliding)return;player.isSliding=true;player.slideTimer=SLIDE_DURATION;character.state='slide';character.root.scale.set(1,0.5,1);}
function cancelSlide():void{player.isSliding=false;player.slideTimer=0;character.root.scale.set(1,1,1);character.state='run';}

window.addEventListener('keydown',e=>{
  if(gameState==='playing'){switch(e.key){case 'ArrowLeft':case 'a':case 'A':switchLane(-1);break;case 'ArrowRight':case 'd':case 'D':switchLane(1);break;case 'ArrowUp':case 'w':case 'W':tryJump();break;case 'ArrowDown':case 's':case 'S':trySlide();break;case 'Escape':gameState='paused';showScreen('paused');stopMusic();break;}}
  else if(gameState==='paused'&&e.key==='Escape'){gameState='playing';showScreen('playing');startMusic();}
});
let tX=0,tY=0;
window.addEventListener('touchstart',e=>{tX=e.touches[0].clientX;tY=e.touches[0].clientY;},{passive:true});
window.addEventListener('touchend',e=>{if(gameState!=='playing')return;const dx=e.changedTouches[0].clientX-tX,dy=e.changedTouches[0].clientY-tY;if(Math.abs(dx)>Math.abs(dy)){if(Math.abs(dx)>30)dx>0?switchLane(1):switchLane(-1);}else{if(Math.abs(dy)>30)dy<0?tryJump():trySlide();}},{passive:true});
document.getElementById('ctrl-left')! .addEventListener('touchstart',e=>{e.preventDefault();if(gameState==='playing')switchLane(-1);},{passive:false});
document.getElementById('ctrl-right')!.addEventListener('touchstart',e=>{e.preventDefault();if(gameState==='playing')switchLane(1); },{passive:false});
document.getElementById('ctrl-up')!   .addEventListener('touchstart',e=>{e.preventDefault();if(gameState==='playing')tryJump();    },{passive:false});
document.getElementById('ctrl-down')! .addEventListener('touchstart',e=>{e.preventDefault();if(gameState==='playing')trySlide();   },{passive:false});

// ═══════════════════════════════════════════════════════════════════════════════
//  COLLISION
// ═══════════════════════════════════════════════════════════════════════════════

function hitAABB(px:number,py:number,pz:number,phx:number,phy:number,phz:number,ox:number,oy:number,oz:number,ohx:number,ohy:number,ohz:number):boolean{const m=0.08;return Math.abs(px-ox)<(phx+ohx-m)&&Math.abs(py-oy)<(phy+ohy-m)&&Math.abs(pz-oz)<(phz+ohz-m);}

function checkCollisions():'obstacle'|'coin'|null{
  const pH=player.isSliding?PLAYER_H*0.25:PLAYER_H/2, pCY=player.y+pH;
  for(const o of obsPool){if(!o.active)continue;if(hitAABB(player.currentX,pCY,player.z,0.35,pH,0.35,o.cx,o.cy,o.worldZ,o.hw,o.hh,o.hd))return'obstacle';}
  for(const c of coinPool){if(!c.active)continue;if(hitAABB(player.currentX,pCY,player.z,0.35,pH,0.35,c.laneX,0.55,c.worldZ,0.32,0.32,0.1)){c.active=false;c.mesh.visible=false;player.coins++;return'coin';}}
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  GAME STATE + SCREENS
// ═══════════════════════════════════════════════════════════════════════════════

type Screen='loading'|'menu'|'playing'|'paused'|'gameover';
let gameState:Screen='loading';
let highScore=parseInt(localStorage.getItem('raj-highscore')?? '0');
let deathTimer=0;

const speedBar  = document.getElementById('speed-bar')     as HTMLElement;
const pauseBtn  = document.getElementById('btn-pause-icon') as HTMLButtonElement;
const hudScore  = document.getElementById('hud-score')      as HTMLElement;
const hudCoins  = document.getElementById('hud-coins')      as HTMLElement;
const hudHi     = document.getElementById('hud-hi')         as HTMLElement;
const hudPowerEl= document.getElementById('hud-power')      as HTMLElement;

function showScreen(name:Screen):void{
  (['loading','menu','pause','gameover'] as const).forEach(id=>document.getElementById(`screen-${id}`)?.classList.add('hidden'));
  if(name!=='playing')document.getElementById(`screen-${name==='paused'?'pause':name}`)?.classList.remove('hidden');
  pauseBtn.style.display=name==='playing'?'block':'none';
}
function triggerDeath():void{
  if(player.isDead)return;
  // Shield absorbs one hit
  if(powerUps.consumeShield()){
    // Flash white briefly then continue
    character.state='jump'; player.isJumping=true; player.velocityY=5;
    return;
  }
  player.isDead=true; character.state='crash';
  playCrashSfx(); stopMusic();
  if(player.score>highScore){highScore=player.score;localStorage.setItem('raj-highscore',String(highScore));}
  deathTimer=0.8;
}

document.getElementById('btn-play')!   .addEventListener('click',()=>{resetPlayer();gameState='playing';showScreen('playing');startMusic();});
document.getElementById('btn-resume')! .addEventListener('click',()=>{gameState='playing';showScreen('playing');startMusic();});
document.getElementById('btn-quit')!   .addEventListener('click',()=>{stopMusic();gameState='menu';showScreen('menu');});
document.getElementById('btn-restart')!.addEventListener('click',()=>{resetPlayer();gameState='playing';showScreen('playing');startMusic();});
document.getElementById('btn-menu')!   .addEventListener('click',()=>{stopMusic();gameState='menu';showScreen('menu');});
pauseBtn.addEventListener('click',()=>{gameState='paused';showScreen('paused');stopMusic();});

// ═══════════════════════════════════════════════════════════════════════════════
//  HUD + POWER-UP INDICATORS
// ═══════════════════════════════════════════════════════════════════════════════

let prevScore=0;
function updateHUD():void{
  if(player.score!==prevScore){
    hudScore.textContent=`SCORE: ${player.score}`;
    hudScore.classList.remove('score-pop');
    requestAnimationFrame(()=>hudScore.classList.add('score-pop'));
    prevScore=player.score;
  }
  hudCoins.textContent=`🪙 ${player.coins}`;
  hudHi.textContent   =`BEST: ${highScore}`;
  const pct=Math.min(100,((player.speed-BASE_SPEED)/(MAX_SPEED-BASE_SPEED))*100);
  speedBar.style.width=`${pct}%`;

  // Power-up indicators
  const effects=powerUps.effects;
  if(effects.length===0){
    hudPowerEl.textContent='';
  } else {
    hudPowerEl.textContent = effects.map(e=>{
      const bar='█'.repeat(Math.ceil(e.remaining));
      return e.kind==='magnet'?`🧲 ${bar}`:`🛡️ ${bar}`;
    }).join('  ');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PLAYER UPDATE
// ═══════════════════════════════════════════════════════════════════════════════

function updatePlayer(dt:number):void{
  if(player.isDead){
    if(deathTimer>0){
      deathTimer-=dt;
      playerGroup.rotation.z=Math.sin(performance.now()*0.02)*0.3;
      if(deathTimer<=0){
        playerGroup.rotation.z=0;gameState='gameover';
        (document.getElementById('score-display')    as HTMLElement).textContent=`SCORE: ${player.score}`;
        (document.getElementById('highscore-display')as HTMLElement).textContent=`BEST: ${highScore}`;
        showScreen('gameover');
      }
    }
    character.update(dt);return;
  }

  player.timeAlive+=dt;
  player.speed=Math.min(MAX_SPEED,BASE_SPEED+Math.floor(player.timeAlive/10)*SPEED_INCREMENT);
  player.z-=player.speed*dt;
  player.score=Math.floor(-player.z/2)+player.coins*5;
  player.currentX+=(player.targetX-player.currentX)*Math.min(LANE_SWITCH_SPEED*dt,1);

  if(player.isJumping){player.velocityY+=GRAVITY*dt;player.y+=player.velocityY*dt;if(player.y<=0){player.y=0;player.velocityY=0;player.isJumping=false;character.state='run';}}
  if(player.isSliding){player.slideTimer-=dt;if(player.slideTimer<=0)cancelSlide();}

  playerGroup.position.set(player.currentX,player.y,player.z);
  playerGroup.rotation.set(0,0,0);
  character.update(dt);
  updateHUD();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CAMERA
// ═══════════════════════════════════════════════════════════════════════════════

function updateCamera():void{
  const tX=player.currentX*0.3;
  camera.position.x+=(tX-camera.position.x)*0.1;
  camera.position.y=player.y+5; camera.position.z=player.z+10;
  camera.lookAt(player.currentX*0.1,player.y+1.2,player.z-5);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  RESIZE + LOADING
// ═══════════════════════════════════════════════════════════════════════════════

window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);});

let loadPct=0;
const bar=document.getElementById('loading-bar') as HTMLElement;
const lid=setInterval(()=>{
  loadPct+=Math.random()*15+10;
  if(loadPct>=100){loadPct=100;clearInterval(lid);setTimeout(()=>{gameState='menu';showScreen('menu');updateHUD();},300);}
  bar.style.width=`${loadPct}%`;
},120);

// ═══════════════════════════════════════════════════════════════════════════════
//  GAME LOOP
// ═══════════════════════════════════════════════════════════════════════════════

const clock=new THREE.Clock();
function gameLoop():void{
  requestAnimationFrame(gameLoop);
  const dt=Math.min(clock.getDelta(),0.05);

  if(gameState==='playing'){
    updatePlayer(dt);
    if(!player.isDead){
      const magnetOn=powerUps.hasEffect('magnet');
      track.update(player.z);
      updateObstacles(player.z);
      updateCoins(player.z,dt,magnetOn,player.currentX,player.y);
      powerUps.update(dt,player.z);

      // Check obstacle + coin collisions
      const hit=checkCollisions();
      if(hit==='obstacle') triggerDeath();
      else if(hit==='coin') playCoinSfx();

      // Check power-up pickup
      const pu=powerUps.checkPickup(player.currentX,player.y,player.z);
      if(pu){
        playCoinSfx(); // reuse coin sound for now
      }
    }
    updateCamera();
  }

  if(gameState==='menu'||gameState==='loading'){camera.position.set(0,5,10);camera.lookAt(0,0,-10);}
  renderer.render(scene,camera);
}
gameLoop();
