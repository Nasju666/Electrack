/*
  One-off tool: give a PZEM-004T v3.0 its own address (1, 2 or 3).

  Needed only for the Smart Power Strip, where three meters share one serial
  line and must be told apart. The single meter in the High-Power Plug does
  not need this.

  HOW TO USE
    1. Connect ONLY ONE meter to the ESP32 (same wiring as the main firmware),
       and power its mains side so it is awake.
    2. Set NEW_ADDRESS below to 1, upload, open the Serial Monitor at 115200.
    3. When it says "Done", unplug, and write the number on that meter.
    4. Repeat with the next meter and NEW_ADDRESS 2, then 3.

  Never connect two meters while running this: both would take the same address.
*/

#include <PZEM004Tv30.h>

#define NEW_ADDRESS 1   // 1 for outlet 1, 2 for outlet 2, 3 for outlet 3

const int PIN_PZEM_RX = 16;
const int PIN_PZEM_TX = 17;

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println("PZEM address tool");

  // The general address reaches whichever single meter is connected.
  PZEM004Tv30 meter(Serial2, PIN_PZEM_RX, PIN_PZEM_TX, PZEM_DEFAULT_ADDR);

  float volts = meter.voltage();
  if (isnan(volts)) {
    Serial.println("The meter is not answering. Check: mains power to the meter, TX/RX not swapped,");
    Serial.println("5 V and GND connected, and only ONE meter on the line.");
    return;
  }
  Serial.printf("Meter found. It reads %.1f V. Its address now: %d\n", volts, meter.readAddress());

  if (meter.setAddress(NEW_ADDRESS)) {
    Serial.printf("Done. This meter now has address %d. Label it \"Outlet %d\".\n", meter.readAddress(true), NEW_ADDRESS);
  } else {
    Serial.println("Could not set the address. Try again; if it keeps failing, check the wiring.");
  }
}

void loop() {}
