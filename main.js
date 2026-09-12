/**
 * main.js — Línea de Envasado 3D  (v4)
 * Cambios: cámara mobile, polvo visible en tolva, robot FANUC, flowpack + cajas mejoradas
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ─────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────
export const plantState = {
  running: false,
  mode: 'manual',
  alarm: false,
  emergency: false,
  nivel: 0.85,
  bolsitas: 0,
  cajas: 0,
  speed: 1.0,
  _flowpackTimer: 0,
  _bolsitasEnCaja: 0,
};

const throughputHistory = Array(26).fill(0);
let _minTimer = 0;

// ─────────────────────────────────────────────
// RENDERER
// ─────────────────────────────────────────────
const canvas = document.getElementById('canvas3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setClearColor(0xe8edf1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe8edf1, 48, 100);
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
const studioEnvironment = pmrem.fromScene(room, 0.04);
scene.environment = studioEnvironment.texture;
room.dispose();
pmrem.dispose();

// ─────────────────────────────────────────────
// CÁMARA — posición inicial buena para desktop y móvil
// ─────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);

// Vista isométrica 3/4 — toda la línea visible
const CAM_DEFAULT = { x: 17, y: 14, z: 25 };
camera.position.set(CAM_DEFAULT.x, CAM_DEFAULT.y, CAM_DEFAULT.z);
camera.lookAt(1, 2, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping  = true;
controls.dampingFactor  = 0.06;
controls.minDistance    = 5;
controls.maxDistance    = 45;
controls.maxPolarAngle  = Math.PI / 2.05;
controls.target.set(1, 2, 0);

// Gestos táctiles: un dedo rota, dos dedos zoom+pan
controls.touches = {
  ONE:  THREE.TOUCH.ROTATE,
  TWO:  THREE.TOUCH.DOLLY_PAN,
};
controls.mouseButtons = {
  LEFT:   THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT:  THREE.MOUSE.PAN,
};

// Botón reset-cámara (esquina superior izquierda sobre el canvas)
const camResetBtn = document.createElement('button');
camResetBtn.textContent = '↺ Vista general';
camResetBtn.className = 'camera-home';
camResetBtn.title = 'Resetear cámara';
Object.assign(camResetBtn.style, {
  position:'fixed', top:'14px', left:'14px', zIndex:'40',
  background:'rgba(26,34,53,0.85)', color:'#f0883e',
  border:'1px solid #2a3a55', borderRadius:'6px',
  padding:'5px 10px', fontFamily:'monospace', fontSize:'1rem',
  cursor:'pointer'
});
camResetBtn.onclick = () => {
  frameLine();
};
document.body.appendChild(camResetBtn);

// ─────────────────────────────────────────────
// ILUMINACIÓN
// ─────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xd0e8ff, 0.65));

const sun = new THREE.DirectionalLight(0xfff5e0, 2.1);
sun.position.set(-10, 18, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { near:0.5, far:60, left:-28, right:28, top:25, bottom:-25 });
sun.shadow.normalBias = 0.035;
sun.shadow.bias = -0.0001;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xcce8ff, 0x403226, 1.0));

const fill = new THREE.DirectionalLight(0xaac8ff, 0.5);
fill.position.set(14, 8, -8);
scene.add(fill);

function lamp(x, z, col=0xffe8b0, intensity=2.2, dist=12) {
  const pl = new THREE.PointLight(col, intensity, dist, 1.8);
  pl.position.set(x, 9.2, z);
  scene.add(pl);
  const fix = new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.3,0.28,8),
    new THREE.MeshStandardMaterial({ color:0xbbbbbb, metalness:0.7, roughness:0.3 }));
  fix.position.set(x, 9.35, z);
  scene.add(fix);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14,8,8),
    new THREE.MeshStandardMaterial({ color:0xfffbe0, emissive:0xfffbe0, emissiveIntensity:2.5 }));
  bulb.position.set(x, 9.1, z);
  scene.add(bulb);
}
// Iluminación de estudio: sin luminarias flotantes sobre las máquinas.

// ─────────────────────────────────────────────
// PISO FÁBRICA
// ─────────────────────────────────────────────
const floorMat = new THREE.MeshStandardMaterial({ color:0xd6dee3, roughness:0.9 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(55,28), floorMat);
floor.rotation.x = -Math.PI/2; floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(55,28,0xc0cbd2,0xcbd5db);
grid.position.y = 0.005;
grid.material.transparent=true; grid.material.opacity=0.35;
scene.add(grid);
function floorLine(x1,z1,x2,z2) {
  const pts=[new THREE.Vector3(x1,0.01,z1),new THREE.Vector3(x2,0.01,z2)];
  scene.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({color:0xf5c518})
  ));
}
floorLine(-13,-3.8,15,-3.8); floorLine(-13,3.8,15,3.8);

// ─────────────────────────────────────────────
// MATERIALES
// ─────────────────────────────────────────────
const steel     = () => new THREE.MeshStandardMaterial({ color:0xa8b7c3, roughness:0.34, metalness:0.72 });
const steelDk   = () => new THREE.MeshStandardMaterial({ color:0x526474, roughness:0.42, metalness:0.6 });
const steelLt   = () => new THREE.MeshStandardMaterial({ color:0xc4ced4, roughness:0.3, metalness:0.75 });
const panelWh   = () => new THREE.MeshStandardMaterial({ color:0xdce8f0, roughness:0.55 });
const panelBl   = () => new THREE.MeshStandardMaterial({ color:0x157f88, roughness:0.42, metalness:0.15 });
const orange    = () => new THREE.MeshStandardMaterial({ color:0xf0883e, roughness:0.45, metalness:0.20 });
const fanucOrg  = () => new THREE.MeshStandardMaterial({ color:0xff6600, roughness:0.30, metalness:0.15 });
const yellow    = () => new THREE.MeshStandardMaterial({ color:0xf5c518, roughness:0.5 });
const greenLed  = () => new THREE.MeshStandardMaterial({ color:0x22c55e, emissive:0x22c55e, emissiveIntensity:1.5 });
const redLed    = () => new THREE.MeshStandardMaterial({ color:0xef4444, emissive:0xef4444, emissiveIntensity:1.5 });
const yellowLed = () => new THREE.MeshStandardMaterial({ color:0xfbbf24, emissive:0xfbbf24, emissiveIntensity:1.5 });
const glassMat  = () => new THREE.MeshStandardMaterial({ color:0x88ccff, roughness:0.05, transparent:true, opacity:0.22 });
const rubber    = () => new THREE.MeshStandardMaterial({ color:0x222222, roughness:0.95 });
const cardboard = () => new THREE.MeshStandardMaterial({ color:0xc4924e, roughness:0.92 });
const wood      = () => new THREE.MeshStandardMaterial({ color:0x8b6340, roughness:0.95 });
const powderMat = new THREE.MeshStandardMaterial({ color:0xf5f0e8, roughness:0.95 });   // polvo blanco

// Helpers
function bx(w,h,d,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  m.position.set(x,y,z); m.rotation.set(rx,ry,rz);
  m.castShadow=true; m.receiveShadow=true; return m;
}
function cy(rT,rB,h,seg,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rT,rB,h,seg),mat);
  m.position.set(x,y,z); m.rotation.set(rx,ry,rz);
  m.castShadow=true; m.receiveShadow=true; return m;
}
function sp(r,mat,x=0,y=0,z=0) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r,12,12),mat);
  m.position.set(x,y,z); m.castShadow=true; return m;
}

// ══════════════════════════════════════════════════════
//  TOLVA  (x = −9) — con nivel de polvo animado + partículas
// ══════════════════════════════════════════════════════
const tolvaGroup = new THREE.Group();
tolvaGroup.position.set(-9, 0, 0);

// Estructura de soporte
const legXZ = [[-0.9,0.9],[-0.9,-0.9],[0.9,0.9],[0.9,-0.9]];
legXZ.forEach(([lx,lz]) => tolvaGroup.add(bx(0.12,4.8,0.12,steelDk(),lx,2.4,lz)));
[1.0,2.6,4.0].forEach(h => {
  tolvaGroup.add(bx(1.9,0.08,0.08,steelDk(),0,h,0.9));
  tolvaGroup.add(bx(1.9,0.08,0.08,steelDk(),0,h,-0.9));
  tolvaGroup.add(bx(0.08,0.08,1.9,steelDk(),0.9,h,0));
  tolvaGroup.add(bx(0.08,0.08,1.9,steelDk(),-0.9,h,0));
});
tolvaGroup.add(bx(2.6,0.07,0.07,steel(),0,2.2,0.9,0,0,0.55));
tolvaGroup.add(bx(2.6,0.07,0.07,steel(),0,2.2,-0.9,0,0,-0.55));

// Cuerpo cónico octagonal — semitransparente para ver el nivel
const tolvaBodyMat = new THREE.MeshStandardMaterial({
  color:0x7a9ab8, roughness:0.25, metalness:0.6,
  transparent:true, opacity:0.20, depthWrite:false, side:THREE.DoubleSide
});
const tolvaCone = new THREE.Mesh(new THREE.CylinderGeometry(2.0,0.45,4.2,48,1,true), tolvaBodyMat);
tolvaCone.position.set(0,6.5,0); tolvaCone.castShadow=false;
tolvaGroup.add(tolvaCone);

// ── NIVEL DE POLVO (cilindro interior que sube/baja) ──
const nivelGeo = new THREE.CylinderGeometry(1, 1, 1, 32);  // alto dinámico
const nivelMesh = new THREE.Mesh(nivelGeo, powderMat);
nivelMesh.position.set(0, 4.6, 0);   // posición Y se actualiza en animate
tolvaGroup.add(nivelMesh);
const nivelTemplate = nivelGeo.attributes.position.array.slice();
let lastVisualLevel = -1;
export const tolvaLevelMat = powderMat;

// Flanges superior e inferior
const hopperRim = new THREE.Mesh(new THREE.TorusGeometry(2.02,0.09,10,48),steelLt());
hopperRim.rotation.x=Math.PI/2; hopperRim.position.y=8.65; tolvaGroup.add(hopperRim);
tolvaGroup.add(cy(0.56,0.56,0.14,12,steelLt(),0,4.45,0));

// Tapa y manijas
// Tapa retirada para visualizar el producto en la tolva.
tolvaGroup.add(bx(0.55,0.09,0.09,steel(), 0.9,8.88,0));
tolvaGroup.add(bx(0.55,0.09,0.09,steel(),-0.9,8.88,0));

// Visor lateral (vidrio)
tolvaGroup.add(bx(0.08,2.8,0.40,glassMat(),1.9,6.5,0));
// Visor sin placa opaca que lo tape.

// Motor vibratorio
tolvaGroup.add(bx(0.55,0.38,0.55,steelDk(),-1.8,5.3,0));
tolvaGroup.add(cy(0.12,0.12,0.6,8,steelDk(),-1.8,5.3,0,0,0,Math.PI/2));

// Tubo de descarga + bridas
tolvaGroup.add(cy(0.40,0.40,1.0,10,steelDk(),0,3.95,0));
tolvaGroup.add(cy(0.46,0.46,0.10,10,steelLt(),0,3.45,0));
tolvaGroup.add(cy(0.46,0.46,0.10,10,steelLt(),0,4.44,0));

// Compuerta
const compuertaMat = orange();
const compuerta = new THREE.Mesh(new THREE.BoxGeometry(0.65,0.12,0.78), compuertaMat);
compuerta.position.set(0,3.1,0);
tolvaGroup.add(compuerta);

// Actuador compuerta
const actBody = cy(0.07,0.07,0.72,8,steelDk());
actBody.rotation.z = Math.PI/2; actBody.position.set(0.58,3.18,0);
tolvaGroup.add(actBody);

// Semáforo LED
tolvaGroup.add(bx(0.06,0.7,0.06,steelDk(),1.5,8.2,0));
tolvaGroup.add(sp(0.10,greenLed(), 1.5,8.72,0));
tolvaGroup.add(sp(0.10,yellowLed(),1.5,8.52,0));
tolvaGroup.add(sp(0.10,redLed(),   1.5,8.32,0));

scene.add(tolvaGroup);

// ── PARTÍCULAS DE POLVO CAYENDO (simple pool de esferas) ──
const POWDER_COUNT = 18;
const powderParticles = [];
for (let i = 0; i < POWDER_COUNT; i++) {
  const p = sp(0.055, powderMat);
  p.visible = false;
  p.userData = { active:false, vy:0, t:0 };
  scene.add(p);
  powderParticles.push(p);
}
let powderTimer = 0;

function spawnPowder() {
  const p = powderParticles.find(x => !x.userData.active);
  if (!p) return;
  // Sale del tubo en posición world
  p.position.set(-9 + (Math.random()-0.5)*0.35, 3.38, (Math.random()-0.5)*0.35);
  p.userData.active = true;
  p.userData.vy = -(0.8 + Math.random()*0.6);
  p.userData.t  = 0;
  p.visible = true;
}
function updatePowder(dt) {
  powderTimer += dt;
  if (powderTimer > 0.06 && plantState.running && !plantState.emergency) {
    powderTimer = 0;
    spawnPowder();
  }
  powderParticles.forEach(p => {
    if (!p.userData.active) return;
    p.userData.t += dt*plantState.speed;
    const progress=p.userData.t/1.5;
    if(progress<0.3) p.position.y=3.38-(progress/0.3)*1.26;
    else {p.position.y=2.12;p.position.x=-9+(progress-0.3)/0.7*4;}
    if (progress>=1) {
      p.visible = false;
      p.userData.active = false;
    }
  });
}

// Tubo + codo tolva → flowpack
const pg = new THREE.Group();
pg.add(cy(0.25,0.25,1.0,10,steelDk(),-9,2.6,0));
pg.add(cy(0.32,0.32,0.09,10,steelLt(),-9,3.1,0));
pg.add(cy(0.32,0.32,0.09,10,steelLt(),-9,2.1,0));
pg.add(cy(0.25,0.25,4.0,24,steel(),-7.0,2.12,0,0,0,Math.PI/2));
pg.add(sp(0.28,steelDk(),-9.0,2.12,0));
scene.add(pg);

// ══════════════════════════════════════════════════════
//  ENVASADORA FLOWPACK  (x = −3.5) — rediseñada para que se entienda
// ══════════════════════════════════════════════════════
const fpGroup = new THREE.Group();
fpGroup.position.set(-3.5, 0, 0);

// --- Estructura base ---
fpGroup.add(bx(3.6,0.14,2.9,steelDk(),0,0.07,0));
[[ 1.5,0.9],[ 1.5,-0.9],[-1.5,0.9],[-1.5,-0.9]].forEach(([lx,lz])=>{
  fpGroup.add(bx(0.18,0.78,0.18,steelDk(),lx,0.39,lz));
  fpGroup.add(cy(0.12,0.15,0.10,8,rubber(),lx,0.02,lz));
});

// --- Chasis exterior (placa lateral visible) ---
fpGroup.add(bx(0.08,3.2,2.9,panelWh(),-1.58,1.67,0));  // panel izq blanco
fpGroup.add(bx(0.08,3.2,2.9,steelDk(), 1.58,1.67,0));  // panel der
fpGroup.add(bx(3.4,0.08,2.9,steelDk(),0,3.24,0));       // techo

// --- BOBINA DE FILM en la parte superior (muy visible) ---
fpGroup.add(bx(3.4,0.22,2.9,panelBl(),0,3.12,0));
[-1.3,1.3].forEach(z=>fpGroup.add(bx(0.14,1.1,0.14,steelDk(),0,3.6,z)));       // caja superior azul
const bobina = cy(0.80,0.80,2.5,24,steelLt(),0,4.12,0,Math.PI/2,0,0);
fpGroup.add(bobina);
fpGroup.add(cy(0.82,0.82,0.12,16,steelDk(),0,4.12,1.27,Math.PI/2,0,0));
fpGroup.add(cy(0.82,0.82,0.12,16,steelDk(),0,4.12,-1.27,Math.PI/2,0,0));
// Eje de bobina
fpGroup.add(cy(0.08,0.08,2.8,8,steelDk(),0,4.12,0,Math.PI/2,0,0));
// Film enrollado (lámina translúcida)
const filmRollMat = new THREE.MeshStandardMaterial({color:0xddeeff,roughness:0.1,transparent:true,opacity:0.55});
fpGroup.add(cy(0.65,0.65,2.45,20,filmRollMat,0,4.12,0,Math.PI/2,0,0));

// --- ZONA DE FORMADO (centro de la máquina) ---
// Mandril formador triangular (tubo que le da forma a la bolsita)
fpGroup.add(cy(0.30,0.22,1.8,3,steelDk(),0,2.0,0));   // mandril
fpGroup.add(cy(0.32,0.32,0.08,12,steelLt(),0,2.9,0)); // flange superior mandril

// Panel de vidrio frontal (se puede "ver" la formación)
fpGroup.add(bx(2.9,1.9,0.06,glassMat(),0,2.0,1.46));

const filmRollers = [bobina];
// Guías de film (rodillos)
[[-1.0,2.65],[0.0,2.65],[1.0,2.65],[0.0,1.8]].forEach(([rx,ry])=>{
  const roller = cy(0.09,0.09,2.5,24,steelLt(),rx,ry,0,Math.PI/2,0,0);
  fpGroup.add(roller); filmRollers.push(roller);
});

// --- MORDAZAS DE SELLADO (horizontal + vertical) ---
// Mordaza horizontal (sella arriba/abajo de la bolsita)
const mHz = bx(0.55,0.12,2.4,steelDk(),-0.28,1.08,0);
const mHzB= bx(0.55,0.12,2.4,steelDk(), 0.28,1.08,0);
fpGroup.add(mHz, mHzB);
// Resistencias montadas en las mordazas móviles (ver visuales de proceso).

// --- FLECHA ANIMADA de dirección del film (sprite) ---
function makeArrow(x,y,z,color='#f0883e') {
  const c = document.createElement('canvas');
  c.width=64; c.height=64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = 'bold 40px Arial';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('↓', 32, 32);
  const sp2 = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true}));
  sp2.scale.set(0.5,0.5,1); sp2.position.set(x,y,z);
  fpGroup.add(sp2);
}
makeArrow(0,2.55,1.5); makeArrow(0,1.45,1.5); makeArrow(0,0.6,1.5);

// --- SALIDA / CHUTE ---
const chuteG = new THREE.Group();
chuteG.position.set(1.85,0.88,0); chuteG.rotation.z=-0.22;
chuteG.add(bx(0.9,0.10,1.8,steelDk()));
chuteG.add(bx(0.9,0.35,0.06,steel(),0,0.18, 0.90));
chuteG.add(bx(0.9,0.35,0.06,steel(),0,0.18,-0.90));
fpGroup.add(chuteG);

// Panel de control
const cpG = new THREE.Group();
cpG.position.set(-1.68,2.2,0);
cpG.add(bx(0.08,0.95,0.72,panelBl()));
[[-0.18,0.15],[-0.18,-0.12],[0.12,0.15],[0.12,-0.12]].forEach(([py,pz])=>{
  cpG.add(sp(0.06,greenLed(),0.05,py,pz));
});
cpG.add(bx(0.05,0.22,0.40,orange(),0.05,0.30,0));
fpGroup.add(cpG);

// LED semáforo
fpGroup.add(bx(0.07,0.55,0.07,steelDk(),1.58,3.15,1.25));
fpGroup.add(sp(0.10,greenLed(), 1.58,3.52,1.25));
fpGroup.add(sp(0.10,yellowLed(),1.58,3.30,1.25));
fpGroup.add(sp(0.10,redLed(),   1.58,3.08,1.25));

scene.add(fpGroup);

// ── Bolsitas (pool) ──
const BAGS_POOL = 8;
const bagsOnBelt = [];
for (let i=0;i<BAGS_POOL;i++) {
  const g = new THREE.Group();
  // cuerpo
  g.add(bx(0.55,0.20,0.42,new THREE.MeshStandardMaterial({color:0xecd9b5,roughness:0.8})));
  // franja azul de impresión
  g.add(bx(0.55,0.05,0.44,new THREE.MeshStandardMaterial({color:0x3b82f6,roughness:0.7}),0,0.07,0));
  // costura superior
  g.add(bx(0.55,0.03,0.42,new THREE.MeshStandardMaterial({color:0xbbbbbb,roughness:0.5}),0,0.115,0));
  g.visible=false;
  g.userData={active:false,progress:0,readyForPick:false};
  scene.add(g);
  bagsOnBelt.push(g);
}

// ══════════════════════════════════════════════════════
//  CINTA TRANSPORTADORA  (x = 2)
// ══════════════════════════════════════════════════════
const cintaGroup = new THREE.Group();
cintaGroup.position.set(2,0,0);

[[1.0],[-1.0]].forEach(([lz])=>{
  cintaGroup.add(bx(9.0,0.28,0.12,steelDk(),0,0.86,lz));
  cintaGroup.add(bx(9.0,0.10,0.28,steelDk(),0,0.72,lz));
});
cintaGroup.add(new THREE.Mesh(new THREE.BoxGeometry(9,0.07,1.75),
  new THREE.MeshStandardMaterial({color:0x1c2a3a,roughness:0.95})) );
cintaGroup.children[cintaGroup.children.length-1].position.set(0,0.74,0);
cintaGroup.children[cintaGroup.children.length-1].receiveShadow=true;

for (let rx=-4;rx<=4;rx+=1.5) {
  cintaGroup.add(cy(0.13,0.13,1.78,10,steelLt(),rx,0.77,0,Math.PI/2,0,0));
  cintaGroup.add(cy(0.16,0.16,0.06,10,steelDk(),rx,0.77, 0.9,Math.PI/2,0,0));
  cintaGroup.add(cy(0.16,0.16,0.06,10,steelDk(),rx,0.77,-0.9,Math.PI/2,0,0));
}
[-3.5,0,3.5].forEach(lx=>{
  [0.76,-0.76].forEach(lz=>{
    cintaGroup.add(bx(0.14,0.72,0.14,steelDk(),lx,0.36,lz));
    cintaGroup.add(cy(0.10,0.12,0.08,8,rubber(),lx,0.01,lz));
  });
  cintaGroup.add(bx(0.08,0.08,1.66,steel(),lx,0.48,0));
});

// Motor housing
const mhG = new THREE.Group(); mhG.position.set(4.5,0.75,0);
mhG.add(bx(0.9,0.65,0.65,panelBl()));
mhG.add(cy(0.22,0.22,0.80,10,steelDk(),0,0,0,Math.PI/2,0,0));
for(let i=0;i<5;i++) mhG.add(bx(0.04,0.50,0.65,steel(),-0.35+i*0.18,0.08,0));
mhG.add(bx(0.15,0.28,0.28,steelDk(),-0.53,0.18,0));
cintaGroup.add(mhG);

// Guardas naranjas
cintaGroup.add(bx(8.6,0.06,0.06,orange(),0,1.20, 1.32));
cintaGroup.add(bx(8.6,0.06,0.06,orange(),0,1.20,-1.32));
[-4.3,4.3].forEach(ex=>{
  cintaGroup.add(bx(0.06,0.46,0.06,orange(),ex,0.97, 1.32));
  cintaGroup.add(bx(0.06,0.46,0.06,orange(),ex,0.97,-1.32));
});

scene.add(cintaGroup);

// ══════════════════════════════════════════════════════
//  ROBOT FANUC  (x = 8.5) — naranja, cilíndrico, realista
// ══════════════════════════════════════════════════════
const robotGroup = new THREE.Group();
robotGroup.position.set(8.5, 0, 0);

// --- J0: Placa base (gris oscuro, octagonal) ---
robotGroup.add(cy(1.15,1.30,0.20,8,steelDk(),0,0.10,0));
for(let a=0;a<8;a++){
  const ang=(a/8)*Math.PI*2;
  robotGroup.add(cy(0.055,0.055,0.26,6,steelLt(),
    Math.cos(ang)*1.05, 0.13, Math.sin(ang)*1.05));
}
// --- J1: Torso base giratorio (gris, cilíndrico ancho) ---
robotGroup.add(cy(0.75,0.80,0.40,16,steelDk(),0,0.40,0));
robotGroup.add(cy(0.72,0.72,1.10,16,
  new THREE.MeshStandardMaterial({color:0x2a3a4e,roughness:0.3,metalness:0.85}),0,1.15,0));
// Tapa torso
robotGroup.add(cy(0.78,0.78,0.08,16,steelLt(),0,1.72,0));
// Caja del motor J1
robotGroup.add(bx(0.55,0.38,0.55,steelDk(),0.75,0.65,0));
robotGroup.add(bx(0.28,0.22,0.30,panelBl(),0.75,0.92,0));

// Pivot hombro
const shoulderPivot = new THREE.Group();
shoulderPivot.position.set(0,1.78,0);
robotGroup.add(shoulderPivot);

// --- J2: Hombro (esfera grande + brazo superior naranja FANUC) ---
shoulderPivot.add(sp(0.38,
  new THREE.MeshStandardMaterial({color:0xff6600,roughness:0.28,metalness:0.12}),0,0,0));
// Placa lateral gris
shoulderPivot.add(cy(0.42,0.42,0.12,12,steelDk(),0,0,-0.55,0,0,Math.PI/2));
shoulderPivot.add(cy(0.42,0.42,0.12,12,steelDk(),0,0, 0.55,0,0,Math.PI/2));

// Brazo superior naranja (sección ovalada = 8 segmentos)
const upperArmMat = fanucOrg();
shoulderPivot.add(cy(0.26,0.22,2.1,8,upperArmMat,0,1.05,0));
// Detalle: franja negra safety
shoulderPivot.add(cy(0.27,0.27,0.08,8,
  new THREE.MeshStandardMaterial({color:0x111111,roughness:0.8}),0,0.55,0));
shoulderPivot.add(cy(0.27,0.27,0.08,8,
  new THREE.MeshStandardMaterial({color:0x111111,roughness:0.8}),0,1.55,0));

// Pivot codo
const elbowPivot = new THREE.Group();
elbowPivot.position.set(0,2.12,0);
shoulderPivot.add(elbowPivot);

// --- J3: Codo (esfera naranja) ---
elbowPivot.add(sp(0.30,fanucOrg(),0,0,0));
elbowPivot.add(cy(0.36,0.36,0.12,12,steelDk(),0,0,-0.5,0,0,Math.PI/2));
elbowPivot.add(cy(0.36,0.36,0.12,12,steelDk(),0,0, 0.5,0,0,Math.PI/2));

// Antebrazo naranja
elbowPivot.add(cy(0.20,0.16,1.65,8,fanucOrg(),0,0.83,0));
// Canaleta de cables (tubos laterales)
elbowPivot.add(cy(0.05,0.05,1.60,8,
  new THREE.MeshStandardMaterial({color:0x111111,roughness:0.95}),0.23,0.83,0.10));
elbowPivot.add(cy(0.05,0.05,1.60,8,
  new THREE.MeshStandardMaterial({color:0x111111,roughness:0.95}),-0.23,0.83,0.10));

// Pivot muñeca
const wristPivot = new THREE.Group();
wristPivot.position.set(0,1.68,0);
elbowPivot.add(wristPivot);

// --- J4/J5: Muñeca (cilindro pequeño naranja) ---
wristPivot.add(cy(0.18,0.18,0.30,10,fanucOrg(),0,-0.05,0));
wristPivot.add(sp(0.20,
  new THREE.MeshStandardMaterial({color:0x2a3a4e,roughness:0.3,metalness:0.9}),0,-0.22,0));

// --- J6: Garra (dos dedos paralelos, negro/naranja) ---
const gripBase = bx(0.28,0.16,0.28,steelDk(),0,-0.38,0);
wristPivot.add(gripBase);

const garraL = new THREE.Group(); garraL.position.set(-0.16,-0.47,0);
garraL.add(bx(0.09,0.36,0.22,fanucOrg()));
garraL.add(bx(0.14,0.06,0.24,fanucOrg(),0.02,-0.21,0));
wristPivot.add(garraL);

const garraR = new THREE.Group(); garraR.position.set( 0.16,-0.47,0);
garraR.add(bx(0.09,0.36,0.22,fanucOrg()));
garraR.add(bx(0.14,0.06,0.24,fanucOrg(),-0.02,-0.21,0));
wristPivot.add(garraR);

// Sensor láser en garra
wristPivot.add(sp(0.07,redLed(),0,-0.72,0));

// --- Etiqueta FANUC (sprite) ---
{
  const c2 = document.createElement('canvas'); c2.width=220; c2.height=56;
  const ctx2 = c2.getContext('2d');
  ctx2.fillStyle='#ff6600'; ctx2.fillRect(4,4,212,48);
  ctx2.fillStyle='#ffffff'; ctx2.font='bold 26px Arial';
  ctx2.textAlign='center'; ctx2.textBaseline='middle';
  ctx2.fillText('FANUC', 110, 28);
  const sp3 = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c2),transparent:true}));
  sp3.scale.set(1.4,0.36,1); sp3.position.set(0,0.6,0.78);
  robotGroup.add(sp3);
}

// Torre de señalización
const sigT = new THREE.Group(); sigT.position.set(-1.2,0,0);
sigT.add(cy(0.05,0.05,2.8,8,steelDk(),0,1.4,0));
sigT.add(cy(0.17,0.17,0.32,8,greenLed(), 0,2.72,0));
sigT.add(cy(0.17,0.17,0.32,8,yellowLed(),0,2.36,0));
sigT.add(cy(0.17,0.17,0.32,8,redLed(),   0,2.00,0));
robotGroup.add(sigT);

scene.add(robotGroup);

// ══════════════════════════════════════════════════════
//  CAJAS DE EMBALAJE  (x = 11.5) — animación clara de llenado
// ══════════════════════════════════════════════════════
const BOLSITAS_POR_CAJA = 6;
const boxAreaGroup = new THREE.Group();
boxAreaGroup.position.set(11.5,0,0);

// Palet
const palG = new THREE.Group();
for(let i=-0.7;i<=0.7;i+=0.35) palG.add(bx(2.0,0.06,0.28,wood(),0,0.12,i));
[[-0.7,0],[0,0],[0.7,0]].forEach(([px,pz])=> palG.add(bx(0.28,0.10,1.90,wood(),px,0.05,pz)));
boxAreaGroup.add(palG);

// Caja activa — paredes visibles (cubo hueco = 4 paredes + fondo)
const CAJA_W=1.72, CAJA_H=1.30, CAJA_D=1.72;
const cjMat = cardboard();
const activeBoxGroup = new THREE.Group();
activeBoxGroup.position.set(0,0.2,0);
activeBoxGroup.add(bx(CAJA_W,0.07,CAJA_D,   cjMat,  0,0,0));                          // piso
activeBoxGroup.add(bx(0.07,CAJA_H,CAJA_D,   cjMat,  CAJA_W/2,CAJA_H/2,0));            // pared der
activeBoxGroup.add(bx(0.07,CAJA_H,CAJA_D,   cjMat, -CAJA_W/2,CAJA_H/2,0));            // pared izq
activeBoxGroup.add(bx(CAJA_W,CAJA_H,0.07,   cjMat,  0,CAJA_H/2, CAJA_D/2));           // frente
activeBoxGroup.add(bx(CAJA_W,CAJA_H,0.07,   cjMat,  0,CAJA_H/2,-CAJA_D/2));           // fondo
boxAreaGroup.add(activeBoxGroup);

// Tapa (baja al completarse)
const lidMesh = bx(CAJA_W+0.08,0.07,CAJA_D+0.08,
  new THREE.MeshStandardMaterial({color:0xa0784a,roughness:0.9}),0,1.38,0);
boxAreaGroup.add(lidMesh);
lidMesh.rotation.x=-Math.PI/2; lidMesh.position.set(0,2.1,-0.9);


// ── Bolsitas DENTRO de la caja (se muestran de a una) ──
const BAGS_IN_BOX = [];
const bagPositions = [
  [-0.35,0.32,-0.35],[ 0.28,0.32,-0.35],[-0.35,0.32, 0.28],
  [ 0.28,0.32, 0.28], [-0.35,0.58, 0.0],[ 0.28,0.58, 0.0],
];
bagPositions.forEach(([bx2,by,bz]) => {
  const bg = new THREE.Group();
  bg.position.set(bx2, by, bz);
  bg.add(bx(0.55,0.20,0.42, new THREE.MeshStandardMaterial({color:0xecd9b5,roughness:0.8})));
  bg.add(bx(0.55,0.05,0.44, new THREE.MeshStandardMaterial({color:0x3b82f6,roughness:0.7}),0,0.07,0));
  bg.visible = false;
  activeBoxGroup.add(bg);
  BAGS_IN_BOX.push(bg);
});

scene.add(boxAreaGroup);

// ══════════════════════════════════════════════════════
//  ETIQUETAS FLOTANTES
// ══════════════════════════════════════════════════════
function makeLabel(text,x,y,z,color='#f0883e',sub='') {
  const c=document.createElement('canvas'); c.width=340; c.height=sub?88:72;
  const ctx=c.getContext('2d');
  ctx.fillStyle='rgba(255,255,255,0.95)';
  if(ctx.roundRect) ctx.roundRect(3,3,334,c.height-6,10); else ctx.rect(3,3,334,c.height-6);
  ctx.fill();
  ctx.strokeStyle=color; ctx.lineWidth=2;
  if(ctx.roundRect) ctx.roundRect(3,3,334,c.height-6,10); else ctx.rect(3,3,334,c.height-6);
  ctx.stroke();
  ctx.fillStyle='#193c4d'; ctx.font='bold 29px Arial';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(text,170, sub?32:c.height/2);
  if(sub){
    ctx.fillStyle='#4f6877'; ctx.font='18px Arial';
    ctx.fillText(sub,170,62);
  }
  const sp2=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true}));
  sp2.scale.set(3.1,sub?0.80:0.66,1); sp2.position.set(x,y,z);
  scene.add(sp2);
}
makeLabel('TOLVA',    -9.0,10.4,0,'#60a5fa','Alimentación de polvo');
makeLabel('FLOWPACK', -3.5, 5.6,0,'#f0883e','Envasadora continua');
makeLabel('CINTA',     2.0, 2.7,0,'#34d399','Transporte');
makeLabel('ROBOT',     8.5, 5.7,0,'#ff6600','FANUC M-10iA');
makeLabel('CAJAS',    11.5, 2.8,0,'#f5c518','Paletizado');

// ══════════════════════════════════════════════════════
//  ANIMACIÓN DEL ROBOT
// ══════════════════════════════════════════════════════
const robotAnim = {
  phase:0, t:0,
  duration:       [0, 0.7, 0.28, 0.65, 1.0, 0.65, 0.28, 0.65, 1.0],
  shoulderTargets:[0, -0.48,-0.48, 0.38, 0.38,-0.28,-0.28, 0],
  elbowTargets:   [0.2,0.68, 0.68,-0.28,-0.28, 0.58, 0.58, 0.2],
  hasBag:false, carriedBag:null,
};

// Posiciones cinta
const BELT_START_X = -1.5;
const BELT_END_X   =  6.0;
const BELT_Y       =  1.05;

// ══════════════════════════════════════════════════════
//  UI
// ══════════════════════════════════════════════════════
function updatePanel() {
  const s=plantState;
  setLed('tolva',    s.alarm?'red':(s.running?'green':'yellow'));
  setLed('flowpack', s.running?'green':'yellow');
  setLed('cinta',    s.running?'green':'yellow');
  setLed('robot',    s.emergency?'red':(s.running?'green':'yellow'));
  setStatus('tolva',    s.alarm?'Alarma nivel':(s.running?'OK':'En espera'));
  setStatus('flowpack', s.running?'Sellando':'En espera');
  setStatus('cinta',    s.running?'Corriendo':'En espera');
  setStatus('robot',    s.emergency?'⚠ Detenido':(s.running?'Activo':'En espera'));
  document.getElementById('cnt-bolsitas').textContent = s.bolsitas;
  document.getElementById('cnt-cajas').textContent    = s.cajas;
  document.getElementById('cnt-throughput').textContent = throughputHistory[throughputHistory.length-1]||0;
  const pct=Math.round(s.nivel*100);
  const fill=document.getElementById('level-bar-fill');
  fill.style.width=pct+'%';
  fill.style.background=pct>40?'var(--green)':pct>20?'var(--yellow)':'var(--red)';
  document.getElementById('level-pct').textContent=pct+'%';
  s.alarm ? document.getElementById('alarm-banner').classList.remove('hidden')
           : document.getElementById('alarm-banner').classList.add('hidden');
}
function setLed(id,cls){ document.getElementById('led-'+id).className='stage-led '+cls; }
function setStatus(id,txt){ document.getElementById('status-'+id).textContent=txt; }

export function logEvent(msg,type='info'){
  const log=document.getElementById('event-log');
  const ts=new Date().toTimeString().slice(0,8);
  const div=document.createElement('div');
  div.className='log-entry';
  div.innerHTML=`<span class="log-time">${ts}</span> <span class="log-${type}">${msg}</span>`;
  log.prepend(div);
  while(log.children.length>50) log.removeChild(log.lastChild);
}

function drawSparkline(){
  const c=document.getElementById('sparkline'), ctx=c.getContext('2d');
  const w=c.width,h=c.height;
  ctx.clearRect(0,0,w,h); ctx.fillStyle='#1c2230'; ctx.fillRect(0,0,w,h);
  const mx=Math.max(...throughputHistory,1);
  ctx.strokeStyle='#f0883e'; ctx.lineWidth=1.5; ctx.beginPath();
  throughputHistory.forEach((v,i)=>{
    const x=(i/(throughputHistory.length-1))*w;
    const y=h-(v/mx)*(h-4)-2;
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  });
  ctx.stroke();
}

// ══════════════════════════════════════════════════════
//  CONTROLES GLOBALES
// ══════════════════════════════════════════════════════
window.toggleLine=function(){
  if(plantState.emergency) return;
  plantState.running=!plantState.running;
  const btn=document.getElementById('btn-start');
  if(plantState.running){
    if(btn){ btn.textContent='⏸ DETENER LÍNEA'; btn.classList.add('running'); }
    logEvent('Línea iniciada','ok');
  } else {
    if(btn){ btn.textContent='▶ INICIAR LÍNEA'; btn.classList.remove('running'); }
    logEvent('Línea detenida','info');
  }
  updatePanel();
};
window.setMode=function(mode){
  plantState.mode=mode;
  document.getElementById('btn-manual').classList.toggle('active',mode==='manual');
  document.getElementById('btn-auto').classList.toggle('active',mode==='auto');
  logEvent('Modo: '+mode.toUpperCase(),'info');
};
window.triggerEmergency=function(){
  plantState.running=false; plantState.emergency=true; plantState.alarm=true;
  if(document.getElementById('btn-start')) document.getElementById('btn-start').textContent='▶ INICIAR LÍNEA';
  document.getElementById('btn-start')?.classList.remove('running');
  logEvent('⚠ PARADA DE EMERGENCIA','alarm');
  playAlarm(); updatePanel();
};
window.resetAlarm=function(){
  plantState.alarm=false; plantState.emergency=false;
  logEvent('Alarma reseteada','ok'); updatePanel();
};
window.plantState=plantState;
window.updatePanel=updatePanel;
window.logEvent=logEvent;

// ══════════════════════════════════════════════════════
//  AUDIO
// ══════════════════════════════════════════════════════
let audioCtx=null;
function getAC(){ if(!audioCtx) audioCtx=new AudioContext(); return audioCtx; }
function playAlarm(){
  const ctx=getAC(), osc=ctx.createOscillator(), gain=ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type='square';
  osc.frequency.setValueAtTime(880,ctx.currentTime);
  osc.frequency.setValueAtTime(440,ctx.currentTime+0.15);
  gain.gain.setValueAtTime(0.15,ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.4);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.4);
}
function playBeep(freq=1200,dur=0.05){
  const ctx=getAC(), osc=ctx.createOscillator(), gain=ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.frequency.value=freq;
  gain.gain.setValueAtTime(0.08,ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime+dur);
}

// Visuales de proceso: todas las fases usan tiempo de simulación y se congelan al detener.
function processTexture(draw, width=256, height=128) {
  const c = document.createElement('canvas'); c.width=width; c.height=height;
  draw(c.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}
const beltTexture = processTexture((ctx,w,h) => {
  ctx.fillStyle='#263442'; ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#506171'; ctx.fillRect(0,0,6,h);
  ctx.fillStyle='#344451';
  for(let y=0;y<h;y+=8) ctx.fillRect(8,y,w-8,1);
});
beltTexture.repeat.set(16,1);
const beltSurface = bx(9,0.02,1.75,new THREE.MeshStandardMaterial({map:beltTexture,roughness:0.86}),0,0.915,0);
cintaGroup.add(beltSurface);
const filmTexture = processTexture((ctx,w,h) => {
  ctx.fillStyle='#e9e3ce'; ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#2459a0'; ctx.fillRect(0,42,w,44);
  ctx.fillStyle='#ffffff'; ctx.font='bold 20px Arial'; ctx.textAlign='center';
  ctx.fillText('UNaP · POLVOS',w/2,70);
  ctx.fillStyle='#b9b29e'; ctx.fillRect(0,0,w,4);
});
const webFilm = bx(0.62,1.4,0.012,new THREE.MeshStandardMaterial({
  map:filmTexture,roughness:0.32,metalness:0.15,side:THREE.DoubleSide
}),0,2.0,0.38);
fpGroup.add(webFilm);
// Mark the reel end so its rotation can be read, even with uniform metal.
bobina.add(bx(1.4,0.02,0.035,orange(),0,1.26,0));
const sealStrips = [bx(0.055,0.08,2.2,orange()), bx(0.055,0.08,2.2,orange())];
mHz.add(sealStrips[0]); mHzB.add(sealStrips[1]);
sealStrips[0].position.x=0.25; sealStrips[1].position.x=-0.25;
// Shared rounded packet shell and end crimps.
const packetGeo = new THREE.SphereGeometry(1,20,12);
const packetMat = new THREE.MeshStandardMaterial({color:0xf0e4c9,roughness:0.4,metalness:0.08});
[...bagsOnBelt,...BAGS_IN_BOX].forEach(bag => {
  bag.children[0].visible=false;
  const shell = new THREE.Mesh(packetGeo,packetMat);
  shell.scale.set(0.29,0.12,0.22); shell.castShadow=true; shell.receiveShadow=true;
  bag.add(shell);
  [-1,1].forEach(side => {
    bag.add(bx(0.055,0.025,0.40,steelLt(),side*0.285,0,0));
    for(let z=-0.18;z<=0.18;z+=0.045)
      bag.add(bx(0.055,0.006,0.012,steelDk(),side*0.285,0.016,z));
  });
});
// Panel hardware: feet, fasteners and door handles.
[-1.48,1.48].forEach(x => {
  [1.2,2.8].forEach(y => fpGroup.add(cy(0.035,0.035,0.025,6,steelLt(),x,y,1.51,Math.PI/2)));
  fpGroup.add(bx(0.045,0.32,0.07,steelLt(),x,2,1.56));
});
const signalLamps=[];
[tolvaGroup,fpGroup,robotGroup].forEach(group => group.traverse(obj => {
  if(obj.isMesh && [0x22c55e,0xef4444,0xfbbf24].includes(obj.material?.emissive?.getHex()))
    signalLamps.push(obj);
}));
function updateSignals() {
  const s=plantState;
  const color=(s.emergency || s.alarm)?0xef4444:s.running?0x22c55e:0xfbbf24;
  signalLamps.forEach(mesh => {
    mesh.material.emissiveIntensity=mesh.material.emissive.getHex()===color?1.5:0;
    mesh.material.color.copy(mesh.material.emissive).multiplyScalar(mesh.material.emissive.getHex()===color?1:0.18);
  });
}
function updateMachineVisuals(dt) {
  const phase=plantState._flowpackTimer/CYCLE_FLOWPACK;
  beltTexture.offset.x=(beltTexture.offset.x-dt*0.6)%1;
  filmTexture.offset.y=(filmTexture.offset.y+dt*0.34)%1;
  filmRollers.forEach(roller => roller.rotateY(dt*1.6));
  const seal=Math.max(0,1-Math.abs(phase-0.82)/0.14);
  mHz.position.x=-0.28-(1-seal)*0.20;
  mHzB.position.x=0.28+(1-seal)*0.20;
}

// ── Detalles mecánicos del robot ──
function addJointCover(parent,y,radius){
  [-1,1].forEach(side=>{
    const cover=cy(radius,radius,0.07,32,steelLt(),side*0.32,y,0,0,0,Math.PI/2);
    parent.add(cover);
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3;
      parent.add(cy(0.022,0.022,0.035,6,steelDk(),side*0.37,y+Math.cos(a)*radius*0.72,Math.sin(a)*radius*0.72,0,0,Math.PI/2));
    }
  });
}
addJointCover(shoulderPivot,0,0.32);
addJointCover(elbowPivot,0,0.25);
// Cableado sujeto al brazo: acompaña cada articulación, sin geometría nueva por cuadro.
[shoulderPivot,elbowPivot].forEach((joint,index)=>{
  const length=index?1.45:1.85;
  const curve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.28,0.05,0.12),new THREE.Vector3(0.40,0.3,0.16),
    new THREE.Vector3(0.36,length-0.15,0.16),new THREE.Vector3(0.23,length,0.1)
  ]);
  joint.add(new THREE.Mesh(new THREE.TubeGeometry(curve,20,0.045,8,false),rubber()));
  [0.45,length-0.3].forEach(y=>joint.add(bx(0.12,0.055,0.13,steelLt(),0.36,y,0.16)));
});
[-1,1].forEach(side=>{
  robotGroup.add(bx(0.11,0.035,0.11,steelLt(),side*0.68,0.22,0.65));
  robotGroup.add(bx(0.11,0.035,0.11,steelLt(),side*0.68,0.22,-0.65));
});
const wristCuff=cy(0.22,0.22,0.09,24,steelLt(),0,-0.27,0);
wristPivot.add(wristCuff);
[garraL,garraR].forEach(finger=>finger.add(bx(0.025,0.16,0.20,rubber(),0,-0.13,0)));

// ── Flowpaquera: HMI frontal, cilindros, guardas y camino del film ──
const hmiTexture=processTexture((ctx,w,h)=>{
  ctx.fillStyle='#143140';ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#5ce0bd';ctx.font='bold 22px Arial';ctx.fillText('FLOWPACK 01',16,30);
  ctx.fillStyle='#dbe9ef';ctx.font='16px Arial';ctx.fillText('SELLADO  165 °C',16,65);
  ctx.fillText('CICLO AUTOMÁTICO',16,94);
  ctx.fillStyle='#51c8a6';ctx.fillRect(16,108,200,5);
});
fpGroup.add(bx(0.9,0.66,0.15,steelDk(),-1.04,2.54,1.55));
fpGroup.add(bx(0.80,0.51,0.018,new THREE.MeshBasicMaterial({map:hmiTexture}),-1.04,2.56,1.64));
fpGroup.add(sp(0.055,greenLed(),-1.25,2.14,1.62));
fpGroup.add(sp(0.075,redLed(),-0.93,2.14,1.62));
// Infeed film behind forming tube, joining the visible reel to the guides.
const filmFeed=new THREE.Mesh(new THREE.PlaneGeometry(0.62,1.12),webFilm.material);
filmFeed.position.set(0,3.32,0.65);filmFeed.rotation.x=-0.20;fpGroup.add(filmFeed);
[-1,1].forEach(side=>{
  fpGroup.add(cy(0.09,0.09,0.55,20,steelDk(),side*0.92,1.08,0.8,0,0,Math.PI/2));
  const rod=cy(0.035,0.035,0.45,16,steelLt(),side*0.4,0,0.8,0,0,Math.PI/2);
  (side<0?mHz:mHzB).add(rod);
  fpGroup.add(bx(0.07,1.9,0.08,steelLt(),side*1.42,2.0,1.51));
});
// Ventilación del gabinete y bisagras de la guarda.
for(let i=0;i<7;i++)fpGroup.add(bx(0.035,0.52,0.035,steelDk(),-1.1+i*0.12,0.5,1.48));
[1.35,2.65].forEach(y=>fpGroup.add(cy(0.045,0.045,0.18,12,steelDk(),1.43,y,1.54)));

// ── AMR: llega, recibe una caja, sale del límite y libera el puesto ──
function smoothMotion(t){t=THREE.MathUtils.clamp(t,0,1);return t*t*t*(10+t*(-15+6*t));}
const logistics={phase:'idle',t:0,boxReady:false,closeT:0,delivered:0};
const amr=new THREE.Group();amr.visible=false;scene.add(amr);
amr.add(bx(2.25,0.48,1.85,panelBl(),0,0.48,0));
amr.add(bx(2.35,0.13,1.94,rubber(),0,0.27,0));
amr.add(bx(2.1,0.10,1.75,steelLt(),0,0.78,0));
const amrWheels=[];
[-0.74,0.74].forEach(x=>[-0.85,0.85].forEach(z=>{
  const wheel=cy(0.24,0.24,0.16,24,rubber(),x,0.24,z,Math.PI/2);
  wheel.add(cy(0.12,0.12,0.17,16,steelLt()));amr.add(wheel);amrWheels.push(wheel);
}));
amr.add(cy(0.15,0.15,0.13,24,steelDk(),0.87,0.87,0));
amr.add(cy(0.16,0.16,0.04,24,greenLed(),0.87,0.94,0));
[-0.62,0.62].forEach(z=>amr.add(bx(0.025,0.07,0.22,new THREE.MeshStandardMaterial({color:0x88e6ff,emissive:0x33bbee,emissiveIntensity:1}),-1.14,0.50,z)));
// Top rollers carry the sealed carton.
for(let x=-0.85;x<=0.85;x+=0.28)amr.add(cy(0.055,0.055,1.70,16,steelLt(),x,0.87,0,Math.PI/2));
const transferDeck=new THREE.Group();transferDeck.visible=false;amr.add(transferDeck);
transferDeck.add(bx(1.85,0.06,2.6,steelDk(),0,0.7,-1.65));
for(let z=-2.8;z<-0.5;z+=0.25)transferDeck.add(cy(0.055,0.055,1.75,16,steelLt(),0,0.76,z,0,0,Math.PI/2));
const cargo=new THREE.Group();cargo.visible=false;scene.add(cargo);
cargo.add(bx(CAJA_W,CAJA_H,CAJA_D,cardboard(),0,CAJA_H/2,0));
cargo.add(bx(0.18,0.025,CAJA_D+0.015,new THREE.MeshStandardMaterial({color:0xe4c590}),0,CAJA_H+0.014,0));
const cargoLabel=processTexture((ctx,w,h)=>{
  ctx.fillStyle='#f6f3e8';ctx.fillRect(0,0,w,h);ctx.fillStyle='#243d49';ctx.font='bold 25px Arial';ctx.fillText('UNaP / 06 UN.',14,38);
  for(let i=0;i<50;i++)if(i%3!==0)ctx.fillRect(16+i*4,56,i%2+1,54);
});
cargo.add(bx(0.7,0.34,0.015,new THREE.MeshBasicMaterial({map:cargoLabel}),0,0.70,CAJA_D/2+0.01));
// Dock markings leave a dedicated aisle in front of the line.
for(let x=10.2;x<13;x+=0.35)scene.add(bx(0.18,0.012,0.12,yellow(),x,0.015,4.55));
function setAmrPhase(phase){logistics.phase=phase;logistics.t=0;}
function updateLogistics(dt){
  const l=logistics;
  if(l.boxReady){
    l.closeT=Math.min(1,l.closeT+dt);
    const open=1-smoothMotion(l.closeT);
    lidMesh.rotation.x=-Math.PI/2*open;lidMesh.position.set(0,1.56+0.54*open,-0.9*open);
  }
  if(l.phase==='idle'){
    if(!l.boxReady)return;
    amr.visible=true;amr.position.set(30,0,3.45);amr.rotation.y=0;
    setAmrPhase('arriving');
  }
  l.t+=dt;
  const durations={arriving:5,loading:2,departing:5};
  const p=Math.min(l.t/durations[l.phase],1),ease=smoothMotion(p);
  const oldX=amr.position.x;
  if(l.phase==='arriving')amr.position.x=lerp(30,11.5,ease);
  if(l.phase==='loading'){
    transferDeck.visible=true;cargo.visible=true;activeBoxGroup.visible=false;lidMesh.visible=false;
    cargo.position.set(11.5,lerp(0.2,0.94,ease)+Math.sin(Math.PI*ease)*0.35,lerp(0,3.45,ease));
  }
  if(l.phase==='departing'){
    amr.position.x=lerp(11.5,30,ease);
    cargo.position.set(amr.position.x,0.94,amr.position.z);
  }
  amrWheels.forEach(w=>w.rotateY(-(amr.position.x-oldX)/0.24));
  if(p===1){
    if(l.phase==='arriving'){
      setAmrPhase('loading');logEvent('AMR en posición: cargando caja','info');
    }else if(l.phase==='loading'){
      transferDeck.visible=false;l.boxReady=false;BAGS_IN_BOX.forEach(b=>b.visible=false);
      activeBoxGroup.visible=true;lidMesh.visible=true;
      lidMesh.rotation.x=-Math.PI/2;lidMesh.position.set(0,2.1,-0.9);
      setAmrPhase('departing');logEvent('Caja retirada. Puesto disponible para una nueva caja','ok');
    }else{
      amr.visible=false;cargo.visible=false;l.delivered++;
      setAmrPhase('idle');logEvent(`AMR fuera de planta · ${l.delivered} cajas despachadas`,'ok');
    }
  }
}

// ── OEE didáctico: factores sintéticos, sin vínculo con telemetría real ──
let demoTime=0,lastOeeTick=-1;
const demoEquipment=[['tolva','Tolva',96,94,99],['flowpack','Flowpaquera',94,90,98],['cinta','Cinta',98,96,99.5],['robot','Robot',95,92,99],['cajas','Encajado',96,91,99],['amr','Carrito AMR',97,93,99.5]];
const oeeSection=document.createElement('section');oeeSection.className='panel-section oee-section';
oeeSection.innerHTML='<div class="section-label">OEE POR EQUIPO <span class="demo-badge">DEMO</span></div><p class="oee-note">Valores simulados para la exposición.<br>OEE = Disponibilidad × Rendimiento × Calidad.</p>'+demoEquipment.map(([id,name])=>`<div class="oee-row"><div class="oee-heading"><span>${name}</span><strong id="oee-${id}">—</strong></div><div class="oee-track"><div id="oee-bar-${id}"></div></div><small id="oee-factors-${id}"></small></div>`).join('')+'<p id="amr-status" class="oee-note"></p>';
document.querySelector('.log-section').before(oeeSection);
const oeeToggle=document.createElement('button');oeeToggle.className='oee-toggle';oeeToggle.textContent='OEE · Demo';oeeToggle.setAttribute('aria-expanded','false');
oeeToggle.onclick=()=>{const open=document.body.classList.toggle('oee-open');oeeToggle.setAttribute('aria-expanded',String(open));};
document.body.appendChild(oeeToggle);
function demoFactors(index,time){
  const e=demoEquipment[index];
  return e.slice(2).map((v,j)=>Math.min(100,Math.max(0,Math.round((v+Math.sin(time/18+index+j)*0.8)*10)/10)));
}
function updateDemoOEE(){
  const tick=Math.floor(demoTime*2);
  if(tick===lastOeeTick)return;lastOeeTick=tick;
  demoEquipment.forEach(([id],i)=>{
    const [a,p,q]=demoFactors(i,demoTime),oee=a*p*q/10000;
    document.getElementById('oee-'+id).textContent=oee.toFixed(1)+'%';
    const bar=document.getElementById('oee-bar-'+id);bar.style.width=oee+'%';bar.style.background=oee>=85?'#178b80':'#d39b30';
    document.getElementById('oee-factors-'+id).textContent=`D ${a.toFixed(1)}% · R ${p.toFixed(1)}% · C ${q.toFixed(1)}%`;
  });
  const names={idle:'Disponible',arriving:'En camino',loading:'Cargando caja',departing:'Retirando caja'};
  document.getElementById('amr-status').textContent=`AMR: ${names[logistics.phase]} · Despachadas: ${logistics.delivered}`;
}

// ══════════════════════════════════════════════════════
//  GAME LOOP
// ══════════════════════════════════════════════════════
let lastTime=0;
const CYCLE_FLOWPACK=3.0, CYCLE_CINTA=2.0;

function animate(ts){
  requestAnimationFrame(animate);
  const dt=Math.min((ts-lastTime)/1000,0.1); lastTime=ts;
  const s=plantState;

  if(s.running && !s.emergency){
    // Nivel tolva
    s.nivel=Math.max(0,s.nivel-dt*0.006*s.speed);
    if(s.nivel<0.15 && !s.alarm){
      s.alarm=true; logEvent('⚠ Alarma: nivel bajo en tolva','alarm'); playAlarm();
      if(s.mode==='auto') s.running=false;
    }

    // Flowpack
    s._flowpackTimer+=dt*s.speed;
    if(s._flowpackTimer>=CYCLE_FLOWPACK){ s._flowpackTimer=0; spawnBag(); }

    moveBags(dt);
    updatePowder(dt);
    animateRobot(dt);

    updateMachineVisuals(dt * s.speed);
    updateLogistics(dt*s.speed);
    demoTime+=dt*s.speed;

    // Compuerta
    const tRot=s.running?0.75:0;
    compuerta.rotation.z+=(tRot-compuerta.rotation.z)*dt*3;
  }

  // ── Actualizar nivel de polvo visual ──
  {
    const level = THREE.MathUtils.clamp(s.nivel, 0, 1);
    if (level !== lastVisualLevel) {
      const h = level * 4;
      const positions = nivelGeo.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const height = (nivelTemplate[i * 3 + 1] + 0.5) * h;
        const radius = 0.42 + height * (1.88 - 0.42) / 4;
        positions.setXYZ(i, nivelTemplate[i * 3] * radius,
          height, nivelTemplate[i * 3 + 2] * radius);
      }
      positions.needsUpdate = true;
      nivelGeo.computeVertexNormals();
      nivelGeo.computeBoundingSphere();
      nivelMesh.position.y = 4.5;
      nivelMesh.visible = level > 0;
      lastVisualLevel = level;
    }
  }

  updateDemoOEE();
  updateSignals();
  controls.update();
  updatePanel();
  renderer.render(scene,camera);
}

// ── Bolsitas ──
function spawnBag(){
  const bag=bagsOnBelt.find(b=>!b.userData.active && b !== robotAnim.carriedBag);
  if(!bag || bagsOnBelt.some(b => b.userData.active && b.userData.progress < 0.12)) return;
  bag.userData.active=true; bag.userData.progress=0; bag.userData.readyForPick=false;
  bag.visible=true;
  bag.position.set(BELT_START_X,BELT_Y,0);
  plantState.bolsitas++;
  playBeep(1400,0.04);
  logEvent(`Bolsita #${plantState.bolsitas} producida`,'ok');
}
function moveBags(dt){
  let limit = 1;
  const queued = bagsOnBelt.filter(b => b.userData.active)
    .sort((a,b) => b.userData.progress - a.userData.progress);
  queued.forEach(bag=>{
    bag.userData.progress = Math.min(limit, bag.userData.progress + dt*plantState.speed/CYCLE_CINTA);
    limit = Math.max(0, bag.userData.progress - 0.85/(BELT_END_X-BELT_START_X));
    const p=bag.userData.progress;
    bag.position.set(BELT_START_X+p*(BELT_END_X-BELT_START_X),BELT_Y,0);
    if(p>=1.0){
      bag.position.set(BELT_END_X,BELT_Y,0);
      bag.userData.readyForPick=true;
      if(!robotAnim.hasBag && robotAnim.phase===0 && !logistics.boxReady){
        robotAnim.phase=1; robotAnim.t=0; robotAnim.carriedBag=bag;
      }
    }
  });
}

// ── Robot ──
const robotTool = new THREE.Vector3(6, 2.7, 0);
const robotFrom = robotTool.clone();
const robotTarget = robotTool.clone();
function poseRobot(tool) {
  const dx=tool.x-robotGroup.position.x, dz=tool.z-robotGroup.position.z;
  const radial=Math.hypot(dx,dz), vertical=tool.y+0.67-1.78;
  const l1=2.12,l2=1.68;
  const cosine=THREE.MathUtils.clamp((radial*radial+vertical*vertical-l1*l1-l2*l2)/(2*l1*l2),-1,1);
  const elbow=Math.acos(cosine);
  const shoulder=Math.atan2(radial,vertical)-Math.atan2(l2*Math.sin(elbow),l1+l2*Math.cos(elbow));
  // Rotate only the joint assembly: the robot pedestal stays fixed.
  shoulderPivot.rotation.set(shoulder,Math.atan2(dx,dz),0,'YXZ');
  elbowPivot.rotation.x=elbow;
  wristPivot.rotation.x=-shoulder-elbow;
  robotGroup.updateMatrixWorld(true);
}
poseRobot(robotTool);
function animateRobot(dt){
  const ra=robotAnim;
  if(ra.phase===0) return;
  if(ra.t===0){
    robotFrom.copy(robotTool);
    const slot=bagPositions[plantState._bolsitasEnCaja];
    const destination=new THREE.Vector3(11.5+slot[0],0.2+slot[1],slot[2]);
    const pick=ra.carriedBag?.position;
    if(ra.phase<=2) robotTarget.set(pick?.x??BELT_END_X,BELT_Y,0);
    if(ra.phase===3) robotTarget.set(BELT_END_X,2.7,0);
    if(ra.phase===4) robotTarget.set(destination.x,2.7,destination.z);
    if(ra.phase===5 || ra.phase===6) robotTarget.copy(destination);
    if(ra.phase===7) robotTarget.set(robotTool.x,2.7,robotTool.z);
    if(ra.phase===8) robotTarget.set(BELT_END_X,2.7,0);
  }
  ra.t+=dt*plantState.speed;
  const pt=Math.min(ra.t/ra.duration[ra.phase],1);
  const eased=smoothMotion(pt);
  robotTool.lerpVectors(robotFrom,robotTarget,eased);
  if(ra.phase===4 || ra.phase===8) robotTool.z+=0.55*Math.sin(Math.PI*eased);
  poseRobot(robotTool);
  const grip=ra.phase===2?lerp(0.27,0.21,eased):ra.phase===6?lerp(0.21,0.27,eased):ra.hasBag?0.21:0.27;
  garraL.position.x=-grip; garraR.position.x=grip;
  if(ra.hasBag && ra.carriedBag){
    ra.carriedBag.position.copy(robotTool);
  }
  if(pt>=1){
    ra.t=0;
    if(ra.phase===2){
      ra.hasBag=true;
      if(ra.carriedBag) ra.carriedBag.userData.active=false;
    }
    if(ra.phase===6){
      ra.hasBag=false;
      if(ra.carriedBag){ra.carriedBag.visible=false;ra.carriedBag.userData.readyForPick=false;ra.carriedBag=null;}
      BAGS_IN_BOX[plantState._bolsitasEnCaja].visible=true;
      plantState._bolsitasEnCaja++;
      if(plantState._bolsitasEnCaja>=BOLSITAS_POR_CAJA) completarCaja();
    }
    ra.phase++;
    if(ra.phase>=ra.duration.length) ra.phase=0;
  }
}
function lerp(a,b,t){ return a+(b-a)*t; }

function completarCaja(){
  plantState._bolsitasEnCaja=0;
  logistics.boxReady=true;
  logistics.closeT=0;
  plantState.cajas++;
  playBeep(800,0.15); playBeep(1000,0.1);
  logEvent(`📦 Caja #${plantState.cajas} completada (${BOLSITAS_POR_CAJA} bolsitas)`,'ok');
  logEvent('AMR solicitado: caja lista para retiro','info');
  if(plantState.mode==='auto' && plantState.nivel<0.3){
    plantState.nivel=1.0; plantState.alarm=false;
    logEvent('Tolva recargada (modo auto)','ok');
    plantState.running=true;
    if(document.getElementById('btn-start')) document.getElementById('btn-start').textContent='⏸ DETENER LÍNEA';
    document.getElementById('btn-start')?.classList.add('running');
  }
}

// ── Resize ──
function frameLine(){
  const direction=new THREE.Vector3(0.35,0.37,1).normalize();
  const distance=Math.max(23,20/Math.max(camera.aspect,0.45));
  controls.target.set(1,3.7,0);
  camera.position.copy(controls.target).addScaledVector(direction,distance);
  controls.update();
}
let firstLayout=true;
function onResize(){
  const w=Math.max(1,canvas.clientWidth), h=Math.max(1,canvas.clientHeight);
  renderer.setSize(w,h,false);
  camera.aspect=w/h; camera.updateProjectionMatrix();
  if(firstLayout){frameLine();firstLayout=false;}
}
window.addEventListener('resize',onResize);
onResize();

logEvent('Sistema iniciado. Esperando comando.','info');
updatePanel(); drawSparkline();
requestAnimationFrame(animate);

