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
import { scoreAll, keyOf, scoreHeadline, SCORER_VERSION } from "../feed/score.mjs";

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

/* --- topics match whole words, and megacaps reach only the indices ------- */
{
  const mk = txt => scoreAll([{ txt, src: "Reuters", ts: T0 }])[0].mk;
  ok("\"ai\" does not match inside \"chairman\"",
     !mk("Best Buy's Chairman Emeritus sells 300,000 shares").length, mk("Best Buy's Chairman Emeritus sells 300,000 shares"));
  /* No driver words in this one, so it isolates the topic path — the earlier
     version said "Stocks down as yields jump", which now reaches the Dow
     legitimately through its yield driver and so proved nothing. */
  ok("\"dow\" does not match inside \"down\"",
     !mk("Quarterly sales were down at the retailer").includes("ym"),
     mk("Quarterly sales were down at the retailer"));
  ok("\"ev\" does not match inside \"however\" or \"level\"",
     !mk("Revenue however fell at the level of development").includes("tsla"));
  ok("a real topic word still matches", mk("Dow falls 300 points").includes("ym"));
  ok("a plural still matches", mk("Tesla deliveries beat estimates").includes("tsla"));
  ok("a two-word topic still matches", mk("Yen slides as the carry trade unwinds").includes("nkd"));

  const nv = mk("Nvidia raises guidance, cites strong demand");
  ok("a megacap story reaches the indices that hold it",
     ["nq", "es", "rty", "ym"].every(k => nv.includes(k)), nv);
  ok("and not crude, gold or the Nikkei",
     !["cl", "gc", "nkd"].some(k => nv.includes(k)), nv);
}

/* --- direction words belong to whatever actually moved ------------------- */
{
  const sc = txt => scoreHeadline(txt).score;
  ok("an equity fall reads bearish", sc("Dow drops 300 points on rate fears") < 0);
  ok("a rising yield does not read as an equity rally",
     sc("Stocks slide as yields jump") < -40, sc("Stocks slide as yields jump"));
  ok("nor does a commodity that surges in the same sentence",
     sc("Stocks Decline, 10-Year Treasury Yield Touches 5% Amid Oil Surge") < 0);
  ok("a participle takes the subject that follows it",
     sc("Stocks Waver as Falling Oil Offsets Treasury Yield Threat") >= 0,
     sc("Stocks Waver as Falling Oil Offsets Treasury Yield Threat"));
  ok("a comma keeps two clauses apart",
     sc("Global shares fall, Treasury yields rise") < 0);
  ok("an equity rally still reads bullish", sc("Nasdaq rallies as yields fall") > 0);

  /* The bearish side used to hold only the extremes, so every reading leaned up. */
  ok("ordinary up and down words weigh the same",
     Math.abs(sc("Stocks rise") + sc("Stocks fall")) <= 20,
     [sc("Stocks rise"), sc("Stocks fall")]);

  /* These are short words; without boundaries they match inside longer ones. */
  ok("\"gain\" does not match inside \"against\"", sc("Shares steady against the euro") === 0);
  ok("\"fall\" does not match inside \"shortfall\" alone",
     sc("Company reports a shortfall in orders") <= 0);
}

/* --- an instrument is reached by news about what drives it --------------- */
{
  const mk = txt => scoreAll([{ txt, src: "Reuters", ts: T0 }])[0].mk;
  const y = mk("Stocks Decline as Treasury Yields Rise");
  ok("a yield story reaches the markets that declare a yield driver",
     ["nq", "es", "rty", "ym", "gc"].every(k => y.includes(k)), y);
  ok("and not the ones that do not", !y.includes("cl") && !y.includes("sol"), y);
  ok("a dollar story needs the phrase, not the bare word",
     !mk("Shares sold for 300,000 dollars").includes("gc"),
     mk("Shares sold for 300,000 dollars"));
  ok("a yen story reaches the Nikkei", mk("BOJ holds as the yen weakens").includes("nkd"));
}

/* --- rows say which scorer read them ------------------------------------- */
{
  const [r] = scoreAll([{ txt: "Dow drops 300 points", src: "Reuters", ts: T0 }]);
  ok("a scored row carries the scorer version", r.sv === SCORER_VERSION, r.sv);
  const h = appendPull(EMPTY, pull(T0, 20000), scoreAll(wire("Dow drops 300 points", T0)));
  ok("and the history keeps it", h.hl[0].sv === SCORER_VERSION, h.hl[0].sv);
  const mixed = { v: 1, px: h.px, hl: [{ ...h.hl[0] }, { ...h.hl[0], k: "x", sv: 1 }] };
  ok("the report names the mix rather than averaging over it",
     report(mixed, [15]).versions[1] === 1 && report(mixed, [15]).versions[2] === 1,
     report(mixed, [15]).versions);
}

/* --- unreadable history starts a fresh one rather than throwing ---------- */
ok("a corrupt history is replaced, not propagated",
   appendPull({ nonsense: true }, pull(T0, 20000), []).px.length === 1);
ok("no history at all is the first run", appendPull(null, pull(T0, 20000), []).px.length === 1);

console.log(failed ? "\n" + failed + " check(s) failed" : "\nok   forward-return bookkeeping");
process.exit(failed ? 1 : 0);
