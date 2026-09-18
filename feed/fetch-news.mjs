#!/usr/bin/env node
/**
 * Local run: pulls the free feeds and writes data/feed.json.
 *
 *   npm run feed          -> data/feed.json
 *   npm run feed:print    -> and dump the headlines to stdout
 *
 * No API keys, and nothing leaves your machine. On AWS the same logic runs in
 * a Lambda on a schedule (see aws/) and the OS picks it up by itself.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { snapshot } from "./core.mjs";

const OUT = path.join(process.cwd(), "data", "feed.json");
console.error("NQ Trading OS — pulling free feeds");
const snap = await snapshot();
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(snap, null, 2));
console.error("\nwrote " + path.relative(process.cwd(), OUT) +
  "  (" + snap.headlines.length + " headlines, " + Object.keys(snap.quotes).length + " quotes)");
console.error("Paste it into the OS: Settings → Load a snapshot.");
if (process.argv.includes("--print"))
  for (const h of snap.headlines.slice(0, 40))
    console.log(new Date(h.ts).toISOString().slice(11, 16) + "  " + h.src.padEnd(16) + h.txt);
