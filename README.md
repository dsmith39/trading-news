# NQ Trading OS

A windowed desktop for trading **Nasdaq-100 futures (NQ)** off news, scheduled
catalysts and sentiment. It is built around one opinion: most of the day there
is no trade, and the job of a news tool is to tell you *which* hours are worth
risking money in — not to manufacture a signal every five minutes.

Run it as a published Artifact (a browser OS, nothing to install), and feed it
real data with the fetcher in this repo.

---

## What's in the OS

| App | What it does |
|---|---|
| **Signal** | The composite bias score (−100…+100), the verdict, and every factor that produced it, with its weight and its reasoning shown. Plus position sizing from your own risk settings. |
| **Wire** | Scored headlines. Each one gets a sentiment score, a tier, a channel (rates vs risk) and a mega-cap tag. Click any story to see exactly which patterns fired. Paste your own headline to score it. |
| **Catalysts** | A three-day economic calendar generated from each release's publication rule, with countdowns and the no-trade windows around tier-1 prints. |
| **Tape** | Quotes for the correlated complex (ES, VIX, 10Y, DXY, gold, crude, BTC) plus the NQ–ES spread, and the level ladder — overnight high/low, prior day high/low/close, initial balance, VWAP. |
| **Playbook** | Seven named setups with live condition checks. A setup is *armed* only when every condition is met; otherwise you see which ones are missing. |
| **Journal** | Log the read you took and what it did. The stats compare the bias score on your winners against your losers — that is the number that tells you whether to raise or lower your threshold. |
| **Analyst** | Asks Claude, with the whole console state as context. It cannot browse, so it will not invent a headline that is not on your wire. |
| **Settings** | Theme, macro regime, reference price, risk per trade, instrument (NQ or MNQ), engagement thresholds, and the snapshot loader. |

---

## The bias score

Six factors, each scored −100…+100, then weighted:

| Factor | Weight | What it reads |
|---|---|---|
| News tape | 24% | Recency-weighted mean of headline scores over 4 hours, 45-minute half-life, weighted by source tier and story tier |
| Catalyst posture | 16% | Pending tier-1 event → neutral by construction. After a print → the *reaction* in the macro channel, not the number |
| Rates & dollar | 18% | 10-year yield and DXY, both inverse to the multiple |
| Risk appetite | 18% | VIX change, and whether NQ is leading or lagging ES |
| Session structure | 14% | Price against VWAP, the overnight range and the prior day's range |
| Mega-cap torque | 10% | Stories on the top-weight names — the top seven are ~45% of index weight |

**Confidence** is 45% factor agreement + 35% session liquidity + 20% how fresh
the tape is.

**Gates** override direction entirely and force a stand-down: a closed or
halted market, the window either side of a tier-1 print, pre-release volatility
compression, lunch chop with no edge, and low confidence. The model is allowed
to say *no trade*, and most of the day it does.

### The regime switch matters more than anything else

In **Settings → Macro regime** you choose whether good economic news is good or
bad for the index. In an inflation-fighting regime a hot jobs number is bearish
for NQ because it pushes the discount rate up; in a growth regime the same
number is bullish. The switch flips the sign of the rates channel — set it
wrong and half the model is inverted.

---

## Real data

The published page runs in a sandbox that cannot make cross-origin requests, so
it cannot fetch a feed itself. The fetcher does it on your machine and hands the
result over as a file:

```bash
npm run feed          # writes data/feed.json
npm run feed:print    # and prints the headlines
```

Then in the OS: **Settings → Load a snapshot → paste `data/feed.json` → Load**.
That replaces the simulated tape with real quotes, real session levels
(overnight high/low, prior day range, initial balance, VWAP computed from the
5-minute bars) and a real wire. The snapshot is stored, so it survives a reload.

**Sources — all free, no API key:**

- Federal Reserve press releases and speeches, BLS releases, Treasury releases
- CNBC top news and technology, MarketWatch top stories, Yahoo Finance
- Google News search feeds for Reuters, `"Nasdaq 100"`, the mega-cap names, and
  the macro calendar terms
- Yahoo Finance chart endpoints for NQ=F, ES=F, RTY=F, ^VIX, ^TNX, DX-Y.NYB,
  GC=F, CL=F, BTC-USD

Feeds that block or rate-limit are skipped with a note and the rest still land.
Re-run it whenever you want a fresh read; there is nothing to schedule and
nothing leaves your machine.

---

## Layout

```
os/index.html        the whole OS — one file, no build step, no dependencies
feed/fetch-news.mjs  the fetcher: RSS + quotes + session levels -> data/feed.json
feed/sources.mjs     source registry, tiers and endpoints
data/feed.json       the snapshot you paste into the OS (git-ignored)
```

`npm run serve` serves `os/` locally if you want to run it outside the Artifact
viewer. The Analyst app needs the Artifact runtime, so it is off in that mode;
everything else — scoring, calendar, factors, playbook, journal — is computed in
the page and works anywhere.

---

## Calendar accuracy

Events are generated from publication rules, not from a hardcoded list, so the
board never goes stale: NFP on the first Friday, CPI the 10th–13th, PPI and
retail sales mid-month, PCE at month-end, ISM on the first and third business
days, claims every Thursday, opex on the third Friday, quad witching quarterly.

**FOMC dates follow the usual meeting cadence and shift by about a week in some
years — check them against the Fed's own calendar before you trade them.**

---

## Not advice

This is decision-support software. Nothing it produces is a recommendation to
buy or sell anything. Futures are leveraged and you can lose more than you
deposit. The tape is simulated until you load a snapshot, and every number the
OS shows you comes with its reasoning so you can disagree with it.
