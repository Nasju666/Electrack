// ElecTrack ingest — the single entry point for device data.
// The simulator and the ESP32 firmware both POST here.
//
// POST /functions/v1/ingest
// Headers:  Content-Type: application/json
//           x-device-secret: <INGEST_SECRET>
// Body:     { "code": "ELT-STRIP-001", "fw": "0.1.0",
//             "readings": [ { "outlet": 1, "watts": 54.2, "kwh": 1.2345,
//                             "voltage": 229.8, "current": 0.262 } ] }
//
// "kwh" is the meter channel's cumulative energy counter.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// New projects expose secret keys as a JSON map; older ones as SUPABASE_SERVICE_ROLE_KEY.
const SECRET_KEY: string =
  JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")["default"] ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_SECRET = Deno.env.get("INGEST_SECRET");

const db = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  if (!INGEST_SECRET) return json(500, { error: "INGEST_SECRET is not set" });
  if (req.headers.get("x-device-secret") !== INGEST_SECRET) {
    return json(401, { error: "bad device secret" });
  }

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "body must be JSON" });
  }
  if (typeof body?.code !== "string" || !Array.isArray(body?.readings)) {
    return json(400, { error: "expected { code, readings: [...] }" });
  }

  const { data: plug, error: plugErr } = await db
    .from("smart_plug")
    .select("smartplug_id, appliance(appliance_id, outlet_no)")
    .eq("smartplug_code", body.code)
    .maybeSingle();
  if (plugErr) return json(500, { error: plugErr.message });
  if (!plug) return json(404, { error: `unknown device code ${body.code}` });

  const applianceByOutlet = new Map<number, number>(
    (plug.appliance as { appliance_id: number; outlet_no: number }[])
      .map((a) => [a.outlet_no, a.appliance_id]),
  );

  const rows = [];
  let skipped = 0;
  for (const r of body.readings) {
    const applianceId = applianceByOutlet.get(r?.outlet);
    // Skip outlets with no appliance registered, and malformed or impossible values.
    if (
      !applianceId || !isNum(r.watts) || !isNum(r.kwh) ||
      r.watts < 0 || r.watts > 25000 || r.kwh < 0
    ) {
      skipped++;
      continue;
    }
    rows.push({
      smartplug_id: plug.smartplug_id,
      appliance_id: applianceId,
      reading_watts: r.watts,
      reading_kwh: r.kwh,
      reading_voltage: isNum(r.voltage) ? r.voltage : null,
      reading_current: isNum(r.current) ? r.current : null,
    });
  }

  if (rows.length > 0) {
    const { error } = await db.from("consumption_reading").insert(rows);
    if (error) return json(500, { error: error.message });
  }

  // Any valid contact marks the device online, even with zero stored readings.
  const { error: seenErr } = await db
    .from("smart_plug")
    .update({
      smartplug_status: "Online",
      smartplug_lastseen: new Date().toISOString(),
      ...(typeof body.fw === "string" ? { firmware_version: body.fw.slice(0, 20) } : {}),
    })
    .eq("smartplug_id", plug.smartplug_id);
  if (seenErr) return json(500, { error: seenErr.message });

  return json(200, { stored: rows.length, skipped });
});
