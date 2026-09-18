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

If you deploy to AWS (below), skip all of this — the OS reads its own feed and
refreshes itself.

**Sources — all free, no API key:**

- Federal Reserve press releases and speeches, BLS releases, Treasury releases
- CNBC top news and technology, MarketWatch top stories, Yahoo Finance
- Google News search feeds for Reuters, `"Nasdaq 100"`, the mega-cap names, and
  the macro calendar terms
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
./aws/deploy.sh                    # site + scheduled feed
./aws/deploy.sh --key sk-ant-...   # ...and the Analyst endpoint
```

One command. It creates the stack, packages and ships both Lambdas, uploads the
page, runs the first feed pull, and prints your URL. Re-run it any time to
update. `./aws/destroy.sh` removes everything.

### Architecture

```
EventBridge (every 10 min, weekdays)
      │
      ▼
  Lambda  ── free RSS + Yahoo chart endpoints ──▶  feed.json ──▶ S3
  (arm64, ~20s)                                                   │
                                                                  ▼
                                              CloudFront ──▶  your browser
                                                   ▲              │
                                   (optional) Lambda Function URL ─┘
                                              └─ Claude API, for the Analyst
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

Two things would change that, and neither is on by default:

- **A custom domain.** A Route 53 hosted zone is $0.50/month. The CloudFront
  domain the deploy prints is free, so skip this unless you want a pretty URL.
- **The Analyst.** Only deployed if you pass `--key`. It defaults to
  `claude-haiku-4-5` ($1.00 / $5.00 per million input / output tokens) with
  output capped at 900 tokens. A question sends roughly 2–3k tokens of console
  state, so each one costs well under a cent — call it $0.50 for a hundred
  questions in a month. Pass `--model claude-sonnet-5` ($2.00 / $10.00) if you
  want sharper reads, or `--model claude-opus-5` for the best of them.

Compare against the alternatives: Lightsail is $5/month, the smallest sensible
EC2 instance plus its EBS volume is around $3–4/month, and both bill whether or
not you look at the page. Static hosting plus a scheduled function is the
cheapest shape that actually does the job.

### Options

```bash
./aws/deploy.sh --region eu-west-1                       # anywhere you like
./aws/deploy.sh --schedule "cron(0/30 13-21 ? * MON-FRI *)"  # US session only, half-hourly
./aws/deploy.sh --model claude-sonnet-5 --max-tokens 1200    # a sharper analyst
./aws/deploy.sh --project nq-os-test                     # a second, independent stack
```

Cheaper still: a wider schedule interval is the only dial that matters, and even
every 10 minutes is free. Pick the cadence you actually want, not the one you
think you can afford.

### Security notes

- The S3 bucket is fully private; only CloudFront can read it, through an
  Origin Access Control.
- The feed Lambda can write exactly one object — `feed.json` — and nothing else.
- The Analyst endpoint is a public Function URL guarded by a shared token that
  `deploy.sh` generates and bakes into the page. That is enough to stop drive-by
  use, but the URL is not a secret: keep the output cap low, and set a billing
  alarm on your Anthropic account if you care. Your API key stays in the
  Lambda's environment and never reaches the browser.


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
aws/lambda/analyst/    optional Claude endpoint, only deployed with --key
data/feed.json         the local snapshot (git-ignored)
```

The same `os/index.html` runs in three places and adapts to each: as a published
Artifact (Claude answers the Analyst on the viewer's own account), on AWS
(serves its own `feed.json`, Analyst over HTTPS), and from any static server or
`npm run serve`.

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
