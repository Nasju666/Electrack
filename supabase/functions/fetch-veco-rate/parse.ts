// Pure text handling for the VECO rate fetch. No network, no database,
// so it can be tested on its own (see parse_test.ts).

export type FeedItem = { title: string; link: string; published: Date; summary: string };
export type Figure = { value: number; score: number; sentence: string };

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " ",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&[a-z]+;/g, (e) => ENTITIES[e] ?? e);
}

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  if (!m) return "";
  return decodeEntities(m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim());
};

/** Posts in the newsroom RSS feed, newest first. */
export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const published = new Date(tag(m[1], "pubDate"));
    const link = tag(m[1], "link");
    if (link && !Number.isNaN(published.getTime())) {
      // The feed carries the opening of each article; used if the page itself cannot be read.
      const summary = htmlToText(tag(m[1], "description") + " " + tag(m[1], "content:encoded"));
      items.push({ title: tag(m[1], "title"), link, published, summary });
    }
  }
  return items.sort((a, b) => b.published.getTime() - a.published.getTime());
}

/** True for the monthly rate announcements, false for outages, promos, bids, and so on. */
export function isRatePost(title: string): boolean {
  return /\brates?\b/i.test(title) && !/interruption/i.test(title);
}

/** Readable text of an article page. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|h[1-6]|li|br)>/gi, ". ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

// "₱15.30/kWh", "P11.60/kWh", "Php 12.57 per kilowatt-hour", "P14.96 per kWh"
const PESO_PER_KWH = /(?:₱|PHP|PhP|Php|P)\s?(\d{1,2}(?:\.\d{1,4})?)\s*(?:\/|per)\s*(?:kWh|kilowatt)/g;

/**
 * Every plausible total rate in the text, best guess first.
 * Small amounts such as "up by P0.33/kWh" are month-to-month changes, not rates,
 * and are dropped. The rest are scored by the words around them: the current
 * residential rate ranks above last month's rate and above "would have been" figures.
 */
export function findRates(text: string): Figure[] {
  const found = new Map<number, Figure>();
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    for (const m of sentence.matchAll(PESO_PER_KWH)) {
      const value = Number(m[1]);
      if (value < 5 || value > 40) continue;
      const before = sentence.slice(Math.max(0, m.index! - 45), m.index!).toLowerCase();
      let score = 0;
      if (/residential/i.test(sentence)) score += 2;
      if (/\b(to|at|is|of)\s*$/.test(before) || /brings|capp|now|this month/.test(before)) score += 1;
      if (/from|last month|previous|projected|would have|could have|without|as high as|as much as/.test(before)) score -= 3;
      const existing = found.get(value);
      if (!existing || score > existing.score) found.set(value, { value, score, sentence: sentence.trim().slice(0, 300) });
    }
  }
  return [...found.values()].sort((a, b) => b.score - a.score);
}
