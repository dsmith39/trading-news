#!/usr/bin/env node
/**
 * Pulls free RSS headlines and free quote snapshots, and writes one
 * snapshot file that NQ Trading OS can swallow whole.
 *
 *   node feed/fetch-news.mjs            -> data/feed.json
 *   node feed/fetch-news.mjs --print    -> also dump the headlines to stdout
 *
 * No API keys. Nothing is sent anywhere; the file stays on your machine
 * until you paste it into the OS.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { RSS, QUERIES, googleNews, QUOTES, chartUrl } from "./sources.mjs";

const UA = "Mozilla/5.0 (compatible; nq-trading-os/1.0; +local)";
const OUT = path.join(process.cwd(), "data", "feed.json");
const MAX_AGE_H = 12;
const print = process.argv.includes("--print");

const get = async (url, ms = 12000) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { "user-agent": UA, accept: "*/*" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
};

/* --- the smallest RSS/Atom reader that survives real feeds --- */
const strip = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, "")
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g,
    m => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " ", "&#39;": "'" }[m] || " "))
  .replace(/\s+/g, " ").trim();

function parseFeed(xml, src) {
  const out = [];
  const items = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/g) || [];
  for (const it of items) {
    const title = (it.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1];
    const date = (it.match(/<(pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/\1>/) || [])[2];
    if (!title) continue;
    let txt = strip(title);
    // Google News appends " - Publisher"; keep the publisher as the source
    let source = src;
    const m = txt.match(/^(.*?)\s+-\s+([A-Z][\w .&'-]{2,28})$/);
    if (m && src === "Other") { txt = m[1]; source = m[2]; }
    const ts = date ? Date.parse(strip(date)) : Date.now();
    if (!txt || txt.length < 12) continue;
    out.push({ txt, src: source, ts: Number.isFinite(ts) ? ts : Date.now() });
  }
  return out;
}

async function headlines() {
  const jobs = [
    ...RSS.map(f => ({ url: f.url, src: f.src })),
    ...QUERIES.map(f => ({ url: googleNews(f.q), src: f.src }))
  ];
  const settled = await Promise.allSettled(jobs.map(async j => parseFeed(await get(j.url), j.src)));
  const seen = new Set(), rows = [];
  let ok = 0;
  settled.forEach((r, i) => {
    if (r.status !== "fulfilled") {
      console.error("  ! " + new URL(jobs[i].url).host + " — " + r.reason.message);
      return;
    }
    ok++;
    for (const h of r.value) {
      const key = h.txt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
      if (seen.has(key)) continue;
      if (Date.now() - h.ts > MAX_AGE_H * 3600e3) continue;
      seen.add(key); rows.push(h);
    }
  });
  rows.sort((a, b) => b.ts - a.ts);
  console.error("  " + ok + "/" + jobs.length + " feeds answered, " + rows.length + " fresh headlines");
  return rows.slice(0, 120);
}

/* --- quotes + the session levels the OS structure factor needs --- */
function fromChart(j) {
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r) return null;
  const m = r.meta || {}, q = ((r.indicators || {}).quote || [{}])[0] || {};
  const ts = r.timestamp || [];
  const last = m.regularMarketPrice ?? (q.close || []).filter(Number.isFinite).pop();
  const open = m.chartPreviousClose ?? m.previousClose ?? last;
  return { last, open, hi: m.regularMarketDayHigh, lo: m.regularMarketDayLow, ts, quote: q, meta: m };
}

function levelsFromNQ(c) {
  if (!c || !c.ts.length) return null;
  const { ts, quote } = c, et = t => {
    const d = new Date(t * 1000);
    const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false,
      hour: "2-digit", minute: "2-digit", day: "2-digit" }).formatToParts(d)
      .reduce((a, x) => (a[x.type] = x.value, a), {});
    return { min: (+p.hour % 24) * 60 + +p.minute, day: +p.day };
  };
  const today = et(ts[ts.length - 1]).day;
  let onH = -Infinity, onL = Infinity, pdH = -Infinity, pdL = Infinity, pdC = null;
  let pv = 0, vol = 0, ibH = -Infinity, ibL = Infinity;
  for (let i = 0; i < ts.length; i++) {
    const h = quote.high?.[i], l = quote.low?.[i], cl = quote.close?.[i], v = quote.volume?.[i] || 0;
    if (!Number.isFinite(h) || !Number.isFinite(l)) continue;
    const e = et(ts[i]);
    if (e.day !== today) { pdH = Math.max(pdH, h); pdL = Math.min(pdL, l); pdC = cl ?? pdC; continue; }
    if (e.min < 570) { onH = Math.max(onH, h); onL = Math.min(onL, l); }          // overnight
    if (e.min >= 570 && e.min < 630) { ibH = Math.max(ibH, h); ibL = Math.min(ibL, l); } // initial balance
    if (e.min >= 570 && Number.isFinite(cl)) { pv += ((h + l + cl) / 3) * v; vol += v; } // session VWAP
  }
  const fin = v => (Number.isFinite(v) ? Math.round(v * 4) / 4 : undefined);
  return {
    onh: fin(onH), onl: fin(onL), pdh: fin(pdH), pdl: fin(pdL), pdc: fin(pdC),
    ibh: fin(ibH), ibl: fin(ibL), vwap: fin(vol ? pv / vol : undefined)
  };
}

async function quotes() {
  const out = {}; let nqChart = null, ok = 0;
  for (const [k, sym] of Object.entries(QUOTES)) {
    try {
      const c = fromChart(JSON.parse(await get(chartUrl(sym))));
      if (!c || !Number.isFinite(c.last)) throw new Error("no price");
      out[k] = { last: c.last, open: c.open, hi: c.hi, lo: c.lo };
      if (k === "nq") nqChart = c;
      ok++;
    } catch (e) { console.error("  ! " + sym + " — " + e.message); }
    await new Promise(r => setTimeout(r, 260));   // be polite; the endpoint rate-limits
  }
  console.error("  " + ok + "/" + Object.keys(QUOTES).length + " quotes");
  return { quotes: out, levels: nqChart ? levelsFromNQ(nqChart) : null };
}

const main = async () => {
  console.error("NQ Trading OS — pulling free feeds");
  const [news, mkt] = await Promise.all([headlines(), quotes()]);
  const snap = {
    stamp: new Date().toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET",
    ts: Date.now(),
    quotes: mkt.quotes,
    levels: mkt.levels || undefined,
    headlines: news
  };
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(snap, null, 2));
  console.error("\nwrote " + path.relative(process.cwd(), OUT) +
    "  (" + news.length + " headlines, " + Object.keys(mkt.quotes).length + " quotes)");
  console.error("Paste it into the OS: Settings → Load a snapshot.");
  if (print) for (const h of news.slice(0, 40))
    console.log(new Date(h.ts).toISOString().slice(11, 16) + "  " + h.src.padEnd(16) + h.txt);
};
main().catch(e => { console.error(e); process.exit(1); });
