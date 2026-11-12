// ElecTrack — fetch the published VECO residential rate for an admin to verify.
//
// Reads the Visayan Electric newsroom RSS feed, opens the newest rate
// announcement it has not seen before, pulls the peso-per-kWh figures out of
// the article, and saves its best guess as a PENDING rate. It never approves:
// an admin checks the number against the article in the app first.
//
// Who may call it:
//   * a signed-in admin (the app's "Fetch from VECO" button), or
//   * the daily schedule, with header  x-cron-secret: <CRON_SECRET>
import { createClient } from "npm:@supabase/supabase-js@2";
import { findRates, htmlToText, isRatePost, parseFeed } from "./parse.ts";

const FEED_URL = "https://www.visayanelectric.com/blog-feed.xml";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SECRET_KEY: string =
  JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")["default"] ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const db = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function callerIsAllowed(req: Request): Promise<boolean> {
  if (CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET) return true;
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return false;
  const { data: profile } = await db
    .from("users")
    .select("user_role, account_status")
    .eq("user_id", data.user.id)
    .maybeSingle();
  return profile?.user_role === "Admin" && profile?.account_status === "Active";
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "ElecTrack capstone rate checker" } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return await res.text();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  if (!(await callerIsAllowed(req))) return json(401, { error: "Admins only" });

  try {
    const posts = parseFeed(await getText(FEED_URL)).filter((p) => isRatePost(p.title));
    if (posts.length === 0) {
      return json(200, { status: "none", message: "No rate announcement is in the VECO newsroom feed right now. Enter the rate by hand." });
    }
    const post = posts[0]; // newest

    const { data: seen, error: seenErr } = await db
      .from("electricity_rate")
      .select("electricityrate_id, verification_status")
      .eq("source_url", post.link)
      .maybeSingle();
    if (seenErr) throw new Error(seenErr.message);
    if (seen) {
      return json(200, {
        status: "already",
        message: `The newest VECO rate announcement ("${post.title}") was already fetched. It is ${seen.verification_status.toLowerCase()}.`,
      });
    }

    // Read the article page; fall back to the feed's own excerpt if the page is no help.
    let rates = findRates(await getText(post.link).then(htmlToText).catch(() => ""));
    if (rates.length === 0) rates = findRates(post.summary);
    if (rates.length === 0) {
      return json(200, {
        status: "none",
        message: `Found "${post.title}" but could not read a per-kWh rate from it. Open the article and enter the rate by hand.`,
        url: post.link,
      });
    }

    // The rate starts on the day VECO published it (Philippine time).
    const manila = new Date(post.published.getTime() + 8 * 3600 * 1000);
    const effectiveFrom = manila.toISOString().slice(0, 10);
    const best = rates[0];
    const note = `From "${post.title}", published ${manila.toISOString().slice(0, 10)}. ` +
      (rates.length > 1
        ? `The article mentions ${rates.length} figures: ${rates.map((r) => r.value.toFixed(2)).join(", ")}. Check which one is the residential rate.`
        : "One figure found.") +
      ` Context: "${best.sentence}"`;

    const { error: insertErr } = await db.from("electricity_rate").insert({
      rate_per_kwh: best.value,
      effective_from: effectiveFrom,
      rate_source: "VECO Website",
      verification_status: "Pending",
      source_url: post.link,
      source_note: note.slice(0, 1000),
    });
    if (insertErr) throw new Error(insertErr.message);

    return json(200, {
      status: "new",
      message: `Fetched ${best.value.toFixed(2)} per kWh from "${post.title}". It is waiting for approval.`,
      rate_per_kwh: best.value,
      url: post.link,
    });
  } catch (e) {
    return json(502, { error: `Could not fetch the VECO rate: ${e instanceof Error ? e.message : e}` });
  }
});
