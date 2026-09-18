#!/usr/bin/env node
/**
 * The page and the feed each hold a copy of the headline scorer, because
 * os/index.html is one file with no build step and no imports while the feed
 * has to produce the same scores server-side. Two copies of anything drift, and
 * a scorer that drifts makes the recorded track record a measurement of
 * something the page no longer does — a defect that would leave no trace in the
 * diff and none at runtime either.
 *
 * So: the block between the markers must match, byte for byte.
 */
import fs from "node:fs";

const OPEN = "/* ---8<--- shared scorer: keep byte-identical to feed/score.mjs ---8<--- */";
const CLOSE = "/* ---8<--- end shared scorer ---8<--- */";

function block(file) {
  const s = fs.readFileSync(file, "utf8");
  const a = s.indexOf(OPEN), b = s.indexOf(CLOSE);
  if (a < 0 || b < 0) { console.error("no scorer markers in " + file); process.exit(1); }
  return s.slice(a + OPEN.length, b);
}

const page = block("os/index.html"), feed = block("feed/score.mjs");
if (page === feed) {
  console.log("ok   scorer identical in os/index.html and feed/score.mjs (" + page.length + " bytes)");
  process.exit(0);
}

console.error("the scorer has drifted between os/index.html and feed/score.mjs");
const a = page.split("\n"), b = feed.split("\n");
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] === b[i]) continue;
  console.error("  line " + (i + 1) + " of the block");
  console.error("    os/index.html : " + JSON.stringify(a[i] ?? "(missing)"));
  console.error("    feed/score.mjs: " + JSON.stringify(b[i] ?? "(missing)"));
}
process.exit(1);
