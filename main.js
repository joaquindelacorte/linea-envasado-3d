/**
 * main.js — Línea de Envasado 3D
 * Three.js scene: tolva → flowpack → cinta → brazo robot → cajas
 * Estado de la línea + animaciones + panel DOM updates
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─────────────────────────────────────────────
// ESTADO GLOBAL DE LA LÍNEA
// ─────────────────────────────────────────────
export const plantState = {
  running: false,
  mode: 'manual',
  alarm: false,
  emergency: false,
  nivel: 0.85,        // 0..1
  bolsitas: 0,
  cajas: 0,
  speed: 1.0,         // multiplicador (0.5..2.0)

  // Timers internos
  _flowpackTimer: 0,
  _cintaTimer: 0,
  _robotTimer: 0,
  _bolsitasEnCaja: 0,
};

// Historia throughput (para sparkline)
const throughputHistory = Array(26).fill(0);
let _bolitasLastMin = 0;
let _minTimer = 0;

// ─────────────────────────────────────────────
// THREE.JS SETUP
// ─────────────────────────────────────────────
const canvas = document.getElementById('canvas3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x0d1117);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0d1117, 0.018);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
camera.position.set(0, 10, 18);
camera.lookAt(0, 2, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 8;
controls.maxDistance = 35;
controls.maxPolarAngle = Math.PI / 2.1;
controls.target.set(0, 2, 0);

// ─────────────────────────────────────────────
// ILUMINACIÓN
// ─────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfff4e0, 1.4);
dirLight.position.set(-8, 14, 8);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 50;
dirLight.shadow.camera.left = -20;
dirLight.shadow.camera.right = 20;
dirLight.shadow.camera.top = 20;
dirLight.shadow.camera.bottom = -20;
scene.add(dirLight);

// Fill light
const fillLight = new THREE.DirectionalLight(0x8ab4f8, 0.3);
fillLight.position.set(8, 5, -5);
scene.add(fillLight);

// ─────────────────────────────────────────────
// PISO / PLATAFORMA
// ─────────────────────────────────────────────
const floorGeo = new THREE.PlaneGeometry(40, 20);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1f2e, roughness: 0.9 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Grid helper decorativo
const grid = new THREE.GridHelper(40, 40, 0x2a3040, 0x1e2535);
scene.add(grid);

// ─────────────────────────────────────────────
// HELPERS DE MATERIALES
// ─────────────────────────────────────────────
const M = {
  metal:     new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.4, metalness: 0.8 }),
  metalDark: new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.5, metalness: 0.7 }),
  orange:    new THREE.MeshStandardMaterial({ color: 0xf0883e, roughness: 0.5, metalness: 0.3 }),
  green:     new THREE.MeshStandardMaterial({ color: 0x3fb950, roughness: 0.6, metalness: 0.2 }),
  yellow:    new THREE.MeshStandardMaterial({ color: 0xd29922, roughness: 0.6, metalness: 0.2 }),
  red:       new THREE.MeshStandardMaterial({ color: 0xf85149, roughness: 0.6, metalness: 0.2 }),
  belt:      new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9 }),
  bag:       new THREE.MeshStandardMaterial({ color: 0xe8d5b7, roughness: 0.8 }),
  box:       new THREE.MeshStandardMaterial({ color: 0xa0785a, roughness: 0.9 }),
  robot:     new THREE.MeshStandardMaterial({ color: 0x3a4a5c, roughness: 0.3, metalness: 0.9 }),
  robotArm:  new THREE.MeshStandardMaterial({ color: 0xf0883e, roughness: 0.3, metalness: 0.7 }),
};

function box3(w, h, d, mat, x=0, y=0, z=0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ─────────────────────────────────────────────
// TOLVA  (x=-9)
// ─────────────────────────────────────────────
const tolvaGroup = new THREE.Group();
tolvaGroup.position.set(-9, 0, 0);

// Soporte
const soporteTolva = box3(0.3, 4, 0.3, M.metalDark, -0.8, 2, 0.8);
tolvaGroup.add(soporteTolva);
const soporteTolva2 = box3(0.3, 4, 0.3, M.metalDark, 0.8, 2, 0.8);
tolvaGroup.add(soporteTolva2);
const soporteTolva3 = box3(0.3, 4, 0.3, M.metalDark, -0.8, 2, -0.8);
tolvaGroup.add(soporteTolva3);
const soporteTolva4 = box3(0.3, 4, 0.3, M.metalDark, 0.8, 2, -0.8);
tolvaGroup.add(soporteTolva4);

// Cuerpo trapezoidal (CylinderGeometry radiusTop > radiusBottom)
const tolvaGeo = new THREE.CylinderGeometry(1.8, 0.35, 3.5, 6);
const tolvaMat = M.metal.clone();
const tolvaMesh = new THREE.Mesh(tolvaGeo, tolvaMat);
tolvaMesh.position.set(0, 5.75, 0);
tolvaMesh.castShadow = true;
tolvaGroup.add(tolvaMesh);

// Tapa
const tapaTolva = box3(3.6, 0.15, 3.6, M.metalDark, 0, 7.55, 0);
tolvaGroup.add(tapaTolva);

// Compuerta (pivota en la base)
const compuertaGeo = new THREE.BoxGeometry(0.5, 0.15, 0.7);
const compuertaMat = M.orange.clone();
const compuerta = new THREE.Mesh(compuertaGeo, compuertaMat);
compuerta.position.set(0, 4.05, 0);
tolvaGroup.add(compuerta);

// Material del nivel de polvo (indicador visual: tolvaMat color)
export const tolvaLevelMat = tolvaMat;

scene.add(tolvaGroup);

// ─────────────────────────────────────────────
// ENVASADORA FLOWPACK  (x=-4)
// ─────────────────────────────────────────────
const flowpackGroup = new THREE.Group();
flowpackGroup.position.set(-3.5, 0, 0);

// Cuerpo principal
const fpBody = box3(3, 3, 2.5, M.metalDark, 0, 1.5, 0);
tolvaGroup; // just ref
scene.add(flowpackGroup);

const fpBodyMesh = box3(3.2, 3, 2.5, M.metalDark, 0, 1.5, 0);
flowpackGroup.add(fpBodyMesh);

// Panel frontal (vidrio translúcido)
const fpGlassMat = new THREE.MeshStandardMaterial({
  color: 0x88aacc, roughness: 0.1, metalness: 0.1,
  transparent: true, opacity: 0.3
});
const fpGlass = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.0, 0.05), fpGlassMat);
fpGlass.position.set(0, 1.5, 1.27);
flowpackGroup.add(fpGlass);

// Rodillos
for (let i = -1; i <= 1; i++) {
  const rodGeo = new THREE.CylinderGeometry(0.18, 0.18, 2.5, 12);
  const rod = new THREE.Mesh(rodGeo, M.metal);
  rod.rotation.x = Math.PI / 2;
  rod.position.set(i * 1.1, 3.1, 0);
  rod.castShadow = true;
  flowpackGroup.add(rod);
}

// LED estado flowpack
const fpLedGeo = new THREE.SphereGeometry(0.12, 8, 8);
const fpLedMat = new THREE.MeshStandardMaterial({ color: 0x3fb950, emissive: 0x3fb950, emissiveIntensity: 0.8 });
const fpLed = new THREE.Mesh(fpLedGeo, fpLedMat);
fpLed.position.set(1.4, 2.8, 1.3);
flowpackGroup.add(fpLed);

// Salida (rampa hacia cinta)
const rampaMesh = box3(0.5, 0.1, 1.0, M.metal, 1.8, 1.0, 0);
rampaMesh.rotation.z = -0.25;
flowpackGroup.add(rampaMesh);

// Bolsitas producidas (pool reutilizable)
const BAGS_POOL = 6;
const bagsOnBelt = [];
for (let i = 0; i < BAGS_POOL; i++) {
  const bagGeo = new THREE.BoxGeometry(0.5, 0.18, 0.4);
  const bag = new THREE.Mesh(bagGeo, M.bag);
  bag.castShadow = true;
  bag.visible = false;
  bag.userData = { active: false, progress: 0 };
  scene.add(bag);
  bagsOnBelt.push(bag);
}

// ─────────────────────────────────────────────
// CINTA TRANSPORTADORA  (x= -0.5 .. 6.5)
// ─────────────────────────────────────────────
const cintaGroup = new THREE.Group();
cintaGroup.position.set(2, 0, 0);

// Base lateral izq
const cLat1 = box3(8, 0.3, 0.1, M.metalDark, 0, 0.85, 1.0);
cintaGroup.add(cLat1);
const cLat2 = box3(8, 0.3, 0.1, M.metalDark, 0, 0.85, -1.0);
cintaGroup.add(cLat2);

// Banda
const beltGeo = new THREE.BoxGeometry(8, 0.08, 1.8);
const beltMesh = new THREE.Mesh(beltGeo, M.belt);
beltMesh.position.set(0, 0.74, 0);
beltMesh.receiveShadow = true;
cintaGroup.add(beltMesh);

// Patas
for (let x of [-3.5, 0, 3.5]) {
  const leg = box3(0.2, 0.7, 0.2, M.metalDark, x, 0.35, 0.7);
  cintaGroup.add(leg);
  const leg2 = box3(0.2, 0.7, 0.2, M.metalDark, x, 0.35, -0.7);
  cintaGroup.add(leg2);
}

// Rodillos extremos
const rEnd1 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.8, 10), M.metal);
rEnd1.rotation.x = Math.PI / 2; rEnd1.position.set(-4, 0.78, 0);
cintaGroup.add(rEnd1);
const rEnd2 = rEnd1.clone(); rEnd2.position.set(4, 0.78, 0);
cintaGroup.add(rEnd2);

scene.add(cintaGroup);

// ─────────────────────────────────────────────
// BRAZO ROBOT  (x=8)
// ─────────────────────────────────────────────
const robotGroup = new THREE.Group();
robotGroup.position.set(8.5, 0, 0);

// Base giratoria
const rBase = box3(1.4, 0.5, 1.4, M.robot, 0, 0.25, 0);
robotGroup.add(rBase);

// Columna
const rCol = box3(0.5, 1.2, 0.5, M.robot, 0, 1.1, 0);
robotGroup.add(rCol);

// Hombro pivot group
const shoulderPivot = new THREE.Group();
shoulderPivot.position.set(0, 1.7, 0);
robotGroup.add(shoulderPivot);

// Brazo 1
const arm1 = box3(0.3, 2.0, 0.3, M.robotArm, 0, 1.0, 0);
shoulderPivot.add(arm1);

// Codo pivot group
const elbowPivot = new THREE.Group();
elbowPivot.position.set(0, 2.0, 0);
shoulderPivot.add(elbowPivot);

// Brazo 2
const arm2 = box3(0.22, 1.6, 0.22, M.robot, 0, 0.8, 0);
elbowPivot.add(arm2);

// Garra
const wristPivot = new THREE.Group();
wristPivot.position.set(0, 1.6, 0);
elbowPivot.add(wristPivot);

const garraL = box3(0.12, 0.4, 0.08, M.robotArm, -0.15, -0.2, 0);
const garraR = garraL.clone();
garraR.position.x = 0.15;
wristPivot.add(garraL, garraR);

// LED garra
const garraLedMat = new THREE.MeshStandardMaterial({ color: 0x3fb950, emissive: 0x3fb950, emissiveIntensity: 1 });
const garraLed = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), garraLedMat);
garraLed.position.set(0, -0.4, 0);
wristPivot.add(garraLed);

scene.add(robotGroup);

// ─────────────────────────────────────────────
// CAJAS DE EMBALAJE  (x=11)
// ─────────────────────────────────────────────
const BOLSITAS_POR_CAJA = 6;
const boxGroup = new THREE.Group();
boxGroup.position.set(11.5, 0, 0);

// Caja activa
const activeBoxMat = M.box.clone();
const activeBox = box3(1.6, 1.2, 1.6, activeBoxMat, 0, 0.6, 0);
boxGroup.add(activeBox);

// Tapa
const lidMesh = box3(1.7, 0.1, 1.7, M.metalDark, 0, 1.25, 0);
boxGroup.add(lidMesh);

// Pila de cajas completadas (visual)
const stackBoxes = [];
for (let i = 0; i < 5; i++) {
  const sb = box3(1.6, 1.1, 1.6, M.box, 0, 0.55, 0);
  sb.position.x = -2.2 - i * 0.15;
  sb.position.y = 0.55 + i * 0.05;
  sb.visible = false;
  boxGroup.add(sb);
  stackBoxes.push(sb);
}

scene.add(boxGroup);

// ─────────────────────────────────────────────
// TUBO CONECTOR TOLVA → FLOWPACK
// ─────────────────────────────────────────────
const tubeGeo = new THREE.CylinderGeometry(0.22, 0.22, 2.0, 8);
const tubeMesh = new THREE.Mesh(tubeGeo, M.metal);
tubeMesh.position.set(-6.5, 3.0, 0);
tubeMesh.rotation.z = Math.PI / 5;
scene.add(tubeMesh);

// ─────────────────────────────────────────────
// ETIQUETAS 3D (sprites de texto)
// ─────────────────────────────────────────────
function makeLabel(text, x, y, z) {
  const canvas2 = document.createElement('canvas');
  canvas2.width = 256; canvas2.height = 64;
  const ctx = canvas2.getContext('2d');
  ctx.fillStyle = 'rgba(13,17,23,0.8)';
  ctx.roundRect(4, 4, 248, 56, 8);
  ctx.fill();
  ctx.fillStyle = '#f0883e';
  ctx.font = 'bold 20px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas2);
  const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(2, 0.5, 1);
  sprite.position.set(x, y, z);
  scene.add(sprite);
}

makeLabel('TOLVA', -9, 9, 0);
makeLabel('FLOWPACK', -3.5, 4.5, 0);
makeLabel('CINTA', 2, 2.5, 0);
makeLabel('ROBOT', 8.5, 5.5, 0);
makeLabel('CAJAS', 11.5, 2.5, 0);

// ─────────────────────────────────────────────
// ANIMACIÓN DEL ROBOT
// ─────────────────────────────────────────────
// Fases: 0=idle, 1=baja_pick, 2=cierra_garra, 3=sube, 4=gira, 5=baja_drop, 6=abre_garra, 7=regresa
const robotAnim = {
  phase: 0,
  t: 0,
  duration: [0, 0.5, 0.2, 0.5, 0.6, 0.5, 0.2, 0.6],  // segundos por fase
  shoulderTargets: [0, -0.4, -0.4, 0.3, 0.3, -0.2, -0.2, 0],   // rad
  elbowTargets:    [0.2, 0.6, 0.6, -0.2, -0.2, 0.5, 0.5, 0.2],
  baseTarget: 0,
  currentBase: 0,
  hasBag: false,
  carriedBag: null,
};

// ─────────────────────────────────────────────
// BOLSITAS EN CINTA (sistema de partículas simple)
// ─────────────────────────────────────────────
// Las bolsitas van de x=-0.5+2=1.5 (inicio cinta) a x=4+2=6 (fin cinta) en world space
const BELT_START_X = -1.5;   // en world space (cintaGroup.pos + offset)
const BELT_END_X   = 6.0;
const BELT_Y       = 0.82;
const BELT_Z       = 0.0;

// ─────────────────────────────────────────────
// DOME PANEL — actualizar UI
// ─────────────────────────────────────────────
function updatePanel() {
  const s = plantState;

  // LEDs etapas
  setLed('tolva',    s.alarm ? 'red'   : (s.running ? 'green' : 'yellow'));
  setLed('flowpack', s.running ? 'green' : 'yellow');
  setLed('cinta',    s.running ? 'green' : 'yellow');
  setLed('robot',    s.emergency ? 'red' : (s.running ? 'green' : 'yellow'));

  setStatus('tolva',    s.alarm ? 'Alarma nivel' : (s.running ? 'OK' : 'En espera'));
  setStatus('flowpack', s.running ? 'Sellando' : 'En espera');
  setStatus('cinta',    s.running ? 'Corriendo' : 'En espera');
  setStatus('robot',    s.emergency ? '⚠ Detenido' : (s.running ? 'Activo' : 'En espera'));

  // Contadores
  document.getElementById('cnt-bolsitas').textContent = s.bolsitas;
  document.getElementById('cnt-cajas').textContent    = s.cajas;
  document.getElementById('cnt-throughput').textContent = throughputHistory[throughputHistory.length - 1] || 0;

  // Nivel tolva
  const pct = Math.round(s.nivel * 100);
  const fill = document.getElementById('level-bar-fill');
  fill.style.width = pct + '%';
  fill.style.background = pct > 40 ? 'var(--green)' : pct > 20 ? 'var(--yellow)' : 'var(--red)';
  document.getElementById('level-pct').textContent = pct + '%';

  // Alarma
  const banner = document.getElementById('alarm-banner');
  if (s.alarm) banner.classList.remove('hidden');
  else banner.classList.add('hidden');
}

function setLed(id, cls) {
  const el = document.getElementById('led-' + id);
  el.className = 'stage-led ' + cls;
}
function setStatus(id, txt) {
  document.getElementById('status-' + id).textContent = txt;
}

// ─────────────────────────────────────────────
// LOG DE EVENTOS
// ─────────────────────────────────────────────
export function logEvent(msg, type = 'info') {
  const log = document.getElementById('event-log');
  const now = new Date();
  const ts = now.toTimeString().slice(0, 8);
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="log-time">${ts}</span> <span class="log-${type}">${msg}</span>`;
  log.prepend(div);
  // máx 50 líneas
  while (log.children.length > 50) log.removeChild(log.lastChild);
}

// ─────────────────────────────────────────────
// SPARKLINE
// ─────────────────────────────────────────────
function drawSparkline() {
  const canvas2 = document.getElementById('sparkline');
  const ctx = canvas2.getContext('2d');
  const w = canvas2.width, h = canvas2.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#1c2230';
  ctx.fillRect(0, 0, w, h);

  const maxVal = Math.max(...throughputHistory, 1);
  ctx.strokeStyle = '#f0883e';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  throughputHistory.forEach((v, i) => {
    const x = (i / (throughputHistory.length - 1)) * w;
    const y = h - (v / maxVal) * (h - 4) - 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}

// ─────────────────────────────────────────────
// CONTROLES DE PANEL
// ─────────────────────────────────────────────
window.toggleLine = function () {
  if (plantState.emergency) return;
  plantState.running = !plantState.running;
  const btn = document.getElementById('btn-start');
  if (plantState.running) {
    btn.textContent = '⏸ DETENER LÍNEA';
    btn.classList.add('running');
    logEvent('Línea iniciada', 'ok');
  } else {
    btn.textContent = '▶ INICIAR LÍNEA';
    btn.classList.remove('running');
    logEvent('Línea detenida', 'info');
  }
  updatePanel();
};

window.setMode = function (mode) {
  plantState.mode = mode;
  document.getElementById('btn-manual').classList.toggle('active', mode === 'manual');
  document.getElementById('btn-auto').classList.toggle('active', mode === 'auto');
  logEvent('Modo cambiado a: ' + mode.toUpperCase(), 'info');
};

window.triggerEmergency = function () {
  plantState.running  = false;
  plantState.emergency = true;
  plantState.alarm    = true;
  document.getElementById('btn-start').textContent = '▶ INICIAR LÍNEA';
  document.getElementById('btn-start').classList.remove('running');
  logEvent('⚠ PARADA DE EMERGENCIA', 'alarm');
  playAlarm();
  updatePanel();
};

window.resetAlarm = function () {
  plantState.alarm     = false;
  plantState.emergency = false;
  logEvent('Alarma reseteada', 'ok');
  updatePanel();
};

// Exponer para ws-client.js
window.plantState = plantState;
window.updatePanel = updatePanel;
window.logEvent   = logEvent;

// ─────────────────────────────────────────────
// AUDIO — Web Audio API (sin archivos externos)
// ─────────────────────────────────────────────
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playAlarm() {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'square';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.setValueAtTime(440, ctx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.4);
}

function playBeep(freq = 1200, dur = 0.05) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + dur);
}

// ─────────────────────────────────────────────
// GAME LOOP
// ─────────────────────────────────────────────
let lastTime = 0;
const CYCLE_FLOWPACK = 3.0;  // segundos por bolsita
const CYCLE_CINTA    = 2.0;  // tiempo en cinta
const CYCLE_ROBOT    = 3.0;  // ciclo completo robot

function animate(timestamp) {
  requestAnimationFrame(animate);

  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);  // delta en segundos, capped
  lastTime = timestamp;

  const s = plantState;

  if (s.running && !s.emergency) {
    // ── Consumir nivel tolva ──
    s.nivel = Math.max(0, s.nivel - dt * 0.006 * s.speed);
    if (s.nivel < 0.15 && !s.alarm) {
      s.alarm = true;
      logEvent('⚠ Alarma: nivel bajo en tolva', 'alarm');
      playAlarm();
      if (s.mode === 'auto') { /* en auto se detiene automáticamente */ s.running = false; }
    }

    // ── Flowpack: genera bolsitas ──
    s._flowpackTimer += dt * s.speed;
    if (s._flowpackTimer >= CYCLE_FLOWPACK) {
      s._flowpackTimer = 0;
      spawnBag();
    }

    // ── Mover bolsitas en cinta ──
    moveBags(dt);

    // ── Throughput ──
    _minTimer += dt;
    _bolitasLastMin = s.bolsitas; // aproximación simple
    if (_minTimer >= 10) {
      _minTimer = 0;
      const tph = Math.round((60 / CYCLE_FLOWPACK) * s.speed);
      throughputHistory.push(tph);
      if (throughputHistory.length > 26) throughputHistory.shift();
      drawSparkline();
    }

    // ── Robot ──
    animateRobot(dt);

    // ── Rodillos flowpack giran ──
    flowpackGroup.children.forEach(c => {
      if (c.geometry && c.geometry.type === 'CylinderGeometry') {
        c.rotation.y += dt * 2 * s.speed;
      }
    });

    // ── Compuerta tolva ──
    const targetRot = s.running ? 0.7 : 0;
    compuerta.rotation.z += (targetRot - compuerta.rotation.z) * dt * 3;

    // ── Tolva color nivel ──
    const pct = s.nivel;
    if (pct > 0.4) tolvaLevelMat.color.setHex(0x4a5568);
    else if (pct > 0.2) tolvaLevelMat.color.setHex(0xd29922);
    else tolvaLevelMat.color.setHex(0xf85149);
  }

  controls.update();
  updatePanel();
  renderer.render(scene, camera);
}

// ─────────────────────────────────────────────
// BOLSITAS
// ─────────────────────────────────────────────
function spawnBag() {
  const bag = bagsOnBelt.find(b => !b.userData.active);
  if (!bag) return;
  bag.userData.active = true;
  bag.userData.progress = 0;  // 0..1 a lo largo de la cinta
  bag.visible = true;
  // Posición inicial: salida flowpack
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
    const x = BELT_START_X + p * (BELT_END_X - BELT_START_X);
    bag.position.set(x, BELT_Y, BELT_Z);

    if (p >= 1.0) {
      // Llegó al fin de la cinta → espera que el robot la tome
      bag.position.set(BELT_END_X, BELT_Y, BELT_Z);
      bag.userData.readyForPick = true;
      if (!robotAnim.hasBag && robotAnim.phase === 0) {
        robotAnim.phase = 1;
        robotAnim.t = 0;
        robotAnim.carriedBag = bag;
      }
    }
  });
}

// ─────────────────────────────────────────────
// ROBOT ANIMACIÓN
// ─────────────────────────────────────────────
function animateRobot(dt) {
  const ra = robotAnim;
  if (ra.phase === 0) return;  // idle

  ra.t += dt * plantState.speed;
  const phaseDur = ra.duration[ra.phase];
  const phaseT = Math.min(ra.t / phaseDur, 1.0);
  const ease = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;  // easeInOut

  const sp = lerp(ra.shoulderTargets[ra.phase - 1] ?? 0, ra.shoulderTargets[ra.phase], ease(phaseT));
  const ep = lerp(ra.elbowTargets[ra.phase - 1] ?? 0.2, ra.elbowTargets[ra.phase], ease(phaseT));

  shoulderPivot.rotation.x = sp;
  elbowPivot.rotation.x = ep;

  // Rotación base en fase gira (4) y regresa (7)
  if (ra.phase === 4) {
    robotGroup.rotation.y = lerp(0, -Math.PI * 0.6, ease(phaseT));
  } else if (ra.phase === 7) {
    robotGroup.rotation.y = lerp(-Math.PI * 0.6, 0, ease(phaseT));
  }

  // Bolsita sigue la garra cuando está siendo llevada
  if (ra.hasBag && ra.carriedBag) {
    const wristWorld = new THREE.Vector3();
    wristPivot.getWorldPosition(wristWorld);
    ra.carriedBag.position.copy(wristWorld);
  }

  if (ra.t >= phaseDur) {
    ra.t = 0;

    if (ra.phase === 2) {
      // Cierra garra → toma la bolsita
      ra.hasBag = true;
      garraL.position.x = -0.08;
      garraR.position.x = 0.08;
      if (ra.carriedBag) ra.carriedBag.userData.active = false; // ya no está en cinta
    }

    if (ra.phase === 6) {
      // Abre garra → suelta en la caja
      ra.hasBag = false;
      garraL.position.x = -0.15;
      garraR.position.x = 0.15;
      if (ra.carriedBag) {
        ra.carriedBag.visible = false;
        ra.carriedBag.userData.readyForPick = false;
        ra.carriedBag = null;
      }
      plantState._bolsitasEnCaja++;
      if (plantState._bolsitasEnCaja >= BOLSITAS_POR_CAJA) {
        completarCaja();
      }
    }

    ra.phase++;
    if (ra.phase >= ra.duration.length) ra.phase = 0;
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ─────────────────────────────────────────────
// COMPLETAR CAJA
// ─────────────────────────────────────────────
function completarCaja() {
  plantState._bolsitasEnCaja = 0;
  plantState.cajas++;
  playBeep(800, 0.15);
  playBeep(1000, 0.1);
  logEvent(`📦 Caja #${plantState.cajas} completada (${BOLSITAS_POR_CAJA} bolsitas)`, 'ok');

  // Animar tapa bajando
  lidMesh.position.y = 1.25;
  // Mover caja a la pila (visual simple)
  const idx = Math.min(plantState.cajas - 1, stackBoxes.length - 1);
  if (idx >= 0 && idx < stackBoxes.length) {
    stackBoxes[idx].visible = true;
  }

  // Resetear nivel tolva en auto (se "recarga")
  if (plantState.mode === 'auto' && plantState.nivel < 0.3) {
    plantState.nivel = 1.0;
    plantState.alarm = false;
    logEvent('Tolva recargada (modo auto)', 'ok');
    plantState.running = true;
    document.getElementById('btn-start').textContent = '⏸ DETENER LÍNEA';
    document.getElementById('btn-start').classList.add('running');
  }
}

// ─────────────────────────────────────────────
// RESIZE
// ─────────────────────────────────────────────
function onResize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// ─────────────────────────────────────────────
// ARRANQUE
// ─────────────────────────────────────────────
logEvent('Sistema iniciado. Esperando comando.', 'info');
updatePanel();
drawSparkline();
requestAnimationFrame(animate);
