/**
 * The scorer's track record.
 *
 * Every pull appends two things to history.json: the price of each instrument
 * at that moment, and any headline the wire had not shown us before, with the
 * score the lexicon gave it and the markets it reaches. Nothing else. Forward
 * returns are not stored — they are derived from the price track whenever you
 * ask, which means a horizon can be added or changed after the fact without
 * re-collecting a month of data, and no row is ever half-written.
 *
 * Two rules keep this measurement honest, and both are easy to get wrong:
 *
 *   - A return is measured from when WE SAW the headline, not from the time the
 *     publisher stamped on it. Google News hands back stories up to twelve
 *     hours old; measuring from their timestamp would credit the scorer with a
 *     move that had already happened before it read a word.
 *   - A horizon with no price near it stays absent. The feed runs on weekdays
 *     only, so a four-hour return on a Friday afternoon headline has no honest
 *     answer until Monday, and inventing one by reaching for the nearest bar
 *     would make the scorer look best exactly where it knows least.
 */

/* Prices are cheap and the whole point, headlines are bulky and repeat. */
export const PX_DAYS = 30;
export const HL_DAYS = 14;

/** Minutes after the entry price at which the move is measured. */
export const HORIZONS = [15, 60, 240];

/** How far past a horizon a price may sit and still answer for it. */
const TOLERANCE_MIN = 25;

const DAY = 86400e3;
export const EMPTY = { v: 1, px: [], hl: [] };

/**
 * Fold one pull into the history. Returns a new object; never mutates `prev`,
 * so a failed write leaves the caller's copy intact.
 *
 * @param prev    the history as last written, or anything unparseable
 * @param snap    the snapshot just built (needs ts and quotes)
 * @param scored  that pull's headlines, already through scoreAll()
 */
export function appendPull(prev, snap, scored) {
  const h = prev && Array.isArray(prev.px) && Array.isArray(prev.hl)
    ? { v: 1, px: prev.px.slice(), hl: prev.hl.slice() }
    : { v: 1, px: [], hl: [] };
  const t = snap.ts || Date.now();

  const p = {};
  for (const [key, q] of Object.entries(snap.quotes || {})) {
    if (Number.isFinite(q?.last)) p[key] = q.last;
  }
  if (Object.keys(p).length) h.px.push({ t, p });

  const known = new Set(h.hl.map(r => r.k));
  for (const r of scored || []) {
    if (known.has(r.k)) continue;
    known.add(r.k);
    /* `seen` is the entry time; `ts` is kept only to show how stale the wire was. */
    h.hl.push({ k: r.k, seen: t, ts: r.ts, txt: r.txt, src: r.src,
                score: r.score, impact: r.impact, channel: r.channel,
                entity: r.entity || undefined, mk: r.mk });
  }

  const now = t;
  h.px = h.px.filter(r => now - r.t <= PX_DAYS * DAY);
  h.hl = h.hl.filter(r => now - r.seen <= HL_DAYS * DAY);
  return h;
}

/** The first price row at or after `t`, if one sits close enough to answer. */
function priceAt(px, t, key) {
  for (const row of px) {
    if (row.t < t) continue;
    if (row.t - t > TOLERANCE_MIN * 60e3) return null;
    const v = row.p?.[key];
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

/**
 * Join scores to what prices did next. One row per headline per market it
 * reaches, with a percentage return at each horizon that has a price.
 */
export function forwardReturns(hist, horizons = HORIZONS) {
  const px = (hist?.px || []).slice().sort((a, b) => a.t - b.t);
  const out = [];
  for (const r of hist?.hl || []) {
    for (const key of r.mk || []) {
      const base = priceAt(px, r.seen, key);
      if (!Number.isFinite(base) || base === 0) continue;
      const ret = {};
      let any = false;
      for (const m of horizons) {
        const v = priceAt(px, r.seen + m * 60e3, key);
        if (Number.isFinite(v)) { ret[m] = ((v / base) - 1) * 100; any = true; }
      }
      if (any) out.push({ ...r, mkt: key, base, ret });
    }
  }
  return out;
}

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/**
 * What the track record says. For each horizon: how often a non-zero score
 * pointed the right way, and what the average move was after a bullish read
 * against a bearish one. The spread between those two is the number that
 * matters — a scorer with no edge produces the same average either way.
 */
export function report(hist, horizons = HORIZONS) {
  const rows = forwardReturns(hist, horizons);
  const byHorizon = {};
  for (const m of horizons) {
    const seen = rows.filter(r => Number.isFinite(r.ret[m]));
    const called = seen.filter(r => r.score !== 0);
    const up = called.filter(r => r.score > 0).map(r => r.ret[m]);
    const dn = called.filter(r => r.score < 0).map(r => r.ret[m]);
    const hits = called.filter(r => Math.sign(r.score) === Math.sign(r.ret[m]) && r.ret[m] !== 0);
    byHorizon[m] = {
      n: seen.length, called: called.length,
      hit: called.length ? hits.length / called.length : null,
      bull: mean(up), bear: mean(dn),
      spread: up.length && dn.length ? mean(up) - mean(dn) : null
    };
  }
  return {
    headlines: (hist?.hl || []).length,
    scored: (hist?.hl || []).filter(r => r.score !== 0).length,
    pulls: (hist?.px || []).length,
    from: hist?.px?.length ? Math.min(...hist.px.map(r => r.t)) : null,
    to: hist?.px?.length ? Math.max(...hist.px.map(r => r.t)) : null,
    horizons: byHorizon,
    rows
  };
}
