// Run with:  deno test supabase/functions/fetch-veco-rate/parse_test.ts
import { findRates, htmlToText, isRatePost, parseFeed } from "./parse.ts";

const eq = (got: unknown, want: unknown, what: string) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${what}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
  }
};

Deno.test("feed: newest first, entities and CDATA decoded", () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[Service Interruption: November 8-14, 2026]]></title><link>https://example.com/post/a</link><pubDate>Thu, 05 Nov 2026 13:26:56 GMT</pubDate></item>
    <item><title>Tools &#38; Equipment Rate Adjustment</title><description><![CDATA[Rate capped at &#8369;15.30/kWh for residential customers.]]></description><link>https://example.com/post/b</link><pubDate>Thu, 12 Nov 2026 07:39:25 GMT</pubDate></item>
  </channel></rss>`;
  const items = parseFeed(xml);
  eq(items.map((i) => i.link), ["https://example.com/post/b", "https://example.com/post/a"], "order");
  eq(items[0].title, "Tools & Equipment Rate Adjustment", "title");
  eq(findRates(items[0].summary).map((r) => r.value), [15.3], "rate readable from the feed excerpt");
});

Deno.test("titles: rate posts in, everything else out", () => {
  eq(isRatePost("Residential rate up by P0.33/kWh for August-September billing"), true, "monthly");
  eq(isRatePost("Utility Implements Safeguards to Cushion October Rate Adjustment"), true, "adjustment");
  eq(isRatePost("Residential rates down for Oct-Nov billing"), true, "plural");
  eq(isRatePost("Service Interruption: November 8-14, 2026"), false, "outage");
  eq(isRatePost("Utility celebrates anniversary"), false, "news");
  eq(isRatePost("Corporate strategy update"), false, "the word 'rate' inside another word");
});

Deno.test("figures: current residential rate wins over last month's and the change", () => {
  const text = "Residential customers will see an increase of P0.33 per kWh this month. " +
    "This brings the overall residential rate to P11.60/kWh, up from last month's P11.27/kWh.";
  const rates = findRates(text);
  eq(rates.map((r) => r.value), [11.6, 11.27], "values, best first");
});

Deno.test("figures: capped rate wins over the projected one", () => {
  const html = "<p>Without these measures the rate was projected to reach &#8369;18.38/kWh.</p>" +
    "<p>The utility is capping the residential rate increase at &#8369;15.30/kWh.</p><script>var x = 'P99.99/kWh';</script>";
  eq(findRates(htmlToText(html)).map((r) => r.value), [15.3, 18.38], "values, best first");
});

Deno.test("figures: 'Php 12.57 per kilowatt-hour' wording", () => {
  const text = "The utility announced a residential electricity rate of Php 12.57 per kilowatt-hour (kWh) for April, an increase of Php 0.21 from March's Php 12.36 per kWh.";
  eq(findRates(text).map((r) => r.value), [12.57, 12.36], "values, best first");
});

Deno.test("figures: none found", () => {
  eq(findRates("Scheduled maintenance will affect several barangays."), [], "empty");
});
