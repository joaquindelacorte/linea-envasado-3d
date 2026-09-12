/**
 * main.js — Línea de Envasado 3D  (v2 — más detalle + mejor iluminación)
 * Three.js scene: tolva → flowpack → cinta → brazo robot → cajas
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
  _cintaTimer: 0,
  _robotTimer: 0,
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
renderer.toneMappingExposure = 1.35;
renderer.setClearColor(0x1a2744);   // azul fábrica, no negro

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1a2744, 0.010);   // niebla más suave

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
camera.position.set(0, 11, 20);
camera.lookAt(0, 2, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 8;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI / 2.1;
controls.target.set(1, 2, 0);

// ─────────────────────────────────────────────
// ILUMINACIÓN  (más luces, más brillante)
// ─────────────────────────────────────────────
// Ambiente general
scene.add(new THREE.AmbientLight(0xd0e8ff, 0.70));

// Sol industrial (directional)
const sun = new THREE.DirectionalLight(0xfff5e0, 2.0);
sun.position.set(-10, 18, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { near: 0.5, far: 60, left: -25, right: 25, top: 25, bottom: -25 });
scene.add(sun);

// Fill desde la derecha
const fill = new THREE.DirectionalLight(0xaac8ff, 0.6);
fill.position.set(12, 8, -6);
scene.add(fill);

// Lámparas colgantes sobre cada equipo (PointLight)
function ceilingLamp(x, z, color = 0xffe8b0, intensity = 2.0, dist = 12) {
  const pl = new THREE.PointLight(color, intensity, dist, 1.8);
  pl.position.set(x, 9, z);
  scene.add(pl);
  // Fixture visual
  const fix = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.28, 0.25, 8),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.7, roughness: 0.3 })
  );
  fix.position.set(x, 9.12, z);
  scene.add(fix);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xfffbe0, emissive: 0xfffbe0, emissiveIntensity: 2 })
  );
  bulb.position.set(x, 8.95, z);
  scene.add(bulb);
}
ceilingLamp(-9,  0, 0xffe8b0, 2.2);   // sobre tolva
ceilingLamp(-3.5,0, 0xffe8b0, 2.0);   // sobre flowpack
ceilingLamp(2,   0, 0xffe8b0, 1.8);   // sobre cinta
ceilingLamp(8.5, 0, 0xff8888, 1.5);   // sobre robot (luz rojiza de seguridad)
ceilingLamp(11.5,0, 0xffe8b0, 1.8);   // sobre cajas

// ─────────────────────────────────────────────
// PISO FÁBRICA
// ─────────────────────────────────────────────
const floorMat = new THREE.MeshStandardMaterial({ color: 0x2e3c50, roughness: 0.85, metalness: 0.05 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 25), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Líneas amarillas de seguridad en el piso
function floorLine(x1,z1,x2,z2) {
  const pts = [new THREE.Vector3(x1,0.01,z1), new THREE.Vector3(x2,0.01,z2)];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0xf5c518, linewidth: 2 });
  scene.add(new THREE.Line(geo, mat));
}
// Carril de la línea de producción
floorLine(-13,-3.5, 15,-3.5);
floorLine(-13, 3.5, 15, 3.5);

const grid = new THREE.GridHelper(50, 50, 0x3a4f6a, 0x2a3a52);
grid.position.y = 0.005;
scene.add(grid);

// ─────────────────────────────────────────────
// MATERIALES
// ─────────────────────────────────────────────
const M = {
  steel:      () => new THREE.MeshStandardMaterial({ color: 0x7a8fa6, roughness: 0.25, metalness: 0.90 }),
  steelDark:  () => new THREE.MeshStandardMaterial({ color: 0x4a5a6e, roughness: 0.35, metalness: 0.85 }),
  steelLight: () => new THREE.MeshStandardMaterial({ color: 0xa0b4c8, roughness: 0.2,  metalness: 0.85 }),
  panel:      () => new THREE.MeshStandardMaterial({ color: 0xdce8f0, roughness: 0.55, metalness: 0.10 }),  // panel blanco
  panelBlue:  () => new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.5,  metalness: 0.15 }),  // azul seguridad
  panelCream: () => new THREE.MeshStandardMaterial({ color: 0xf0e8d5, roughness: 0.6,  metalness: 0.05 }),
  orange:     () => new THREE.MeshStandardMaterial({ color: 0xf0883e, roughness: 0.45, metalness: 0.20, emissive: 0x301000, emissiveIntensity: 0.3 }),
  yellow:     () => new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.5,  metalness: 0.10 }),
  greenLed:   () => new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.5, roughness: 0.3 }),
  redLed:     () => new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.5, roughness: 0.3 }),
  yellowLed:  () => new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 1.5, roughness: 0.3 }),
  belt:       () => new THREE.MeshStandardMaterial({ color: 0x1c2a3a, roughness: 0.95 }),
  rubber:     () => new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.95 }),
  bag:        () => new THREE.MeshStandardMaterial({ color: 0xecd9b5, roughness: 0.8 }),
  bagPrint:   () => new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.7 }),
  cardboard:  () => new THREE.MeshStandardMaterial({ color: 0xc4924e, roughness: 0.92 }),
  wood:       () => new THREE.MeshStandardMaterial({ color: 0x8b6340, roughness: 0.95 }),
  glass:      () => new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.25 }),
  hose:       () => new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }),
  robotBase:  () => new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.3, metalness: 0.85 }),
  robotArm:   () => new THREE.MeshStandardMaterial({ color: 0xf0883e, roughness: 0.25, metalness: 0.75 }),
  robotJoint: () => new THREE.MeshStandardMaterial({ color: 0x2d4a6a, roughness: 0.2,  metalness: 0.90 }),
};

// Helpers geométricos
function box(w,h,d, mat, x=0,y=0,z=0, rx=0,ry=0,rz=0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x,y,z);
  m.rotation.set(rx,ry,rz);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rT,rB,h, segs, mat, x=0,y=0,z=0, rx=0,ry=0,rz=0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rT,rB,h,segs), mat);
  m.position.set(x,y,z);
  m.rotation.set(rx,ry,rz);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function sph(r, mat, x=0,y=0,z=0) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r,12,12), mat);
  m.position.set(x,y,z);
  m.castShadow = true;
  return m;
}

// ══════════════════════════════════════════════════════
// TOLVA  (grupo centrado en x=-9)
// ══════════════════════════════════════════════════════
const tolvaGroup = new THREE.Group();
tolvaGroup.position.set(-9, 0, 0);

// --- Patas estructurales + cruces ---
const legPos = [[-0.9,0.9],[-0.9,-0.9],[0.9,0.9],[0.9,-0.9]];
legPos.forEach(([lx,lz]) => {
  tolvaGroup.add(box(0.12,4.5,0.12, M.steelDark(), lx,2.25,lz));
});
// Travesaños horizontales
[1.0, 2.5, 3.8].forEach(h => {
  tolvaGroup.add(box(1.9,0.08,0.08, M.steelDark(), 0,h, 0.9));
  tolvaGroup.add(box(1.9,0.08,0.08, M.steelDark(), 0,h,-0.9));
  tolvaGroup.add(box(0.08,0.08,1.9, M.steelDark(), 0.9,h, 0));
  tolvaGroup.add(box(0.08,0.08,1.9, M.steelDark(),-0.9,h, 0));
});
// Crucetas diagonales
tolvaGroup.add(box(2.6,0.07,0.07, M.steel(), 0,2.0,0.9, 0,0, 0.55));
tolvaGroup.add(box(2.6,0.07,0.07, M.steel(), 0,2.0,-0.9,0,0,-0.55));

// --- Cuerpo cónico (octagonal) ---
const tolvaConeGeo = new THREE.CylinderGeometry(1.9, 0.4, 4.0, 8);
const tolvaMat = M.panel();
const tolvaCone = new THREE.Mesh(tolvaConeGeo, tolvaMat);
tolvaCone.position.set(0, 6.3, 0);
tolvaCone.castShadow = true;
tolvaGroup.add(tolvaCone);
export const tolvaLevelMat = tolvaMat;

// Flange superior e inferior
tolvaGroup.add(cyl(2.05,2.05,0.12,16, M.steelLight(), 0,8.35,0));
tolvaGroup.add(cyl(0.52,0.52,0.12,12, M.steelLight(), 0,4.25,0));

// Tapa con bisagra
tolvaGroup.add(box(3.85,0.14,3.85, M.steelDark(), 0,8.43,0));
// Manijas de la tapa
tolvaGroup.add(box(0.5,0.09,0.09, M.steel(),  0.8,8.55,0));
tolvaGroup.add(box(0.5,0.09,0.09, M.steel(), -0.8,8.55,0));

// Visor de nivel lateral (rectángulo translúcido)
const visorGeo = new THREE.BoxGeometry(0.08, 2.5, 0.35);
const visorMesh = new THREE.Mesh(visorGeo, M.glass());
visorMesh.position.set(1.8, 6.5, 0);
tolvaGroup.add(visorMesh);
// Marco visor
tolvaGroup.add(box(0.12,2.62,0.45, M.steelDark(), 1.82,6.5,0));

// Motor vibratorio (caja pequeña con sombra)
const motorBox = box(0.55,0.38,0.55, M.steelDark(), -1.7,5.2,0);
tolvaGroup.add(motorBox);
tolvaGroup.add(cyl(0.12,0.12,0.6,8, M.steelDark(), -1.7,5.2,0, 0,0,Math.PI/2));

// Tubo de descarga inferior
tolvaGroup.add(cyl(0.38,0.38,0.9,10, M.steelDark(),  0,3.85,0));
tolvaGroup.add(cyl(0.42,0.42,0.10,10, M.steelLight(),0,3.42,0));  // brida

// Compuerta rotante
const compuertaGeo = new THREE.BoxGeometry(0.62,0.12,0.75);
const compuertaMat = M.orange();
const compuerta = new THREE.Mesh(compuertaGeo, compuertaMat);
compuerta.position.set(0, 3.08, 0);
tolvaGroup.add(compuerta);
// Actuador de compuerta (cilindro lateral)
const actuatorBody = cyl(0.07,0.07,0.7,8, M.steelDark());
actuatorBody.rotation.z = Math.PI/2;
actuatorBody.position.set(0.55, 3.15, 0);
tolvaGroup.add(actuatorBody);

// LEDs de estado tolva (columna semáforo)
const trafficPost = box(0.06,0.7,0.06, M.steelDark(), 1.4,8.0,0);
tolvaGroup.add(trafficPost);
const tolvaSemaforoG = sph(0.10, M.greenLed(),  1.4, 8.55, 0);
const tolvaSemaforoY = sph(0.10, M.yellowLed(), 1.4, 8.35, 0);
const tolvaSemaforoR = sph(0.10, M.redLed(),    1.4, 8.15, 0);
tolvaGroup.add(tolvaSemaforoG, tolvaSemaforoY, tolvaSemaforoR);

scene.add(tolvaGroup);

// ══════════════════════════════════════════════════════
// TUBO TOLVA → FLOWPACK (con bridas y codo)
// ══════════════════════════════════════════════════════
const pipeGroup = new THREE.Group();
// Tramo vertical bajada
pipeGroup.add(cyl(0.25,0.25,0.9,10, M.steelDark(), -9,2.7,0));
// Bridas
pipeGroup.add(cyl(0.32,0.32,0.09,10, M.steelLight(), -9,3.15,0));
pipeGroup.add(cyl(0.32,0.32,0.09,10, M.steelLight(), -9,2.22,0));
// Tramo horizontal
pipeGroup.add(cyl(0.25,0.25,2.5,10, M.steelDark(), -7.7,2.25,0, 0,0,Math.PI/2));
pipeGroup.add(cyl(0.32,0.32,0.09,10, M.steelLight(),-7.7,2.25,0, 0,0,Math.PI/2));
// Codo (esfera de transición)
pipeGroup.add(sph(0.28, M.steelDark(), -9.0,2.25,0));
scene.add(pipeGroup);

// ══════════════════════════════════════════════════════
// ENVASADORA FLOWPACK  (x=-3.5)
// ══════════════════════════════════════════════════════
const fpGroup = new THREE.Group();
fpGroup.position.set(-3.5, 0, 0);

// --- Estructura base/chasis ---
fpGroup.add(box(3.4, 0.14, 2.8, M.steelDark(),  0,0.07,0));   // base
// Patas con amortiguadores
[[1.45,0.9],[1.45,-0.9],[-1.45,0.9],[-1.45,-0.9]].forEach(([lx,lz]) => {
  fpGroup.add(box(0.18,0.75,0.18, M.steelDark(), lx,0.37,lz));
  fpGroup.add(cyl(0.12,0.15,0.10,8, M.rubber(),  lx,0.02,lz));  // pie antivibración
});

// --- Cuerpo principal (panels) ---
fpGroup.add(box(3.2,2.8,2.6, M.steelDark(), 0,1.54,0));    // estructura interna
fpGroup.add(box(3.0,2.6,0.08, M.panel(),    0,1.50, 1.34)); // panel frontal blanco
fpGroup.add(box(3.0,2.6,0.08, M.panel(),    0,1.50,-1.34)); // panel trasero
fpGroup.add(box(0.08,2.6,2.6, M.panel(),   -1.54,1.50,0));  // panel lateral izq
fpGroup.add(box(0.08,2.6,2.6, M.panel(),    1.54,1.50,0));  // panel lateral der

// Ventanas de inspección (vidrio)
fpGroup.add(box(1.6,1.2,0.06, M.glass(),   0,1.6, 1.36));
fpGroup.add(box(0.06,1.2,1.6, M.glass(),  -1.56,1.6,0));

// --- Módulo de bobina de film (parte superior) ---
fpGroup.add(box(3.2,0.6,2.6,  M.panelBlue(), 0,3.1,0));         // caja superior azul
fpGroup.add(cyl(0.65,0.65,2.4,16, M.steelLight(), 0,3.15,0, Math.PI/2,0,0)); // bobina film vacía
fpGroup.add(cyl(0.70,0.70,0.12,16, M.steelDark(),  1.15,3.15,0, Math.PI/2,0,0)); // brida
fpGroup.add(cyl(0.70,0.70,0.12,16, M.steelDark(), -1.15,3.15,0, Math.PI/2,0,0));
// Eje bobina
fpGroup.add(cyl(0.09,0.09,2.8,8, M.steelDark(), 0,3.15,0, Math.PI/2,0,0));

// --- Rodillos guía de film ---
const rodMat = M.steelLight();
[[-1.1,2.8],[0,2.8],[1.1,2.8],[-0.55,2.1],[0.55,2.1]].forEach(([rx,ry]) => {
  const rod = cyl(0.10,0.10,2.5,10, rodMat, rx,ry,0, Math.PI/2,0,0);
  fpGroup.add(rod);
});

// --- Mandril formador (tubo triangular en el centro) ---
fpGroup.add(cyl(0.28,0.20,1.4,3, M.steelDark(), 0,1.6,0));

// --- Mordazas de sellado transversal ---
const mordazaMat = M.steelDark();
const mordazaA = box(0.5,0.12,2.4, mordazaMat, -0.25,0.9,0);
const mordazaB = box(0.5,0.12,2.4, mordazaMat,  0.25,0.9,0);
fpGroup.add(mordazaA, mordazaB);
// Resistencias de sellado (barras naranja)
fpGroup.add(box(0.06,0.06,2.2, M.orange(), -0.25,0.88,0));
fpGroup.add(box(0.06,0.06,2.2, M.orange(),  0.25,0.88,0));

// --- Panel de control lateral ---
const cpanel = new THREE.Group();
cpanel.position.set(-1.7, 2.0, 0);
cpanel.add(box(0.08,0.9,0.7, M.panelBlue()));
// Botones
[[-0.18,0.15],[-0.18,-0.10],[0.12,0.15],[0.12,-0.10]].forEach(([py,pz]) => {
  cpanel.add(sph(0.06, M.greenLed(), 0.05,py,pz));
});
// Display (rectángulo naranja)
cpanel.add(box(0.05,0.22,0.40, M.orange(), 0.05,0.30,0));
scene.add(cpanel); fpGroup.add(cpanel);

// --- Rampa / chute de salida ---
const chuteGroup = new THREE.Group();
chuteGroup.position.set(1.8, 0.85, 0);
chuteGroup.rotation.z = -0.22;
chuteGroup.add(box(0.9,0.10,1.8, M.steelDark()));
chuteGroup.add(box(0.9,0.35,0.06, M.steel(), 0,0.18, 0.88)); // guarda lateral
chuteGroup.add(box(0.9,0.35,0.06, M.steel(), 0,0.18,-0.88));
fpGroup.add(chuteGroup);

// --- LED de estado (semáforo) ---
fpGroup.add(box(0.07,0.55,0.07, M.steelDark(), 1.56,3.1,1.2));
fpGroup.add(sph(0.10, M.greenLed(),  1.56,3.48,1.2));
fpGroup.add(sph(0.10, M.yellowLed(), 1.56,3.28,1.2));
fpGroup.add(sph(0.10, M.redLed(),    1.56,3.08,1.2));

scene.add(fpGroup);

// ── Bolsitas (pool reutilizable)
const BAGS_POOL = 8;
const bagsOnBelt = [];
for (let i = 0; i < BAGS_POOL; i++) {
  const bagGroup = new THREE.Group();
  bagGroup.add(box(0.55,0.18,0.40, M.bag()));           // cuerpo
  bagGroup.add(box(0.55,0.04,0.42, M.bagPrint(), 0,0.08,0)); // franja impresión
  bagGroup.castShadow = true;
  bagGroup.visible = false;
  bagGroup.userData = { active: false, progress: 0, readyForPick: false };
  scene.add(bagGroup);
  bagsOnBelt.push(bagGroup);
}

// ══════════════════════════════════════════════════════
// CINTA TRANSPORTADORA  (centro en x=2)
// ══════════════════════════════════════════════════════
const cintaGroup = new THREE.Group();
cintaGroup.position.set(2, 0, 0);

// --- Estructura lateral (dos canales L) ---
[[1.0],[-1.0]].forEach(([lz]) => {
  cintaGroup.add(box(9.0,0.28,0.12, M.steelDark(), 0,0.86,lz));  // riel horizontal
  cintaGroup.add(box(9.0,0.10,0.28, M.steelDark(), 0,0.72,lz));  // flange inferior
});

// --- Banda ---
const beltMesh = new THREE.Mesh(
  new THREE.BoxGeometry(9,0.07,1.75),
  M.belt()
);
beltMesh.position.set(0,0.74,0);
beltMesh.receiveShadow = true;
cintaGroup.add(beltMesh);

// --- Rodillos intermedios (cada 1.5 u) ---
for (let rx = -4; rx <= 4; rx += 1.5) {
  const rol = cyl(0.13,0.13,1.78,10, M.steelLight(), rx,0.77,0, Math.PI/2,0,0);
  cintaGroup.add(rol);
  // Tapas de rodillo
  cintaGroup.add(cyl(0.16,0.16,0.06,10, M.steelDark(), rx,0.77, 0.9,  Math.PI/2,0,0));
  cintaGroup.add(cyl(0.16,0.16,0.06,10, M.steelDark(), rx,0.77,-0.9,  Math.PI/2,0,0));
}

// --- Patas con travesaño y pie nivelador ---
[-3.5, 0, 3.5].forEach(lx => {
  [0.76,-0.76].forEach(lz => {
    cintaGroup.add(box(0.14,0.72,0.14, M.steelDark(), lx,0.36,lz));
    cintaGroup.add(cyl(0.10,0.12,0.08,8, M.rubber(),  lx,0.01,lz));  // pie nivelador
  });
  cintaGroup.add(box(0.08,0.08,1.66, M.steel(), lx,0.48,0)); // travesaño
});

// --- Motor housing (extremo derecho) ---
const motorHousing = new THREE.Group();
motorHousing.position.set(4.5, 0.75, 0);
motorHousing.add(box(0.9,0.65,0.65, M.panelBlue()));
motorHousing.add(cyl(0.22,0.22,0.70,10, M.steelDark(), 0,0,0, Math.PI/2,0,0)); // eje
motorHousing.add(cyl(0.10,0.10,0.85,8, M.steelDark(),  0,0,0, Math.PI/2,0,0));
// Disipadores (aletas)
for (let i = 0; i < 5; i++) {
  motorHousing.add(box(0.04,0.50,0.65, M.steel(), -0.35+i*0.18, 0.08, 0));
}
// Caja de terminales
motorHousing.add(box(0.15,0.28,0.28, M.steelDark(), -0.53, 0.18, 0));
cintaGroup.add(motorHousing);

// --- Guardas laterales de seguridad (barras naranjas) ---
cintaGroup.add(box(8.6,0.06,0.06, M.orange(), 0,1.18, 1.30));
cintaGroup.add(box(8.6,0.06,0.06, M.orange(), 0,1.18,-1.30));
cintaGroup.add(box(0.06,0.45,0.06, M.orange(),-4.3,0.95, 1.30));
cintaGroup.add(box(0.06,0.45,0.06, M.orange(), 4.3,0.95, 1.30));
cintaGroup.add(box(0.06,0.45,0.06, M.orange(),-4.3,0.95,-1.30));
cintaGroup.add(box(0.06,0.45,0.06, M.orange(), 4.3,0.95,-1.30));

scene.add(cintaGroup);

// ══════════════════════════════════════════════════════
// BRAZO ROBOT  (x=8.5)
// ══════════════════════════════════════════════════════
const robotGroup = new THREE.Group();
robotGroup.position.set(8.5, 0, 0);

// --- Base pesada octagonal ---
robotGroup.add(cyl(1.0,1.15,0.22,8, M.robotBase(),  0,0.11,0));  // placa base
robotGroup.add(cyl(0.90,0.90,0.38,8, M.robotBase(),  0,0.41,0));  // cuerpo bajo
// Pernos de anclaje
for (let a = 0; a < 8; a++) {
  const angle = (a/8)*Math.PI*2;
  robotGroup.add(cyl(0.05,0.05,0.25,6, M.steelLight(),
    Math.cos(angle)*0.95, 0.12, Math.sin(angle)*0.95));
}
// Cuerpo columna
robotGroup.add(cyl(0.55,0.50,1.6,12, M.robotBase(), 0,1.4,0));
// Detalle columna
robotGroup.add(cyl(0.58,0.58,0.08,12, M.robotJoint(), 0,0.65,0));
robotGroup.add(cyl(0.58,0.58,0.08,12, M.robotJoint(), 0,1.55,0));
robotGroup.add(cyl(0.58,0.58,0.08,12, M.robotJoint(), 0,2.15,0));
// Caja del motor de base
robotGroup.add(box(0.55,0.40,0.55, M.steelDark(), 0.60,0.60,0));
robotGroup.add(box(0.30,0.22,0.30, M.panelBlue(), 0.60,0.88,0));

// --- Hombro pivot ---
const shoulderPivot = new THREE.Group();
shoulderPivot.position.set(0, 2.2, 0);
robotGroup.add(shoulderPivot);

// Esfera articulación hombro
shoulderPivot.add(sph(0.32, M.robotJoint(), 0,0,0));
// Brazo superior (sección octagonal)
shoulderPivot.add(cyl(0.22,0.18,2.0,8, M.robotArm(), 0,1.0,0));
// Canaleta de cables
shoulderPivot.add(box(0.10,2.0,0.10, M.hose(), 0.25,1.0,0.14));
// Perno de bloqueo
shoulderPivot.add(cyl(0.08,0.08,0.50,6, M.steelLight(), 0.28,0,-0.0, 0,0,Math.PI/2));

// --- Codo pivot ---
const elbowPivot = new THREE.Group();
elbowPivot.position.set(0, 2.05, 0);
shoulderPivot.add(elbowPivot);

// Esfera articulación codo
elbowPivot.add(sph(0.24, M.robotJoint(), 0,0,0));
// Antebrazo
elbowPivot.add(cyl(0.16,0.12,1.7,8, M.robotBase(), 0,0.85,0));
// Canaleta cables antebrazo
elbowPivot.add(box(0.08,1.7,0.08, M.hose(), 0.20,0.85,0.10));

// --- Muñeca pivot ---
const wristPivot = new THREE.Group();
wristPivot.position.set(0, 1.72, 0);
elbowPivot.add(wristPivot);

wristPivot.add(sph(0.18, M.robotJoint(), 0,0,0));

// --- Garra paralela (2 dedos con palmas) ---
const gripperBase = box(0.28,0.18,0.28, M.robotJoint(), 0,-0.10,0);
wristPivot.add(gripperBase);

const garraL = new THREE.Group();
garraL.position.set(-0.17,-0.22,0);
garraL.add(box(0.09,0.38,0.20, M.robotArm()));
garraL.add(box(0.14,0.06,0.22, M.robotArm(), 0.02,-0.22,0));  // diente
wristPivot.add(garraL);

const garraR = new THREE.Group();
garraR.position.set( 0.17,-0.22,0);
garraR.add(box(0.09,0.38,0.20, M.robotArm()));
garraR.add(box(0.14,0.06,0.22, M.robotArm(),-0.02,-0.22,0));
wristPivot.add(garraR);

// LED sensor garra
const garraLedMat = M.greenLed();
const garraLed = sph(0.07, garraLedMat, 0,-0.45,0);
wristPivot.add(garraLed);

// --- Torre de señalización robot ---
const signalTower = new THREE.Group();
signalTower.position.set(-1.0, 0, 0);
signalTower.add(cyl(0.05,0.05,2.5,8, M.steelDark(), 0,1.25,0));
signalTower.add(cyl(0.16,0.16,0.30,8, M.greenLed(),  0,2.40,0));
signalTower.add(cyl(0.16,0.16,0.30,8, M.yellowLed(), 0,2.10,0));
signalTower.add(cyl(0.16,0.16,0.30,8, M.redLed(),    0,1.80,0));
robotGroup.add(signalTower);

scene.add(robotGroup);

// ══════════════════════════════════════════════════════
// CAJAS DE EMBALAJE  (x=11.5)
// ══════════════════════════════════════════════════════
const BOLSITAS_POR_CAJA = 6;
const boxAreaGroup = new THREE.Group();
boxAreaGroup.position.set(11.5, 0, 0);

// --- Palet de madera ---
const palletGroup = new THREE.Group();
palletGroup.position.set(0, 0, 0);
// Tablas superiores
for (let i = -0.7; i <= 0.7; i += 0.35) {
  palletGroup.add(box(1.9,0.06,0.28, M.wood(), 0,0.12,i));
}
// Bloques de pie
[[-0.7,0],[0,0],[0.7,0]].forEach(([px,pz]) => {
  palletGroup.add(box(0.28,0.10,1.85, M.wood(), px,0.05,pz));
});
boxAreaGroup.add(palletGroup);

// --- Caja activa con detalle ---
const activeBoxMat = M.cardboard();
const activeBox = box(1.65,1.25,1.65, activeBoxMat, 0,0.80,0);
boxAreaGroup.add(activeBox);
// Aristas de cartón
const edgeMat = new THREE.MeshStandardMaterial({ color: 0x8b5e30, roughness: 0.95 });
[[0.82,0.80,0,  0,0,0,  0.04,1.25,0.04],
 [-0.82,0.80,0, 0,0,0,  0.04,1.25,0.04],
 [0,0.80,0.82,  0,0,0,  1.65,1.25,0.04],
 [0,0.80,-0.82, 0,0,0,  1.65,1.25,0.04]].forEach(([x,y,z,rx,ry,rz,w,h,d]) => {
  boxAreaGroup.add(box(w,h,d, edgeMat, x,y,z,rx,ry,rz));
});
// Tapa caja
const lidMesh = box(1.72,0.08,1.72, M.steelDark(), 0,1.46,0);
boxAreaGroup.add(lidMesh);

// --- Zona de apilado (estante metálico) ---
const shelfGroup = new THREE.Group();
shelfGroup.position.set(-2.8, 0, 0);
// Columnas
[[-0.85,0.85],[-0.85,-0.85],[0.85,0.85],[0.85,-0.85]].forEach(([sx,sz]) => {
  shelfGroup.add(box(0.10,3.5,0.10, M.steelDark(), sx,1.75,sz));
});
// Estantes
[0.20, 1.6, 3.0].forEach(sy => {
  shelfGroup.add(box(1.75,0.06,1.75, M.steelDark(), 0,sy,0));
});
boxAreaGroup.add(shelfGroup);

// Cajas apiladas (se activan a medida que se completan)
const stackBoxes = [];
const stackPositions = [
  [0,0.22,0], [0,1.62,0], [0,3.02,0],
  [0,0.22,0], [0,1.62,0]
];
stackPositions.forEach(([sx,sy,sz], i) => {
  const sb = new THREE.Group();
  sb.position.set(-2.8+sx, sy, sz);
  sb.add(box(1.60,1.20,1.60, M.cardboard()));
  sb.add(box(1.64,1.20,0.04, edgeMat,   0,0, 0.82));
  sb.add(box(1.64,1.20,0.04, edgeMat,   0,0,-0.82));
  sb.add(box(0.04,1.20,1.60, edgeMat,  0.82,0,0));
  sb.add(box(0.04,1.20,1.60, edgeMat, -0.82,0,0));
  sb.visible = false;
  boxAreaGroup.add(sb);
  stackBoxes.push(sb);
});

scene.add(boxAreaGroup);

// ══════════════════════════════════════════════════════
// ETIQUETAS FLOTANTES
// ══════════════════════════════════════════════════════
function makeLabel(text, x, y, z, color = '#f0883e', bg = 'rgba(20,30,60,0.88)') {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 72;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  if (ctx.roundRect) ctx.roundRect(3,3,314,66,10);
  else ctx.rect(3,3,314,66);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  if (ctx.roundRect) ctx.roundRect(3,3,314,66,10);
  else ctx.rect(3,3,314,66);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 24px "Courier New"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 160, 36);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sp.scale.set(2.4, 0.55, 1);
  sp.position.set(x, y, z);
  scene.add(sp);
}
makeLabel('TOLVA',    -9.0,  9.8, 0);
makeLabel('FLOWPACK', -3.5,  4.4, 0);
makeLabel('CINTA',     2.0,  2.6, 0);
makeLabel('ROBOT',     8.5,  5.8, 0, '#ff8888');
makeLabel('CAJAS',    11.5,  2.6, 0);

// ══════════════════════════════════════════════════════
// ANIMACIÓN DEL ROBOT
// ══════════════════════════════════════════════════════
const robotAnim = {
  phase: 0,
  t: 0,
  duration:        [0, 0.5, 0.2, 0.5, 0.65, 0.5, 0.2, 0.65],
  shoulderTargets: [0, -0.45, -0.45, 0.35, 0.35, -0.25, -0.25, 0],
  elbowTargets:    [0.2, 0.65, 0.65, -0.25, -0.25, 0.55, 0.55, 0.2],
  hasBag: false,
  carriedBag: null,
};

// ══════════════════════════════════════════════════════
// POSICIONES BOLSITAS
// ══════════════════════════════════════════════════════
const BELT_START_X = -1.5;
const BELT_END_X   =  6.0;
const BELT_Y       =  0.85;
const BELT_Z       =  0.0;

// ══════════════════════════════════════════════════════
// UI / PANEL
// ══════════════════════════════════════════════════════
function updatePanel() {
  const s = plantState;
  setLed('tolva',    s.alarm ? 'red'   : (s.running ? 'green' : 'yellow'));
  setLed('flowpack', s.running ? 'green' : 'yellow');
  setLed('cinta',    s.running ? 'green' : 'yellow');
  setLed('robot',    s.emergency ? 'red' : (s.running ? 'green' : 'yellow'));
  setStatus('tolva',    s.alarm ? 'Alarma nivel' : (s.running ? 'OK' : 'En espera'));
  setStatus('flowpack', s.running ? 'Sellando' : 'En espera');
  setStatus('cinta',    s.running ? 'Corriendo' : 'En espera');
  setStatus('robot',    s.emergency ? '⚠ Detenido' : (s.running ? 'Activo' : 'En espera'));
  document.getElementById('cnt-bolsitas').textContent = s.bolsitas;
  document.getElementById('cnt-cajas').textContent    = s.cajas;
  document.getElementById('cnt-throughput').textContent = throughputHistory[throughputHistory.length - 1] || 0;
  const pct = Math.round(s.nivel * 100);
  const fill = document.getElementById('level-bar-fill');
  fill.style.width = pct + '%';
  fill.style.background = pct > 40 ? 'var(--green)' : pct > 20 ? 'var(--yellow)' : 'var(--red)';
  document.getElementById('level-pct').textContent = pct + '%';
  const banner = document.getElementById('alarm-banner');
  s.alarm ? banner.classList.remove('hidden') : banner.classList.add('hidden');
}
function setLed(id, cls) { document.getElementById('led-'+id).className = 'stage-led '+cls; }
function setStatus(id, txt) { document.getElementById('status-'+id).textContent = txt; }

export function logEvent(msg, type = 'info') {
  const log = document.getElementById('event-log');
  const ts  = new Date().toTimeString().slice(0,8);
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="log-time">${ts}</span> <span class="log-${type}">${msg}</span>`;
  log.prepend(div);
  while (log.children.length > 50) log.removeChild(log.lastChild);
}

function drawSparkline() {
  const c = document.getElementById('sparkline');
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = '#1c2230'; ctx.fillRect(0,0,w,h);
  const maxVal = Math.max(...throughputHistory, 1);
  ctx.strokeStyle = '#f0883e'; ctx.lineWidth = 1.5; ctx.beginPath();
  throughputHistory.forEach((v,i) => {
    const x = (i/(throughputHistory.length-1))*w;
    const y = h - (v/maxVal)*(h-4) - 2;
    i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
  });
  ctx.stroke();
}

// ══════════════════════════════════════════════════════
// CONTROLES
// ══════════════════════════════════════════════════════
window.toggleLine = function () {
  if (plantState.emergency) return;
  plantState.running = !plantState.running;
  const btn = document.getElementById('btn-start');
  if (plantState.running) {
    btn.textContent = '⏸ DETENER LÍNEA'; btn.classList.add('running');
    logEvent('Línea iniciada', 'ok');
  } else {
    btn.textContent = '▶ INICIAR LÍNEA'; btn.classList.remove('running');
    logEvent('Línea detenida', 'info');
  }
  updatePanel();
};
window.setMode = function (mode) {
  plantState.mode = mode;
  document.getElementById('btn-manual').classList.toggle('active', mode==='manual');
  document.getElementById('btn-auto').classList.toggle('active', mode==='auto');
  logEvent('Modo: ' + mode.toUpperCase(), 'info');
};
window.triggerEmergency = function () {
  plantState.running = false; plantState.emergency = true; plantState.alarm = true;
  document.getElementById('btn-start').textContent = '▶ INICIAR LÍNEA';
  document.getElementById('btn-start').classList.remove('running');
  logEvent('⚠ PARADA DE EMERGENCIA', 'alarm');
  playAlarm(); updatePanel();
};
window.resetAlarm = function () {
  plantState.alarm = false; plantState.emergency = false;
  logEvent('Alarma reseteada', 'ok'); updatePanel();
};
window.plantState = plantState;
window.updatePanel = updatePanel;
window.logEvent = logEvent;

// ══════════════════════════════════════════════════════
// AUDIO
// ══════════════════════════════════════════════════════
let audioCtx = null;
function getAudioCtx() { if (!audioCtx) audioCtx = new AudioContext(); return audioCtx; }
function playAlarm() {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = 'square';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.setValueAtTime(440, ctx.currentTime+0.15);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.4);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.4);
}
function playBeep(freq=1200, dur=0.05) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+dur);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime+dur);
}

// ══════════════════════════════════════════════════════
// GAME LOOP
// ══════════════════════════════════════════════════════
let lastTime = 0;
const CYCLE_FLOWPACK = 3.0;
const CYCLE_CINTA    = 2.0;

function animate(timestamp) {
  requestAnimationFrame(animate);
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;
  const s = plantState;

  if (s.running && !s.emergency) {
    // Nivel tolva
    s.nivel = Math.max(0, s.nivel - dt * 0.006 * s.speed);
    if (s.nivel < 0.15 && !s.alarm) {
      s.alarm = true;
      logEvent('⚠ Alarma: nivel bajo en tolva', 'alarm');
      playAlarm();
      if (s.mode === 'auto') s.running = false;
    }

    // Flowpack genera bolsitas
    s._flowpackTimer += dt * s.speed;
    if (s._flowpackTimer >= CYCLE_FLOWPACK) { s._flowpackTimer = 0; spawnBag(); }

    moveBags(dt);

    // Throughput
    _minTimer += dt;
    if (_minTimer >= 10) {
      _minTimer = 0;
      throughputHistory.push(Math.round((60/CYCLE_FLOWPACK)*s.speed));
      if (throughputHistory.length > 26) throughputHistory.shift();
      drawSparkline();
    }

    animateRobot(dt);

    // Rodillos flowpack giran
    fpGroup.children.forEach(c => {
      if (c.geometry?.type === 'CylinderGeometry') c.rotation.y += dt * 1.8 * s.speed;
    });

    // Compuerta tolva
    const targetRot = s.running ? 0.75 : 0;
    compuerta.rotation.z += (targetRot - compuerta.rotation.z) * dt * 3;

    // Color tolva según nivel
    const pct = s.nivel;
    if (pct > 0.4)      tolvaMat.color.setHex(0xdce8f0);
    else if (pct > 0.2) tolvaMat.color.setHex(0xd29922);
    else                tolvaMat.color.setHex(0xf85149);
  }

  controls.update();
  updatePanel();
  renderer.render(scene, camera);
}

// ── Bolsitas ──
function spawnBag() {
  const bag = bagsOnBelt.find(b => !b.userData.active);
  if (!bag) return;
  bag.userData.active = true;
  bag.userData.progress = 0;
  bag.userData.readyForPick = false;
  bag.visible = true;
  bag.position.set(BELT_START_X, BELT_Y, BELT_Z);
  plantState.bolsitas++;
  playBeep(1400, 0.04);
  logEvent(`Bolsita #${plantState.bolsitas} producida`, 'ok');
}

function moveBags(dt) {
  bagsOnBelt.forEach(bag => {
    if (!bag.userData.active) return;
    bag.userData.progress += dt * plantState.speed / CYCLE_CINTA;
    const p = bag.userData.progress;
    bag.position.set(BELT_START_X + p*(BELT_END_X-BELT_START_X), BELT_Y, BELT_Z);
    if (p >= 1.0) {
      bag.position.set(BELT_END_X, BELT_Y, BELT_Z);
      bag.userData.readyForPick = true;
      if (!robotAnim.hasBag && robotAnim.phase === 0) {
        robotAnim.phase = 1; robotAnim.t = 0; robotAnim.carriedBag = bag;
      }
    }
  });
}

// ── Robot ──
function animateRobot(dt) {
  const ra = robotAnim;
  if (ra.phase === 0) return;
  ra.t += dt * plantState.speed;
  const phaseDur = ra.duration[ra.phase];
  const phaseT   = Math.min(ra.t / phaseDur, 1.0);
  const ease = t => t<0.5 ? 2*t*t : -1+(4-2*t)*t;

  const sp = lerp(ra.shoulderTargets[ra.phase-1]??0, ra.shoulderTargets[ra.phase], ease(phaseT));
  const ep = lerp(ra.elbowTargets[ra.phase-1]??0.2,  ra.elbowTargets[ra.phase],    ease(phaseT));
  shoulderPivot.rotation.x = sp;
  elbowPivot.rotation.x    = ep;

  if (ra.phase === 4) robotGroup.rotation.y = lerp(0, -Math.PI*0.6, ease(phaseT));
  if (ra.phase === 7) robotGroup.rotation.y = lerp(-Math.PI*0.6, 0, ease(phaseT));

  if (ra.hasBag && ra.carriedBag) {
    const wp = new THREE.Vector3();
    wristPivot.getWorldPosition(wp);
    ra.carriedBag.position.copy(wp);
  }

  if (ra.t >= phaseDur) {
    ra.t = 0;
    if (ra.phase === 2) {
      ra.hasBag = true;
      garraL.position.x = -0.09; garraR.position.x = 0.09;
      if (ra.carriedBag) ra.carriedBag.userData.active = false;
    }
    if (ra.phase === 6) {
      ra.hasBag = false;
      garraL.position.x = -0.17; garraR.position.x = 0.17;
      if (ra.carriedBag) {
        ra.carriedBag.visible = false;
        ra.carriedBag.userData.readyForPick = false;
        ra.carriedBag = null;
      }
      plantState._bolsitasEnCaja++;
      if (plantState._bolsitasEnCaja >= BOLSITAS_POR_CAJA) completarCaja();
    }
    ra.phase++;
    if (ra.phase >= ra.duration.length) ra.phase = 0;
  }
}

function lerp(a, b, t) { return a + (b-a)*t; }

function completarCaja() {
  plantState._bolsitasEnCaja = 0;
  plantState.cajas++;
  playBeep(800, 0.15); playBeep(1000, 0.1);
  logEvent(`📦 Caja #${plantState.cajas} completada (${BOLSITAS_POR_CAJA} bolsitas)`, 'ok');
  const idx = Math.min(plantState.cajas - 1, stackBoxes.length - 1);
  if (idx >= 0) stackBoxes[idx].visible = true;
  if (plantState.mode === 'auto' && plantState.nivel < 0.3) {
    plantState.nivel = 1.0; plantState.alarm = false;
    logEvent('Tolva recargada (modo auto)', 'ok');
    plantState.running = true;
    document.getElementById('btn-start').textContent = '⏸ DETENER LÍNEA';
    document.getElementById('btn-start').classList.add('running');
  }
}

// ── Resize ──
function onResize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

logEvent('Sistema iniciado. Esperando comando.', 'info');
updatePanel();
drawSparkline();
requestAnimationFrame(animate);
