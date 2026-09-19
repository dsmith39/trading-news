#!/usr/bin/env node
/**
 * What the scorer has actually been worth.
 *
 *   npm run score:report                      -> reads data/history.json
 *   npm run score:report -- <url|path>        -> reads a deployed history.json
 *
 * Every row it prints is a headline the lexicon gave a non-zero reading,
 * matched against what the markets that headline reaches did next. The number
 * to watch is the spread: the average move after a bullish read minus the
 * average after a bearish one. A lexicon with no edge produces the same average
 * either way, and the spread sits on zero however confident the headlines read.
 *
 * Small samples say nothing. Under a few hundred scored headlines per horizon
 * the spread is noise, and it is printed with its sample size for that reason.
 */
import fs from "node:fs/promises";
import { report, HORIZONS } from "./history.mjs";

const src = process.argv.slice(2).find(a => !a.startsWith("--")) || "data/history.json";
const hist = JSON.parse(
  /^https?:\/\//.test(src)
    ? await (await fetch(src)).text()
    : await fs.readFile(src, "utf8")
);

const r = report(hist);
const when = t => (t ? new Date(t).toISOString().slice(0, 16).replace("T", " ") : "—");
const pct = v => (Number.isFinite(v) ? (v >= 0 ? "+" : "") + v.toFixed(3) + "%" : "    —  ");

console.log("\n" + src);
console.log(r.pulls + " pulls, " + when(r.from) + " to " + when(r.to) + " UTC");
console.log(r.headlines + " headlines on record, " + r.scored + " with a non-zero reading (" +
  (r.headlines ? Math.round((r.scored / r.headlines) * 100) : 0) + "%)");

const vs = Object.keys(r.versions);
if (vs.length > 1) {
  console.log("\n  ! two scorers are mixed in here: " +
    vs.map(v => r.versions[v] + " rows from v" + v).join(", "));
  console.log("    they are different measurements, so the averages below blend them.");
}
console.log();

console.log("  horizon   scored   hit rate     after bullish    after bearish      spread");
console.log("  " + "-".repeat(76));
for (const m of HORIZONS) {
  const h = r.horizons[m];
  console.log(
    "  " + (m + "m").padStart(7) +
    String(h.called).padStart(9) +
    (h.hit === null ? "        —" : (h.hit * 100).toFixed(1).padStart(8) + "%") +
    pct(h.bull).padStart(17) + pct(h.bear).padStart(17) + pct(h.spread).padStart(12)
  );
}

if (!r.rows.length) {
  console.log("\nNothing to measure yet. The feed runs every ten minutes on weekdays, so a");
  console.log("four-hour horizon needs four hours of pulls after a headline before it reads.");
}

if (process.argv.includes("--rows")) {
  console.log("\n  score  mkt   " + HORIZONS.map(m => (m + "m").padStart(9)).join("") + "  headline");
  for (const row of r.rows.filter(x => x.score !== 0).slice(0, 60)) {
    console.log("  " + String(row.score).padStart(5) + "  " + row.mkt.padEnd(6) +
      HORIZONS.map(m => pct(row.ret[m]).padStart(9)).join("") + "  " + row.txt.slice(0, 60));
  }
}
console.log();
