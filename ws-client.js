/**
 * ws-client.js — Cliente WebSocket
 * Se conecta al server Node.js en ws://localhost:3001
 * Recibe comandos del ESP32 (vía MQTT bridge) y actualiza plantState
 */

const WS_URL = 'ws://localhost:3001';
let ws = null;
let reconnectTimer = null;

function connect() {
  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[WS] Conectado al server');
      window.logEvent && window.logEvent('WebSocket conectado al servidor', 'ok');
      clearTimeout(reconnectTimer);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (e) {
        console.error('[WS] Error parseando mensaje:', e);
      }
    };

    ws.onclose = () => {
      console.warn('[WS] Desconectado. Reintentando en 3s...');
      window.logEvent && window.logEvent('WebSocket desconectado — reintentando...', 'alarm');
      reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      // No logear si es el error de conexión inicial (servidor no levantado)
      console.warn('[WS] Error de conexión — ¿el server está corriendo?');
    };

  } catch (e) {
    console.warn('[WS] No se pudo conectar:', e.message);
    reconnectTimer = setTimeout(connect, 3000);
  }
}

/**
 * Maneja mensajes entrantes del server (originados en ESP32 vía MQTT)
 * Formato esperado: { type: 'cmd', topic: 'planta/cmd/...', payload: '...' }
 *   o: { type: 'state', ...estado completo }
 */
function handleServerMessage(msg) {
  const s = window.plantState;
  if (!s) return;

  if (msg.type === 'cmd') {
    switch (msg.topic) {
      case 'planta/cmd/start_stop':
        if (msg.payload === '1' && !s.running) window.toggleLine();
        else if (msg.payload === '0' && s.running) window.toggleLine();
        break;

      case 'planta/cmd/reset_alarm':
        if (msg.payload === '1') window.resetAlarm();
        break;

      case 'planta/cmd/emergency':
        if (msg.payload === '1') window.triggerEmergency();
        break;

      case 'planta/cmd/mode':
        window.setMode(msg.payload); // 'manual' | 'auto'
        break;

      case 'planta/cmd/speed':
        // 0..100 → 0.3..2.0
        const raw = parseFloat(msg.payload);
        s.speed = 0.3 + (raw / 100) * 1.7;
        window.logEvent && window.logEvent(`Velocidad ajustada: ${Math.round(raw)}%`, 'info');
        break;
    }

    window.updatePanel && window.updatePanel();
  }
}

/**
 * Envía estado actual de la planta al server (para que lo reenvíe al ESP32)
 */
export function sendState() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const s = window.plantState;
  const payload = JSON.stringify({
    type: 'state',
    running: s.running,
    mode: s.mode,
    alarm: s.alarm,
    bolsitas: s.bolsitas,
    cajas: s.cajas,
  });
  ws.send(payload);
}

// Enviar estado cada 500ms
setInterval(sendState, 500);

// Iniciar conexión (falla silenciosamente si no hay server)
connect();
