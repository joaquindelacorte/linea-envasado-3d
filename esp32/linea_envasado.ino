/**
 * linea_envasado.ino
 * ESP32 — Línea de Envasado 3D (ExpoEducativa Tecnicatura UNaP)
 *
 * Librerías requeridas (instalar desde Library Manager):
 *   - WiFiClientSecure (built-in ESP32)
 *   - PubSubClient by Nick O'Leary  ← buscar "PubSubClient"
 *   - ArduinoJson by Benoit Blanchon ← buscar "ArduinoJson"
 *
 * Conexiones:
 *   D2  → Botón 1 (Start/Stop) — GND por software pull-up
 *   D3  → Botón 2 (Reset alarma)
 *   D4  → Botón 3 (Emergencia)
 *   D5  → Switch (Manual/Auto)
 *   D34 → Potenciómetro (centro), extremos a 3.3V y GND
 *   D18 → LED verde (Línea corriendo) — resistencia 220Ω a GND
 *   D19 → LED rojo (Alarma activa)
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ─────────────────────────────────────────────
// CONFIGURACIÓN — Editar antes de flashear
// ─────────────────────────────────────────────
const char* WIFI_SSID     = "TU_WIFI_SSID";
const char* WIFI_PASSWORD = "TU_WIFI_PASSWORD";

const char* MQTT_HOST     = "TU_HOST.s1.eu.hivemq.cloud";
const int   MQTT_PORT     = 8883;
const char* MQTT_USER     = "TU_USUARIO";
const char* MQTT_PASSWORD = "TU_CONTRASEÑA";
const char* CLIENT_ID     = "esp32-linea-envasado";

// ─────────────────────────────────────────────
// PINES
// ─────────────────────────────────────────────
#define PIN_BTN_START    2
#define PIN_BTN_RESET    3
#define PIN_BTN_EMERG    4
#define PIN_SWITCH_MODE  5
#define PIN_POT          34
#define PIN_LED_GREEN    18
#define PIN_LED_RED      19

// ─────────────────────────────────────────────
// TÓPICOS MQTT
// ─────────────────────────────────────────────
#define TOPIC_START_STOP  "planta/cmd/start_stop"
#define TOPIC_RESET_ALARM "planta/cmd/reset_alarm"
#define TOPIC_EMERGENCY   "planta/cmd/emergency"
#define TOPIC_MODE        "planta/cmd/mode"
#define TOPIC_SPEED       "planta/cmd/speed"
#define TOPIC_STATE       "planta/state"

// ─────────────────────────────────────────────
// OBJETOS
// ─────────────────────────────────────────────
WiFiClientSecure wifiClient;
PubSubClient mqtt(wifiClient);

// ─────────────────────────────────────────────
// ESTADO INTERNO
// ─────────────────────────────────────────────
bool lineRunning = false;
bool modeAuto    = false;   // false = manual
bool alarmActive = false;

// Debounce
unsigned long lastDebounce[3] = {0, 0, 0};
bool lastBtnState[3] = {HIGH, HIGH, HIGH};
const unsigned long DEBOUNCE_MS = 50;

// Potenciómetro
int lastPotValue = -1;
unsigned long lastPotTime = 0;
const unsigned long POT_INTERVAL = 200;

// ─────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(200);

  // Pines
  pinMode(PIN_BTN_START,   INPUT_PULLUP);
  pinMode(PIN_BTN_RESET,   INPUT_PULLUP);
  pinMode(PIN_BTN_EMERG,   INPUT_PULLUP);
  pinMode(PIN_SWITCH_MODE, INPUT_PULLUP);
  pinMode(PIN_LED_GREEN,   OUTPUT);
  pinMode(PIN_LED_RED,     OUTPUT);

  // LEDs test al inicio
  digitalWrite(PIN_LED_GREEN, HIGH);
  digitalWrite(PIN_LED_RED,   HIGH);
  delay(300);
  digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_RED,   LOW);

  connectWifi();

  // TLS: saltar verificación de certificado (HiveMQ Cloud acepta esto)
  // Para producción real usar setCACert() con el cert del broker
  wifiClient.setInsecure();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setKeepAlive(30);
  mqtt.setBufferSize(512);

  Serial.println("[ESP32] Setup completo");
}

// ─────────────────────────────────────────────
// LOOP
// ─────────────────────────────────────────────
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
    return;
  }

  if (!mqtt.connected()) {
    connectMQTT();
  }
  mqtt.loop();

  readButtons();
  readPotentiometer();
  updateLEDs();
}

// ─────────────────────────────────────────────
// WIFI
// ─────────────────────────────────────────────
void connectWifi() {
  Serial.printf("[WiFi] Conectando a %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 30) {
    delay(500);
    Serial.print(".");
    retries++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Conectado! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WiFi] Error de conexión — reintentando en loop");
  }
}

// ─────────────────────────────────────────────
// MQTT CONNECT
// ─────────────────────────────────────────────
void connectMQTT() {
  Serial.printf("[MQTT] Conectando a %s:%d...\n", MQTT_HOST, MQTT_PORT);
  int retries = 0;
  while (!mqtt.connected() && retries < 5) {
    if (mqtt.connect(CLIENT_ID, MQTT_USER, MQTT_PASSWORD)) {
      Serial.println("[MQTT] Conectado!");
      mqtt.subscribe(TOPIC_STATE);
    } else {
      Serial.printf("[MQTT] Fallo (rc=%d). Reintentando en 3s...\n", mqtt.state());
      delay(3000);
      retries++;
    }
  }
}

// ─────────────────────────────────────────────
// CALLBACK MQTT — Recibe estado del servidor
// ─────────────────────────────────────────────
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  payload[length] = '\0';  // null-terminate
  String topicStr(topic);

  if (topicStr == TOPIC_STATE) {
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, (char*)payload);
    if (err) return;

    lineRunning = doc["running"] | false;
    alarmActive = doc["alarm"]   | false;

    Serial.printf("[MQTT] Estado: running=%d alarm=%d bolsitas=%d cajas=%d\n",
      (int)lineRunning, (int)alarmActive,
      (int)(doc["bolsitas"] | 0), (int)(doc["cajas"] | 0));
  }
}

// ─────────────────────────────────────────────
// LEER BOTONES (con debounce)
// ─────────────────────────────────────────────
void readButtons() {
  int pins[3] = { PIN_BTN_START, PIN_BTN_RESET, PIN_BTN_EMERG };

  for (int i = 0; i < 3; i++) {
    bool reading = digitalRead(pins[i]);

    if (reading != lastBtnState[i]) {
      lastDebounce[i] = millis();
    }

    if ((millis() - lastDebounce[i]) > DEBOUNCE_MS) {
      // Flanco descendente (botón presionado, pull-up → LOW)
      if (reading == LOW && lastBtnState[i] == HIGH) {
        onButtonPress(i);
      }
    }

    lastBtnState[i] = reading;
  }

  // Switch modo manual/auto
  bool autoMode = (digitalRead(PIN_SWITCH_MODE) == LOW);
  if (autoMode != modeAuto) {
    modeAuto = autoMode;
    mqtt.publish(TOPIC_MODE, modeAuto ? "auto" : "manual");
    Serial.printf("[BTN] Modo: %s\n", modeAuto ? "AUTO" : "MANUAL");
  }
}

void onButtonPress(int btnIndex) {
  switch (btnIndex) {
    case 0:  // Start/Stop
      mqtt.publish(TOPIC_START_STOP, lineRunning ? "0" : "1");
      Serial.printf("[BTN] Start/Stop → %s\n", lineRunning ? "STOP" : "START");
      break;
    case 1:  // Reset alarma
      mqtt.publish(TOPIC_RESET_ALARM, "1");
      Serial.println("[BTN] Reset alarma");
      break;
    case 2:  // Emergencia
      mqtt.publish(TOPIC_EMERGENCY, "1");
      Serial.println("[BTN] ¡EMERGENCIA!");
      break;
  }
}

// ─────────────────────────────────────────────
// POTENCIÓMETRO
// ─────────────────────────────────────────────
void readPotentiometer() {
  if (millis() - lastPotTime < POT_INTERVAL) return;
  lastPotTime = millis();

  int raw = analogRead(PIN_POT);              // 0..4095
  int pct = map(raw, 0, 4095, 0, 100);       // 0..100

  // Publicar solo si cambió >2% (filtrar ruido)
  if (abs(pct - lastPotValue) > 2) {
    char buf[4];
    snprintf(buf, sizeof(buf), "%d", pct);
    mqtt.publish(TOPIC_SPEED, buf);
    lastPotValue = pct;
    Serial.printf("[POT] Velocidad: %d%%\n", pct);
  }
}

// ─────────────────────────────────────────────
// LEDs
// ─────────────────────────────────────────────
void updateLEDs() {
  digitalWrite(PIN_LED_GREEN, lineRunning && !alarmActive ? HIGH : LOW);
  digitalWrite(PIN_LED_RED,   alarmActive ? HIGH : LOW);
}
