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
| **Brief** | Assembles everything the console knows into one prompt — factors, gates, tape, levels, wire, calendar, playbook, your risk parameters — and you paste it into Claude yourself. Pick an angle, toggle the sections, copy. No key, no cost, any model you like. |
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

If you deploy to AWS (below), skip all of this — the OS reads its own feed and
refreshes itself.

**Sources — all free, no API key:**

- Federal Reserve press releases and speeches, SEC press releases
- WSJ Markets, CNBC top news and technology, MarketWatch top stories,
  Yahoo Finance, Nasdaq markets
- Google News search feeds for Reuters, `"Nasdaq 100"`, the mega-cap names, and
  the macro calendar terms — these also pick up the BLS and Treasury releases,
  whose own feeds either block datacenter IPs or no longer resolve
- Yahoo Finance chart endpoints for NQ=F, ES=F, RTY=F, ^VIX, ^TNX, DX-Y.NYB,
  GC=F, CL=F, BTC-USD

A pull that reaches every source returns around 90 fresh headlines and all nine
quotes. Feeds that block or rate-limit are skipped with a note and the rest
still land, so one bad source never blanks the wire.

---

## Run it on AWS

The published Artifact runs in a sandbox that cannot make cross-origin requests,
so it can never fetch a feed itself. On AWS the server does the fetching, and
the OS just reads a file next to itself — **no pasting, always current, and it
works from your phone**.

```bash
./aws/deploy.sh                              # CloudFront URL
./aws/deploy.sh --domain nq.example.com      # your own hostname
```

One command. It creates the stack, packages and ships the Lambda, uploads the
page, runs the first feed pull, and prints your URL. Re-run it any time to
update. `./aws/destroy.sh` removes everything.

There is no server-side model anywhere in this stack — no API key, no inference
endpoint, nothing to rate-limit or leak. The Brief app produces a prompt; you
decide what to do with it.

### Architecture

```
EventBridge (every 10 min, weekdays)
      │
      ▼
  Lambda  ── free RSS + Yahoo chart endpoints ──▶  feed.json ──▶ S3
  (arm64, ~20s)                                                   │
                                                                  ▼
                                              CloudFront ──▶  your browser
```

No load balancer, no NAT gateway, no database, no container, nothing running
between pulls. That is the whole reason it costs nothing.

### What it costs

At personal usage — one or two viewers, a feed pull every 10 minutes on
weekdays (~3,200 runs a month):

| Service | Usage | Monthly |
|---|---|---|
| S3 | ~250 KB stored, a few thousand requests | under $0.01 |
| CloudFront | well inside the perpetual free tier (1 TB out, 10M requests) | $0.00 |
| Lambda — feed | ~3,200 runs × ~20s × 512 MB arm64 ≈ 33,000 GB-s, against a 400,000 GB-s free tier | $0.00 |
| EventBridge | ~3,200 scheduled invocations | under $0.01 |
| CloudWatch Logs | a few MB at 14-day retention, against a 5 GB free tier | $0.00 |
| **Total** | | **effectively $0** |

The CloudFront, Lambda, and CloudWatch Logs free tiers are perpetual, not
12-month. S3's 5 GB free tier is 12-month only — after it lapses, 250 KB costs
about $0.000006 a month. Worst realistic case if every free tier vanished:
still well under a dollar.

The one thing that could change that is a **new** Route 53 hosted zone, at
$0.50/month. If you already host the zone, a custom domain is free — the alias
records and the ACM certificate both cost nothing.

Compare against the alternatives: Lightsail is $5/month, the smallest sensible
EC2 instance plus its EBS volume is around $3–4/month, and both bill whether or
not you look at the page. Static hosting plus a scheduled function is the
cheapest shape that actually does the job.

### Options

```bash
./aws/deploy.sh --domain nq.example.com                  # custom hostname
./aws/deploy.sh --region eu-west-1                       # anywhere you like
./aws/deploy.sh --schedule "cron(0/30 13-21 ? * MON-FRI *)"  # US session only, half-hourly
./aws/deploy.sh --project nq-os-test                     # a second, independent stack
```

Cheaper still: a wider schedule interval is the only dial that matters, and even
every 10 minutes is free. Pick the cadence you actually want, not the one you
think you can afford.

### A custom domain

```bash
./aws/deploy.sh --domain nq.example.com
```

That is the whole thing. The script finds the Route 53 hosted zone that covers
the hostname (longest matching suffix, so `staging.example.com` wins over
`example.com` where both exist) and an issued ACM certificate that covers it,
including via a wildcard. It then adds the hostname as a CloudFront alias and
creates A and AAAA alias records pointing at the distribution.

Certificates must live in **us-east-1** — CloudFront accepts them from no other
region, whatever region the rest of the stack is in. The script pins that region
for its certificate lookups regardless of `--region`.

If no certificate covers the hostname, the script stops and prints the three
commands to request and validate a free one, rather than guessing. Override
either lookup with `--zone-id` or `--cert <arn>`.

The CloudFront domain keeps working alongside the custom one, and the deploy
prints both — useful in the minutes before DNS settles.

### Security notes

- The S3 bucket is fully private; only CloudFront can read it, through an
  Origin Access Control.
- The feed Lambda can write exactly one object — `feed.json` — and nothing else.
- Nothing in the stack accepts input from the internet. There is no API, no
  endpoint and no credential anywhere in it; the only moving part is a scheduled
  job that reads public feeds and writes one file.


---

## Layout

```
os/index.html          the whole OS — one file, no build step, no dependencies
feed/core.mjs          the fetch logic: RSS parsing, quotes, session levels
feed/sources.mjs       source registry, tiers and endpoints
feed/fetch-news.mjs    local CLI wrapper -> data/feed.json
aws/stack.yaml         CloudFormation: S3 + CloudFront + scheduled Lambda
aws/deploy.sh          one-command deploy; aws/destroy.sh removes it all
aws/lambda/feed/       the scheduled fetcher (shares feed/core.mjs)
data/feed.json         the local snapshot (git-ignored)
```

The same `os/index.html` runs anywhere: as a published Artifact, on AWS where it
serves its own `feed.json`, or from any static server via `npm run serve`. No
build step and no model — every number it shows is computed in the page.

`npm run serve` serves `os/` locally. Drop a `data/feed.json` next to it and the
OS picks it up the same way it does on AWS. Every app works identically in all
three places, because none of them depends on anything outside the page.

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
