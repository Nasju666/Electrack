/*
  ElecTrack device firmware (ESP32 + PZEM-004T v3.0)

  What it does, forever:
    1. Reads voltage, current, power and the running kWh counter from each
       PZEM-004T meter (one per outlet).
    2. Sends them over Wi-Fi (HTTPS) to the ElecTrack server.
    3. Waits REPORT_EVERY_MS and repeats.

  It only MEASURES. Nothing in this firmware or hardware can switch an
  appliance on or off.

  Board:     "ESP32 Dev Module" (esp32 by Espressif Systems)
  Libraries: "PZEM004Tv30" by Jakub Mandula, "WiFiManager" by tzapu
  Settings:  config.h (copy config.example.h)

  Wiring (see firmware/README.md and HANDOFF.md for the full diagrams):
    PZEM TX --[1k]--+-- GPIO16 (RX2)      PZEM RX ---- GPIO17 (TX2)
                  [2k]
                    |
                   GND
    PZEM 5V and ESP32 VIN on the 5 V supply, grounds joined.

  First start: the device has no Wi-Fi details, so it creates its own hotspot
  called "ElecTrack-Setup-XXXX". Join it with a phone and pick the home Wi-Fi.
  To change Wi-Fi later, hold the BOOT button for 5 seconds.

  Status light (the blue LED on the board):
    slow blink ....... setup hotspot is open, waiting for Wi-Fi details
    fast blink ....... connecting to Wi-Fi
    steady on ........ last report was accepted by the server
    two quick blinks . last report failed (no internet, wrong secret, ...)
*/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WiFiManager.h>   // tzapu
#include <PZEM004Tv30.h>   // Jakub Mandula

#include "config.h"

#define FW_VERSION "0.1.0"

// Pins on the ESP32 DevKit V1
const int PIN_PZEM_RX = 16;   // ESP32 receives here  <- PZEM TX (through the divider)
const int PIN_PZEM_TX = 17;   // ESP32 transmits here -> PZEM RX
const int PIN_LED     = 2;    // on-board LED
const int PIN_BUTTON  = 0;    // BOOT button, pressed = LOW

const unsigned long RESTART_IF_SILENT_MS = 15UL * 60UL * 1000UL;  // no accepted report for 15 min -> restart

enum Light { LIGHT_SETUP, LIGHT_CONNECTING, LIGHT_OK, LIGHT_FAILED };

PZEM004Tv30* meters[OUTLET_COUNT];
WiFiManager wifiManager;
Light light = LIGHT_CONNECTING;
unsigned long lastReportAt = 0;
unsigned long lastSuccessAt = 0;
unsigned long buttonDownSince = 0;

#if FAKE_READINGS
float fakeKwh[OUTLET_COUNT];
#endif

struct Reading {
  bool ok;
  float watts, kwh, voltage, current;
};

// ---------------------------------------------------------------- status light
void showLight() {
  unsigned long t = millis();
  bool on = false;
  switch (light) {
    case LIGHT_SETUP:      on = (t % 2000) < 1000; break;                       // slow blink
    case LIGHT_CONNECTING: on = (t % 300) < 150; break;                         // fast blink
    case LIGHT_OK:         on = true; break;                                    // steady
    case LIGHT_FAILED:     on = (t % 2000) < 120 || ((t % 2000) > 250 && (t % 2000) < 370); break;  // two blinks
  }
  digitalWrite(PIN_LED, on ? HIGH : LOW);
}

// ------------------------------------------------------------------- Wi-Fi
String setupHotspotName() {
  uint32_t chip = (uint32_t)(ESP.getEfuseMac() >> 24);
  char name[32];
  snprintf(name, sizeof(name), "ElecTrack-Setup-%04X", (unsigned)(chip & 0xFFFF));
  return String(name);
}

void connectWifi() {
  light = LIGHT_CONNECTING;
  showLight();
  wifiManager.setConnectTimeout(30);        // seconds to try the saved network
  wifiManager.setConfigPortalTimeout(300);  // hotspot stays open 5 minutes, then we retry
  wifiManager.setAPCallback([](WiFiManager*) {
    light = LIGHT_SETUP;
    digitalWrite(PIN_LED, HIGH);
    Serial.println("Setup hotspot is open. Join it with a phone to choose the Wi-Fi.");
  });

  // Tries the saved Wi-Fi; if there is none (or it fails) opens the setup hotspot.
  if (!wifiManager.autoConnect(setupHotspotName().c_str())) {
    Serial.println("No Wi-Fi yet. Restarting to try again.");
    delay(1000);
    ESP.restart();
  }
  WiFi.setAutoReconnect(true);
  Serial.print("Wi-Fi connected, IP ");
  Serial.println(WiFi.localIP());
}

// Hold BOOT for 5 seconds to forget the Wi-Fi and reopen the setup hotspot.
void checkButton() {
  if (digitalRead(PIN_BUTTON) == LOW) {
    if (buttonDownSince == 0) buttonDownSince = millis();
    if (millis() - buttonDownSince > 5000) {
      Serial.println("BOOT held: forgetting Wi-Fi and restarting.");
      wifiManager.resetSettings();
      delay(500);
      ESP.restart();
    }
  } else {
    buttonDownSince = 0;
  }
}

// ------------------------------------------------------------------ readings
Reading readOutlet(int index) {
  Reading r;
#if FAKE_READINGS
  // Made-up but plausible numbers, so the whole chain can be tested with no meter.
  float base = (OUTLET_COUNT == 1) ? 850.0 : (index == 0 ? 55.0 : (index == 1 ? 90.0 : 25.0));
  r.watts = base + random(-30, 31) / 10.0;
  r.voltage = 229.0 + random(-15, 16) / 10.0;
  r.current = r.watts / (r.voltage * 0.9);
  fakeKwh[index] += r.watts * (REPORT_EVERY_MS / 1000.0) / 3600000.0;   // W x s -> kWh
  r.kwh = fakeKwh[index];
  r.ok = true;
#else
  r.voltage = meters[index]->voltage();
  r.current = meters[index]->current();
  r.watts   = meters[index]->power();
  r.kwh     = meters[index]->energy();   // the meter's own running counter; never reset it
  // The library returns NaN when the meter does not answer (unplugged, miswired, mains off).
  r.ok = !isnan(r.voltage) && !isnan(r.current) && !isnan(r.watts) && !isnan(r.kwh);
  if (r.ok && CT_TURNS > 1) {
    r.current /= CT_TURNS;
    r.watts   /= CT_TURNS;
    r.kwh     /= CT_TURNS;
  }
#endif
  return r;
}

// Builds the JSON the server expects. Returns how many outlets were readable.
int buildReport(String& body) {
  body = "{\"code\":\"" DEVICE_CODE "\",\"fw\":\"" FW_VERSION "\",\"readings\":[";
  int count = 0;
  for (int i = 0; i < OUTLET_COUNT; i++) {
    Reading r = readOutlet(i);
    if (!r.ok) {
      Serial.printf("Outlet %d: meter not answering, skipped\n", i + 1);
      continue;
    }
    char item[160];
    snprintf(item, sizeof(item),
             "%s{\"outlet\":%d,\"watts\":%.1f,\"kwh\":%.4f,\"voltage\":%.1f,\"current\":%.3f}",
             count ? "," : "", i + 1, r.watts, r.kwh, r.voltage, r.current);
    body += item;
    count++;
    Serial.printf("Outlet %d: %.1f W  %.4f kWh  %.1f V  %.3f A\n", i + 1, r.watts, r.kwh, r.voltage, r.current);
  }
  body += "]}";
  return count;
}

// Sends one report. True when the server accepted it.
bool sendReport(const String& body) {
  WiFiClientSecure client;
  // Encrypted, but the server's certificate is not checked (a known limitation
  // of this prototype). The shared secret below is what identifies the device.
  client.setInsecure();

  HTTPClient http;
  http.setConnectTimeout(10000);
  http.setTimeout(15000);
  if (!http.begin(client, INGEST_URL)) {
    Serial.println("Could not start the HTTPS request.");
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-secret", INGEST_SECRET);
  int status = http.POST(body);
  String answer = status > 0 ? http.getString() : http.errorToString(status);
  http.end();

  Serial.printf("Server said %d: %s\n", status, answer.c_str());
  // 401 = wrong INGEST_SECRET, 404 = DEVICE_CODE not in the database.
  return status == 200;
}

// --------------------------------------------------------------------- start
void setup() {
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println("ElecTrack " DEVICE_CODE "  firmware " FW_VERSION);
#if FAKE_READINGS
  Serial.println("FAKE_READINGS is ON: sending made-up numbers, no meter needed.");
  for (int i = 0; i < OUTLET_COUNT; i++) fakeKwh[i] = 0;
#else
  // One meter alone answers on the general address. Several on one line need
  // their own addresses 1, 2, 3 (set once with the set_pzem_address sketch).
  for (int i = 0; i < OUTLET_COUNT; i++) {
    uint8_t address = (OUTLET_COUNT == 1) ? PZEM_DEFAULT_ADDR : (uint8_t)(i + 1);
    meters[i] = new PZEM004Tv30(Serial2, PIN_PZEM_RX, PIN_PZEM_TX, address);
  }
#endif

  connectWifi();
  lastSuccessAt = millis();
  lastReportAt = millis() - REPORT_EVERY_MS;   // report straight away
}

void loop() {
  showLight();
  checkButton();

  if (millis() - lastReportAt >= REPORT_EVERY_MS) {
    lastReportAt = millis();

    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("Wi-Fi is down; waiting for it to come back.");
      light = LIGHT_CONNECTING;
    } else {
      String body;
      int readable = buildReport(body);
      // Report even with no readable meter, so the server still sees the device as online.
      bool accepted = sendReport(body);
      if (readable == 0) Serial.println("No meter answered. Check the wiring and that mains is present.");
      light = accepted ? LIGHT_OK : LIGHT_FAILED;
      if (accepted) lastSuccessAt = millis();
    }
    // Missed reports lose nothing: the meters keep counting kWh, and the next
    // accepted report carries the total.
  }

  if (millis() - lastSuccessAt > RESTART_IF_SILENT_MS) {
    Serial.println("No accepted report for 15 minutes. Restarting.");
    delay(500);
    ESP.restart();
  }

  delay(10);
}
