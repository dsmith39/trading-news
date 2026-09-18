/**
 * Shared feed logic. Used by the CLI (feed/fetch-news.mjs, writes a file) and
 * by the AWS Lambda (aws/lambda/feed, writes to S3). No dependencies — Node's
 * built-in fetch only, so the Lambda zip is three files and nothing else.
 */
import { RSS, QUERIES, googleNews, QUOTES, chartUrl } from "./sources.mjs";

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

export function levelsFromNQ(c) {
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

export async function quotes() {
  const out = {}; let nq = null, ok = 0;
  for (const [k, sym] of Object.entries(QUOTES)) {
    try {
      const c = fromChart(JSON.parse(await get(chartUrl(sym))));
      if (!c || !Number.isFinite(c.last)) throw new Error("no price");
      out[k] = { last: c.last, open: c.open, hi: c.hi, lo: c.lo };
      if (k === "nq") nq = c;
      ok++;
    } catch (e) { log("  ! " + sym + " — " + e.message); }
    await new Promise(r => setTimeout(r, 220));   // be polite; the endpoint rate-limits
  }
  log("  " + ok + "/" + Object.keys(QUOTES).length + " quotes");
  return { quotes: out, levels: nq ? levelsFromNQ(nq) : null };
}

/** One snapshot, in the shape NQOS.loadSnapshot() eats. */
export async function snapshot(extra) {
  const [news, mkt] = await Promise.all([headlines(), quotes()]);
  return {
    stamp: new Date().toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET",
    ts: Date.now(),
    quotes: mkt.quotes,
    levels: mkt.levels || undefined,
    headlines: news,
    ...(extra || {})
  };
}
