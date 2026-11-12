// ElecTrack device settings.
// Copy this file to config.h (same folder) and fill it in. config.h is not
// committed to Git because it holds the device secret.

// ---- Which device is this? -------------------------------------------------
// The code must match a row in the smart_plug table (and the sticker on the box).
#define DEVICE_CODE   "ELT-PLUG-001"
// 1 = High-Power Smart Plug (one PZEM), 3 = Smart Power Strip (three PZEMs).
#define OUTLET_COUNT  1

// ---- Where readings go -----------------------------------------------------
#define INGEST_URL    "https://YOUR-PROJECT-REF.supabase.co/functions/v1/ingest"
// The same value you set with: npx supabase secrets set INGEST_SECRET=...
#define INGEST_SECRET "paste-the-ingest-secret-here"

// ---- Behaviour -------------------------------------------------------------
// Milliseconds between reports. The approved scope says every 30 seconds.
#define REPORT_EVERY_MS 30000

// Set to 1 to send made-up readings with NO meter attached. Use this to prove
// Wi-Fi, the secret and the app work before any mains wiring. Set back to 0
// for the real device.
#define FAKE_READINGS 1

// How many times the live wire passes through each CT ring. Leave at 1.
// Raise it (e.g. 3) only if low-watt accuracy on the strip is poor, and then
// actually loop the wire that many times: readings are divided by this.
#define CT_TURNS 1
