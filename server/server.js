/**
 * server.js — Línea de Envasado 3D
 * Node.js + Express (sirve archivos estáticos) + WebSocket + MQTT HiveMQ bridge
 *
 * Variables de entorno requeridas en .env:
 *   HIVEMQ_HOST      = xxxxx.s1.eu.hivemq.cloud
 *   HIVEMQ_PORT      = 8883
 *   HIVEMQ_USER      = tu_usuario
 *   HIVEMQ_PASSWORD  = tu_contraseña
 */

require('dotenv').config();
const express = require('express');
const path    = require('path');
const http    = require('http');
const { WebSocketServer } = require('ws');
const mqtt    = require('mqtt');

// ─────────────────────────────────────────────
// HTTP + STATIC FILES
// ─────────────────────────────────────────────
const app = express();
const PORT_HTTP = process.env.PORT || 3000;

// Servir el directorio padre (donde están index.html, main.js, etc.)
app.use(express.static(path.join(__dirname, '..')));

const httpServer = http.createServer(app);

// ─────────────────────────────────────────────
// WEBSOCKET SERVER
// ─────────────────────────────────────────────
const PORT_WS = 3001;
const wsHttpServer = http.createServer();
const wss = new WebSocketServer({ server: wsHttpServer });

const wsClients = new Set();

wss.on('connection', (socket) => {
  wsClients.add(socket);
  console.log(`[WS] Cliente conectado. Total: ${wsClients.size}`);

  // Enviar estado actual al cliente nuevo
  socket.send(JSON.stringify({ type: 'state', ...plantState }));

  socket.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      // Browser → Server → ESP32 (feedback de estado)
      if (msg.type === 'state') {
        Object.assign(plantState, msg);
        // Publicar estado en MQTT para que el ESP32 actualice sus LEDs
        publishState();
      }
    } catch (e) {
      console.error('[WS] Error parseando mensaje del browser:', e.message);
    }
  });

  socket.on('close', () => {
    wsClients.delete(socket);
    console.log(`[WS] Cliente desconectado. Total: ${wsClients.size}`);
  });
});

function broadcast(msg) {
  const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
  wsClients.forEach(c => {
    if (c.readyState === 1 /* OPEN */) c.send(data);
  });
}

wsHttpServer.listen(PORT_WS, () => {
  console.log(`[WS] WebSocket server escuchando en ws://localhost:${PORT_WS}`);
});

// ─────────────────────────────────────────────
// ESTADO INTERNO DE LA PLANTA
// ─────────────────────────────────────────────
const plantState = {
  running:  false,
  mode:     'manual',
  alarm:    false,
  bolsitas: 0,
  cajas:    0,
};

// ─────────────────────────────────────────────
// MQTT — HiveMQ Cloud
// ─────────────────────────────────────────────
const MQTT_HOST     = process.env.HIVEMQ_HOST;
const MQTT_PORT     = parseInt(process.env.HIVEMQ_PORT || '8883');
const MQTT_USER     = process.env.HIVEMQ_USER;
const MQTT_PASSWORD = process.env.HIVEMQ_PASSWORD;

// Tópicos que escucha desde el ESP32
const SUBSCRIBE_TOPICS = [
  'planta/cmd/start_stop',
  'planta/cmd/reset_alarm',
  'planta/cmd/emergency',
  'planta/cmd/mode',
  'planta/cmd/speed',
];

let mqttClient = null;

function connectMQTT() {
  if (!MQTT_HOST || !MQTT_USER || !MQTT_PASSWORD) {
    console.warn('[MQTT] ⚠ Credenciales HiveMQ no configuradas. Editá server/.env');
    console.warn('[MQTT]   El servidor funciona igual — solo sin ESP32.');
    return;
  }

  const brokerUrl = `mqtts://${MQTT_HOST}:${MQTT_PORT}`;
  console.log(`[MQTT] Conectando a ${brokerUrl}...`);

  mqttClient = mqtt.connect(brokerUrl, {
    username:          MQTT_USER,
    password:          MQTT_PASSWORD,
    rejectUnauthorized: true,
    clientId:          'linea-envasado-server-' + Math.random().toString(16).slice(2, 8),
    reconnectPeriod:   5000,
    connectTimeout:    10000,
  });

  mqttClient.on('connect', () => {
    console.log('[MQTT] ✓ Conectado a HiveMQ');
    SUBSCRIBE_TOPICS.forEach(t => mqttClient.subscribe(t, (err) => {
      if (err) console.error(`[MQTT] Error suscribiendo ${t}:`, err.message);
      else console.log(`[MQTT] Suscripto a: ${t}`);
    }));
  });

  mqttClient.on('message', (topic, payloadBuf) => {
    const payload = payloadBuf.toString();
    console.log(`[MQTT] ← ${topic}: ${payload}`);

    // Actualizar estado interno según el comando
    switch (topic) {
      case 'planta/cmd/start_stop':
        plantState.running = payload === '1';
        break;
      case 'planta/cmd/reset_alarm':
        if (payload === '1') plantState.alarm = false;
        break;
      case 'planta/cmd/emergency':
        if (payload === '1') { plantState.running = false; plantState.alarm = true; }
        break;
      case 'planta/cmd/mode':
        plantState.mode = payload;
        break;
    }

    // Reenviar a todos los browsers vía WebSocket
    broadcast({ type: 'cmd', topic, payload });
  });

  mqttClient.on('reconnect', () => console.log('[MQTT] Reconectando...'));
  mqttClient.on('error', (err) => console.error('[MQTT] Error:', err.message));
  mqttClient.on('offline', () => console.warn('[MQTT] Offline'));
}

function publishState() {
  if (!mqttClient || !mqttClient.connected) return;
  const payload = JSON.stringify(plantState);
  mqttClient.publish('planta/state', payload, { qos: 0 }, (err) => {
    if (err) console.error('[MQTT] Error publicando estado:', err.message);
  });
}

// Publicar estado periódicamente al ESP32
setInterval(publishState, 500);

// ─────────────────────────────────────────────
// ARRANQUE
// ─────────────────────────────────────────────
httpServer.listen(PORT_HTTP, () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  Línea de Envasado 3D — Servidor listo   ║`);
  console.log(`╠══════════════════════════════════════════╣`);
  console.log(`║  HTTP (app):  http://localhost:${PORT_HTTP}        ║`);
  console.log(`║  WebSocket:   ws://localhost:${PORT_WS}          ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);
});

connectMQTT();
