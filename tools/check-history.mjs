#!/usr/bin/env node
/**
 * The first thing in this repo that checks behaviour rather than syntax, and it
 * exists because the forward-return bookkeeping can be wrong in ways that leave
 * no trace: a return measured from the publisher's timestamp instead of ours, a
 * gap in the price track quietly filled with the nearest bar, a headline
 * counted once per pull instead of once. Each of those makes the scorer look
 * better than it is, which is the one direction an error here must never go.
 */
import { appendPull, forwardReturns, report, EMPTY, HL_DAYS, PX_DAYS } from "../feed/history.mjs";
import { scoreAll, keyOf } from "../feed/score.mjs";

let failed = 0;
const ok = (name, cond, extra) => {
  if (cond) return console.log("  ok   " + name);
  failed++;
  console.error("  FAIL " + name + (extra === undefined ? "" : " — " + JSON.stringify(extra)));
};

const MIN = 60e3, T0 = Date.UTC(2026, 0, 5, 15, 0);           // a Monday, 15:00 UTC
/* Only the Nasdaq is quoted, so every row the report produces is the same
   market and the arithmetic below has one obvious answer. */
const pull = (t, nq) => ({ ts: t, quotes: { nq: { last: nq } } });
const wire = (txt, ts) => [{ txt, src: "Reuters", ts }];

/* --- a headline is recorded once, however many pulls repeat it ------------ */
let h = appendPull(EMPTY, pull(T0, 20000), scoreAll(wire("Fed signals rate cut as inflation cools", T0)));
h = appendPull(h, pull(T0 + 10 * MIN, 20020), scoreAll(wire("Fed signals rate cut as inflation cools", T0)));
ok("two pulls, two price rows", h.px.length === 2, h.px.length);
ok("a repeated headline is logged once", h.hl.length === 1, h.hl.length);
ok("the dedupe key matches the feed's", h.hl[0].k === keyOf("Fed signals rate cut as inflation cools"));
ok("the score is recorded", h.hl[0].score > 0, h.hl[0]);
ok("the markets it reaches are recorded", h.hl[0].mk.includes("nq"), h.hl[0].mk);
ok("appendPull does not mutate its input", EMPTY.px.length === 0 && EMPTY.hl.length === 0);

/* --- the entry is when WE saw it, not when it was stamped ----------------- */
{
  const stale = T0 - 6 * 3600e3;                     // published six hours before the pull
  let g = appendPull(EMPTY, pull(T0, 20000), scoreAll(wire("Nvidia raises guidance, cites strong demand", stale)));
  g = appendPull(g, pull(T0 + 15 * MIN, 20200), []);
  const rows = forwardReturns(g, [15]).filter(r => r.mkt === "nq");
  ok("entry price comes from the pull that saw it", rows[0]?.base === 20000, rows[0]?.base);
  ok("the publisher's timestamp is kept but not used", g.hl[0].ts === stale && g.hl[0].seen === T0);
  ok("the 15-minute return is the move after we saw it",
     Math.abs(rows[0].ret[15] - 1) < 1e-9, rows[0].ret[15]);
}

/* --- a horizon with no price near it stays absent ------------------------- */
{
  let g = appendPull(EMPTY, pull(T0, 20000), scoreAll(wire("Fed signals rate cut as inflation cools", T0)));
  g = appendPull(g, pull(T0 + 15 * MIN, 20100), []);
  g = appendPull(g, pull(T0 + 72 * 3600e3, 21000), []);        // the weekend gap
  const r = forwardReturns(g, [15, 60, 240]).find(x => x.mkt === "nq");
  ok("a horizon with a price reads", Number.isFinite(r.ret[15]), r.ret);
  ok("a horizon across a gap is absent, not zero",
     r.ret[60] === undefined && r.ret[240] === undefined, r.ret);
}

/* --- retention ----------------------------------------------------------- */
{
  let g = appendPull(EMPTY, pull(T0, 20000), scoreAll(wire("Fed signals rate cut as inflation cools", T0)));
  const late = T0 + (HL_DAYS + 1) * 86400e3;
  g = appendPull(g, pull(late, 21000), scoreAll(wire("Tesla plunges after production halt", late)));
  ok("headlines past retention are dropped", g.hl.length === 1 && g.hl[0].txt.startsWith("Tesla"), g.hl.map(r => r.txt));
  const later = T0 + (PX_DAYS + 1) * 86400e3;
  g = appendPull(g, pull(later, 22000), []);
  ok("prices past retention are dropped", g.px.every(r => later - r.t <= PX_DAYS * 86400e3), g.px.length);
}

/* --- a pull with no usable quote leaves no price row --------------------- */
{
  const g = appendPull(EMPTY, { ts: T0, quotes: { nq: { last: null } } }, []);
  ok("a pull with no price writes no price row", g.px.length === 0, g.px);
}

/* --- the report's spread is the difference between the two averages ------ */
{
  let g = appendPull(EMPTY, pull(T0, 20000),
    scoreAll([...wire("Fed signals rate cut as inflation cools", T0),
              ...wire("Tesla plunges after production halt", T0)]));
  g = appendPull(g, pull(T0 + 15 * MIN, 20200), []);
  const r = report(g, [15]);
  const rows = r.rows.filter(x => Number.isFinite(x.ret[15]) && x.score !== 0);
  ok("both a bullish and a bearish read are measured",
     rows.some(x => x.score > 0) && rows.some(x => x.score < 0), rows.map(x => x.score));
  ok("every reading here is the same +1%", rows.every(x => Math.abs(x.ret[15] - 1) < 1e-9));
  ok("so the spread is zero — no edge", Math.abs(r.horizons[15].spread) < 1e-9, r.horizons[15]);
  ok("and the hit rate is the bullish half", Math.abs(r.horizons[15].hit - 0.5) < 1e-9, r.horizons[15].hit);
}

/* --- unreadable history starts a fresh one rather than throwing ---------- */
ok("a corrupt history is replaced, not propagated",
   appendPull({ nonsense: true }, pull(T0, 20000), []).px.length === 1);
ok("no history at all is the first run", appendPull(null, pull(T0, 20000), []).px.length === 1);

console.log(failed ? "\n" + failed + " check(s) failed" : "\nok   forward-return bookkeeping");
process.exit(failed ? 1 : 0);
