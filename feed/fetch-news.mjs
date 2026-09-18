#!/usr/bin/env node
/**
 * Local run: pulls the free feeds and writes data/feed.json.
 *
 *   npm run feed          -> data/feed.json
 *   npm run feed:print    -> and dump the headlines to stdout
 *
 * No API keys, and nothing leaves your machine. On AWS the same logic runs on a
 * schedule (see aws/) and the page picks the result up by itself.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { snapshot } from "./core.mjs";
import { scoreAll } from "./score.mjs";
import { appendPull, EMPTY } from "./history.mjs";

const OUT = path.join(process.cwd(), "data", "feed.json");
const HIST = path.join(process.cwd(), "data", "history.json");
console.error("NQ Trading OS — fetching free news and prices");
const snap = await snapshot();
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(snap, null, 2));
console.error("\nwrote " + path.relative(process.cwd(), OUT) +
  "  (" + snap.headlines.length + " headlines, " + Object.keys(snap.quotes).length + " quotes)");
/* The same append the scheduled function makes on AWS, so a local run builds a
   track record too. Instrumentation must never cost the feed: if this throws,
   say so and keep the snapshot that was already written. */
try {
  let prev = EMPTY;
  try { prev = JSON.parse(await fs.readFile(HIST, "utf8")); } catch { /* first run */ }
  const hist = appendPull(prev, snap, scoreAll(snap.headlines));
  await fs.writeFile(HIST, JSON.stringify(hist));
  console.error("wrote " + path.relative(process.cwd(), HIST) +
    "  (" + hist.px.length + " pulls, " + hist.hl.length + " headlines scored)");
} catch (e) {
  console.error("history not updated — " + e.message);
}

console.error("Now paste it into the page: Settings → Real prices and real news → Use this data.");
if (process.argv.includes("--print"))
  for (const h of snap.headlines.slice(0, 40))
    console.log(new Date(h.ts).toISOString().slice(11, 16) + "  " + h.src.padEnd(16) + h.txt);
