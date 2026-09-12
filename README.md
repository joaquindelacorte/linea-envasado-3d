# Línea de Envasado 3D — ExpoEducativa Tecnicatura UNaP

Simulador web 3D de una línea de envasado de polvos en flowpack, controlable en tiempo real desde un ESP32 físico.

```
[TOLVA] → [FLOWPACK] → [CINTA] → [BRAZO ROBOT] → [CAJAS]
```

## Arquitectura

```
[ESP32] → MQTT/TLS → [HiveMQ Cloud] → [Node.js server.js] → [WebSocket] → [Browser 3D]
   ↑__________________________________________________________________|
                     (feedback de estado cada 500ms)
```

## Archivos

```
linea-envasado-3d/
├── index.html          ← app principal (Three.js + panel)
├── style.css           ← estilos panel (tema dark industrial)
├── main.js             ← escena 3D + animaciones + lógica
├── ws-client.js        ← cliente WebSocket
├── server/
│   ├── server.js       ← Node.js + Express + ws + MQTT bridge
│   ├── package.json
│   └── .env            ← credenciales HiveMQ (no commitear)
├── esp32/
│   └── linea_envasado.ino
└── README.md
```

---

## Setup — Servidor Node.js

### 1. Instalar dependencias

```bash
cd server
npm install
```

### 2. Configurar credenciales HiveMQ

```bash
cp .env.example .env
# Editar .env con tu host, usuario y contraseña de HiveMQ Cloud
```

El `.env` tiene este formato:
```
HIVEMQ_HOST=tu-cluster.s1.eu.hivemq.cloud
HIVEMQ_PORT=8883
HIVEMQ_USER=tu_usuario
HIVEMQ_PASSWORD=tu_contraseña
```

### 3. Correr el servidor

```bash
node server.js
# o con auto-reload:
node --watch server.js
```

### 4. Abrir la app

Ir a **http://localhost:3000** en el browser.

> **Nota:** Sin el servidor, la app igualmente funciona completa en modo standalone. El WebSocket simplemente se reintenta en background.

---

## Setup — ESP32

### Librerías Arduino (instalar desde Library Manager)

| Librería | Autor |
|---|---|
| PubSubClient | Nick O'Leary |
| ArduinoJson | Benoit Blanchon |
| WiFiClientSecure | built-in ESP32 |

### Configurar credenciales en el .ino

Abrir `esp32/linea_envasado.ino` y editar las primeras líneas:

```cpp
const char* WIFI_SSID     = "TU_WIFI_SSID";
const char* WIFI_PASSWORD = "TU_WIFI_PASSWORD";
const char* MQTT_HOST     = "tu-cluster.s1.eu.hivemq.cloud";
const char* MQTT_USER     = "TU_USUARIO";
const char* MQTT_PASSWORD = "TU_CONTRASEÑA";
```

### Flashear

1. Conectar ESP32 por USB
2. Abrir `linea_envasado.ino` en Arduino IDE
3. Seleccionar Board: **ESP32 Dev Module**
4. Seleccionar el puerto COM correcto
5. Subir (Upload)

---

## Esquema eléctrico

```
ESP32 Pin  │ Componente           │ Conexión
───────────┼──────────────────────┼─────────────────────────────
D2         │ Botón 1 (Start/Stop) │ D2 ─── botón ─── GND  (pull-up interno)
D3         │ Botón 2 (Reset)      │ D3 ─── botón ─── GND
D4         │ Botón 3 (Emergencia) │ D4 ─── botón ─── GND
D5         │ Switch Manual/Auto   │ D5 ─── switch ── GND
D34        │ Potenciómetro        │ D34 ←─ cursor pot (extremos: 3.3V y GND)
D18        │ LED verde            │ D18 ─[220Ω]─ LED ─── GND
D19        │ LED rojo             │ D19 ─[220Ω]─ LED ─── GND
```

---

## Tópicos MQTT

| Tópico | Dirección | Payload |
|---|---|---|
| `planta/cmd/start_stop` | ESP32 → Server | `"1"` / `"0"` |
| `planta/cmd/reset_alarm` | ESP32 → Server | `"1"` |
| `planta/cmd/emergency` | ESP32 → Server | `"1"` |
| `planta/cmd/mode` | ESP32 → Server | `"manual"` / `"auto"` |
| `planta/cmd/speed` | ESP32 → Server | `"0"` a `"100"` |
| `planta/state` | Server → ESP32 | JSON con estado completo |

---

## Cómo correrlo en la expo

1. Conectar la notebook a la red WiFi de la expo (o crear hotspot)
2. Correr `node server.js` en la notebook
3. Abrir `http://localhost:3000` en el browser (pantalla grande)
4. Enchufar el ESP32 (ya flasheado y configurado con el WiFi de la expo)
5. En la pantalla del ESP32 (Serial Monitor) se ve si conectó bien
6. Los botones físicos controlan la planta 3D en tiempo real

> **Tip para expo sin internet:** El server y el browser corren local. HiveMQ Cloud necesita internet solo para la comunicación con el ESP32. Si hay internet cortado, la app funciona igual desde los botones del panel web.

---

## Valores de ciclo (configurables en main.js)

| Parámetro | Valor default |
|---|---|
| Bolsitas por caja | 6 |
| Tiempo de flowpack | 3 s/bolsita |
| Tiempo en cinta | 2 s |
| Ciclo robot pick&place | ~3 s |
| Tiempo por caja completa | ~18-20 s |
