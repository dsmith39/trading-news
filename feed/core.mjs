/**
 * Shared feed logic. Used by the CLI (feed/fetch-news.mjs, writes a file) and
 * by the AWS Lambda (aws/lambda/feed, writes to S3). No dependencies — Node's
 * built-in fetch only, so the Lambda zip is three files and nothing else.
 */
import { RSS, QUERIES, googleNews, chartUrl } from "./sources.mjs";
import { INSTRUMENTS, SERIES, allSymbols, byKey } from "./instruments.mjs";

const UA = "Mozilla/5.0 (compatible; nq-trading-os/1.0)";
const MAX_AGE_H = 12;
const log = (...a) => console.error(...a);

export const get = async (url, ms = 9000) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { "user-agent": UA, accept: "*/*" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
};

/* --- the smallest RSS/Atom reader that survives real feeds --- */
const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " ", "&#39;": "'" };
const strip = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, "")
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, m => ENT[m] || " ")
  .replace(/\s+/g, " ").trim();

export function parseFeed(xml, src) {
  const out = [];
  for (const it of xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/g) || []) {
    const title = (it.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1];
    const date = (it.match(/<(pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/\1>/) || [])[2];
    if (!title) continue;
    let txt = strip(title), source = src;
    /* Google News appends " - Publisher"; keep the publisher as the source */
    const m = txt.match(/^(.*?)\s+-\s+([A-Z][\w .&'-]{2,28})$/);
    if (m && src === "Other") { txt = m[1]; source = m[2]; }
    if (!txt || txt.length < 12) continue;
    const ts = date ? Date.parse(strip(date)) : Date.now();
    out.push({ txt, src: source, ts: Number.isFinite(ts) ? ts : Date.now() });
  }
  return out;
}

export async function headlines() {
  const jobs = [
    ...RSS.map(f => ({ url: f.url, src: f.src })),
    ...QUERIES.map(f => ({ url: googleNews(f.q), src: f.src }))
  ];
  const settled = await Promise.allSettled(jobs.map(async j => parseFeed(await get(j.url), j.src)));
  const seen = new Set(), rows = [];
  let ok = 0;
  settled.forEach((r, i) => {
    if (r.status !== "fulfilled") return log("  ! " + new URL(jobs[i].url).host + " — " + r.reason.message);
    ok++;
    for (const h of r.value) {
      const key = h.txt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
      if (seen.has(key) || Date.now() - h.ts > MAX_AGE_H * 3600e3) continue;
      seen.add(key); rows.push(h);
    }
  });
  rows.sort((a, b) => b.ts - a.ts);
  log("  " + ok + "/" + jobs.length + " feeds answered, " + rows.length + " fresh headlines");
  return rows.slice(0, 120);
}

/* --- quotes, and the session levels the structure factor needs --- */
function fromChart(j) {
  const r = j?.chart?.result?.[0];
  if (!r) return null;
  const m = r.meta || {}, q = r.indicators?.quote?.[0] || {};
  const last = m.regularMarketPrice ?? (q.close || []).filter(Number.isFinite).pop();
  return { last, open: m.chartPreviousClose ?? m.previousClose ?? last,
           hi: m.regularMarketDayHigh, lo: m.regularMarketDayLow, ts: r.timestamp || [], quote: q };
}

const ETP = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false,
  hour: "2-digit", minute: "2-digit", day: "2-digit" });
const etOf = t => {
  const p = ETP.formatToParts(new Date(t * 1000)).reduce((a, x) => (a[x.type] = x.value, a), {});
  return { min: (+p.hour % 24) * 60 + +p.minute, day: +p.day };
};

export function levelsFrom(c) {
  if (!c || !c.ts.length) return null;
  const { ts, quote } = c, today = etOf(ts[ts.length - 1]).day;
  let onH = -Infinity, onL = Infinity, pdH = -Infinity, pdL = Infinity, pdC = null;
  let ibH = -Infinity, ibL = Infinity, pv = 0, vol = 0;
  for (let i = 0; i < ts.length; i++) {
    const h = quote.high?.[i], l = quote.low?.[i], cl = quote.close?.[i], v = quote.volume?.[i] || 0;
    if (!Number.isFinite(h) || !Number.isFinite(l)) continue;
    const e = etOf(ts[i]);
    if (e.day !== today) { pdH = Math.max(pdH, h); pdL = Math.min(pdL, l); pdC = cl ?? pdC; continue; }
    if (e.min < 570) { onH = Math.max(onH, h); onL = Math.min(onL, l); }                     // overnight
    if (e.min >= 570 && e.min < 630) { ibH = Math.max(ibH, h); ibL = Math.min(ibL, l); }     // initial balance
    if (e.min >= 570 && Number.isFinite(cl)) { pv += ((h + l + cl) / 3) * v; vol += v; }     // session VWAP
  }
  const t = v => (Number.isFinite(v) ? Math.round(v * 4) / 4 : undefined);
  return { onh: t(onH), onl: t(onL), pdh: t(pdH), pdl: t(pdL), pdc: t(pdC),
           ibh: t(ibH), ibl: t(ibL), vwap: t(vol ? pv / vol : undefined) };
}

/* A full option chain is a large download, so this list is deliberately short:
   the index proxies answer "is this move already priced?", and the two most
   headline-driven single names answer it for the megacaps. */
export const OPTION_UNDERLYINGS = ["QQQ", "SPY", "NVDA", "TSLA"];

const OCC = /^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;

/** Nearest-expiry at-the-money straddle -> the move the market is paying for. */
export async function optionSummary(sym) {
  let j;
  try {
    j = JSON.parse(await get(
      "https://cdn.cboe.com/api/global/delayed_quotes/options/" + encodeURIComponent(sym) + ".json", 20000));
  } catch (e) { log("  ! options " + sym + " \u2014 " + e.message); return null; }

  const d = j.data || {};
  const spot = d.current_price ?? d.close;
  const rows = d.options || [];
  if (!spot || !rows.length) return null;

  const mid = o => {
    const b = +o.bid || 0, a = +o.ask || 0;
    return b && a ? (b + a) / 2 : (+o.last_trade_price || 0);
  };
  const byExpiry = new Map();
  for (const o of rows) {
    const m = OCC.exec(o.option || "");
    if (!m) continue;
    const [, , yy, mm, dd, cp, strike] = m;
    const key = "20" + yy + "-" + mm + "-" + dd;
    if (!byExpiry.has(key)) byExpiry.set(key, []);
    byExpiry.get(key).push({ cp, strike: +strike / 1000, iv: +o.iv || 0, px: mid(o) });
  }
  const today = new Date().toISOString().slice(0, 10);
  const expiries = [...byExpiry.keys()].filter(e => e >= today).sort();
  if (!expiries.length) return null;

  const near = (arr) => arr.reduce((best, o) =>
    Math.abs(o.strike - spot) < Math.abs(best.strike - spot) ? o : best, arr[0]);

  /* An expiry measured from one chain: the at-the-money straddle is what the
     market charges to be wrong about direction, so it is the move being paid
     for between now and then. */
  const read = (exp) => {
    const chain = byExpiry.get(exp) || [];
    const calls = chain.filter(o => o.cp === "C"), puts = chain.filter(o => o.cp === "P");
    if (!calls.length || !puts.length) return null;
    const c = near(calls), p = near(puts);
    const straddle = c.px + p.px;
    if (!straddle) return null;
    return {
      expiry: exp,
      days: Math.max(0, Math.round((Date.parse(exp + "T21:00:00Z") - Date.now()) / 86400000)),
      strike: c.strike,
      expectedMovePct: Math.round((straddle / spot) * 10000) / 100,
      expectedMove: Math.round(straddle * 100) / 100,
      atmIv: Math.round(((c.iv + p.iv) / 2) * 1000) / 10,
      /* Puts dearer than calls the same distance out is the market paying up
         for downside - the cheapest read on positioning there is. */
      skew: Math.round((p.px - c.px) * 100) / 100,
    };
  };

  /* Two different questions. The expiry dated today answers "how much further
     can it go before the close"; the next one out answers "is this news already
     priced", which is the one worth asking of a headline. */
  const sameDay = expiries[0] === today ? read(today) : null;
  const forward = read(expiries.find(e => e > today) || expiries[0]);
  if (!forward && !sameDay) return null;
  return { symbol: sym, spot, ...(forward || sameDay), today: sameDay || undefined };
}

/** Every instrument and context series, each with its own session levels. */
export async function marketData() {
  const syms = allSymbols();
  /* Several keys can share a symbol - usdjpy the instrument and jpy the context
     series are the same tape - so fetch each symbol once and fan it out. */
  const bySymbol = new Map();
  for (const [key, sym] of Object.entries(syms)) {
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym).push(key);
  }
  const quotes = {}, levels = {}, charts = {};
  let ok = 0;
  for (const [sym, keys] of bySymbol) {
    try {
      const c = fromChart(JSON.parse(await get(chartUrl(sym))));
      if (!c || !Number.isFinite(c.last)) throw new Error("no price");
      for (const key of keys) {
        quotes[key] = { last: c.last, open: c.open, hi: c.hi, lo: c.lo, sym };
        charts[key] = c;
      }
      ok++;
    } catch (e) { log("  ! " + sym + " \u2014 " + e.message); }
    await new Promise(r => setTimeout(r, 220));   // be polite; the endpoint rate-limits
  }
  /* Levels are derived from the same chart payload, so they cost no extra call. */
  for (const i of INSTRUMENTS) {
    const c = charts[i.key];
    if (c) { const lv = levelsFrom(c); if (lv) levels[i.key] = lv; }
  }
  log("  " + ok + "/" + bySymbol.size + " symbols (" + Object.keys(quotes).length + " keys)");
  return { quotes, levels };
}

export async function options() {
  const out = {};
  for (const sym of OPTION_UNDERLYINGS) {
    const o = await optionSummary(sym);
    if (o) out[sym] = o;
    await new Promise(r => setTimeout(r, 400));
  }
  log("  " + Object.keys(out).length + "/" + OPTION_UNDERLYINGS.length + " option chains");
  return out;
}

/** One snapshot, in the shape NQOS.loadSnapshot() eats. */
export async function snapshot(extra) {
  const [news, mkt, opts] = await Promise.all([headlines(), marketData(), options()]);
  return {
    stamp: new Date().toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET",
    ts: Date.now(),
    /* Quotes are keyed by instrument, so the old single-market shape is kept
       alongside them: a page loaded moments before this deploy still reads. */
    quotes: mkt.quotes,
    levels: mkt.levels.nq || undefined,
    instrumentLevels: mkt.levels,
    options: opts,
    headlines: news,
    ...(extra || {})
  };
}
