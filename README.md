# NQ Trading OS

A windowed desktop for trading **Nasdaq-100 futures** off the news, the economic
diary and the mood of the market. It is built around one opinion: most of the
day there is no trade worth taking, and the job of a news tool is to tell you
*which* hours are worth risking money in — not to manufacture a signal every
five minutes.

**Everything it says, it says in plain English.** You should be able to read any
screen in it without knowing what a tick, a print or a basis point is: it says
"today's average price" rather than VWAP, "the fear gauge" rather than the VIX,
"betting on a rise" rather than long. The trading terms are still there where
you would want them — in tooltips, in brackets, and in a short glossary at the
bottom of Settings — but you never have to know one to use the thing.

Run it as a published Artifact (a browser desktop, nothing to install), and feed
it real data with the fetcher in this repo. It is one page with three shells — a
windowed desktop, a two-pane tablet layout and a single-app phone layout — and
it picks the right one at runtime.

---

## What's in it

| Panel | What it does |
|---|---|
| **Verdict** | One of five answers — sit it out, no clear signal, watch, leaning up/down, strongly up/down — with a sentence saying why in plain words. Underneath: the score from −100 to +100, all six inputs that produced it with their weights and reasoning, and, if you did trade it, how much to buy and where to get out, worked out from your own risk settings. |
| **News** | Every headline scored from −100 to +100 for what it means for *this index*, not for whether it is good news in general. Tap any story to see the reasoning: which way it reads, whether it is about the economy or about company performance, how much the source is trusted and how much the story has aged. Paste your own headline to score it. |
| **Diary** | Three days of scheduled events, with a plain description of what each one measures and a countdown. The big ones are exactly where the tool tells you to stand aside. |
| **Prices** | The Nasdaq-100 and the eight things that move with it (or against it), each named rather than tickered: the wider market, the fear gauge, the US borrowing rate, the dollar, gold, oil, bitcoin. Plus the prices worth watching today — yesterday's high and low, the overnight range, the first-hour range, the day's average price — and how far away each one is. |
| **Patterns** | Seven situations that come up again and again, each with its conditions ticked off live. A pattern is *all set* only when every line is ticked, and even then it is a prompt to look, not an instruction to trade. |
| **Journal** | Note down what you did and what happened. The stats compare the score on the trades that worked against the ones that did not — that is the number that tells you whether to be fussier or less fussy. |
| **Ask Claude** | There is no AI in the page. This gathers everything the dashboard knows — the score and why, prices, news, what is scheduled, your own record — into one message you paste into Claude yourself. It asks for an answer in plain English too. Pick a question, choose what to include, copy. No key, no cost, any model you like. |
| **Settings** | Appearance, whether good economic news is currently good or bad for shares, your risk limits, how fussy the tool should be, where to paste real data — and a glossary of the words you will still meet. |

---

## One page, three shells

The same `os/index.html` reshapes itself around the device it lands on. The
layout engine writes `data-mode` and `data-orient` onto `<html>`, and both the
stylesheet and the window manager read it from there — so the CSS and the JS can
never disagree about which shell is running.

| Shell | When | What you get |
|---|---|---|
| **Phone** | viewport ≤ 700px wide, or a touch device whose short side is ≤ 480px (a phone held sideways) | One full-bleed app at a time. Compact two-row header with the live ticker, a bottom tab bar for Verdict / News / Diary / Prices, and a **More** sheet for Patterns, Journal, Ask Claude and Settings. No title bars, no dragging — thumb-sized targets and 16px inputs so iOS does not zoom on focus. |
| **Tablet** | up to 1180px wide, or a touch device whose short side is ≤ 1024px | Two tiled panes, each with its own tab strip. Pane **A** is the reference column (Verdict by default), pane **B** the working column. The ⇄ button moves an app between panes. Landscape puts the apps in a left icon rail; portrait stacks the panes and keeps the dock at the bottom. |
| **Desktop** | wider than 1180px with a fine pointer | The original free-floating window manager, unchanged — drag, resize, minimise, maximise, z-order. |

Crossing a breakpoint rebuilds the shell around whatever is already open. The
windows and their rendered state are reused, never thrown away, so rotating a
tablet or dragging a desktop window narrow does not cost you your place. A
window the shell is not currently showing is marked dirty instead of being
redrawn on every two-second tick, and caught up the moment it comes back on
screen.

There is no user-agent sniffing and no second HTML file to keep in sync: one
document, served from the same S3 object to every device, deciding at runtime.

---

## The score

Six inputs, each scored −100…+100, then blended. The name in the first column is
what the app calls it on screen; the second is the same thing in trader shorthand,
for anyone who wants to check the arithmetic.

| What it looks at | In trader terms | Weight | What it reads |
|---|---|---|---|
| What the news is saying | news tape | 24% | Average headline score over 4 hours, newer stories counting for more (45-minute half-life), weighted by how trusted the source is and how big the story is |
| Big announcements due | catalyst posture | 16% | Something major pending → neutral by construction, because nobody knows. Just after one → the *reaction*, not the number |
| Interest rates and the dollar | rates & dollar | 18% | The 10-year yield and the dollar index, both of which this index tends to move opposite to |
| How brave the market feels | risk appetite | 18% | The VIX, and whether the Nasdaq is leading or lagging the S&P 500 |
| Where the price sits today | session structure | 14% | Price against VWAP, the overnight range and yesterday's range |
| The giant companies | mega-cap torque | 10% | Stories on the top-weight names — the top seven are ~45% of the index |

**How sure it is** ("confidence") is 45% whether those six agree with each other,
35% how many people are trading at this hour, 20% how fresh the news is.

A handful of conditions **override the direction entirely** and simply say stay
out: a closed or halted market, the minutes either side of a big announcement,
the quiet compression before one, a directionless lunchtime, and the six inputs
disagreeing. The model is allowed to say *no trade*, and most of the day it does.

### One setting matters more than all the others

In **Settings → "What is the market worried about?"** you choose whether good
economic news is currently good or bad for share prices. When central banks are
fighting inflation, a strong jobs report is bad news for the index, because it
means rates stay high for longer and future profits are discounted harder; when
growth is the worry, the same report is good news. The switch flips the sign of
everything read on the economy — set it wrong and half the tool is inverted.

---

## Real data

The published page runs in a sandbox that cannot make cross-origin requests, so
it cannot fetch a feed itself. The fetcher does it on your machine and hands the
result over as a file:

```bash
npm run feed          # writes data/feed.json
npm run feed:print    # and prints the headlines
```

Then in the app: **Settings → Real prices and real news → paste `data/feed.json`
→ Use this data**. That replaces the made-up prices with real ones, the example
headlines with real news, and fills in the prices worth watching (the overnight
high and low, yesterday's range, the first-hour range and the day's average
price, all computed from 5-minute bars). It is stored, so it survives a reload.

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
endpoint, nothing to rate-limit or leak. The Ask Claude panel produces a prompt;
you decide what to do with it.

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

### Continuous deployment

`.github/workflows/deploy.yml` ships the page and the feed function's code on
every push to `main` that touches them, and on demand from the Actions tab.
`.github/workflows/check.yml` runs on every pull request and parses the OS's
inline script, the feed sources, the shell scripts and the stack template — it
holds no credentials and deploys nothing.

Work goes on a branch and merges to `main` through a pull request; `main` is
what deploys.

The split is deliberate: **Actions deploys content, `deploy.sh` manages
infrastructure.** Anything that changes the stack — the schedule, the domain,
the cache policy — is a `./aws/deploy.sh` run. That is why the role Actions
assumes can do so little: replace the page, update and invoke the feed function,
invalidate this one distribution, read this one stack's outputs. It cannot edit
the stack, reach another bucket, or see anything else in the account.

One-time setup, assuming you already have a
`token.actions.githubusercontent.com` OIDC provider (most AWS accounts that
deploy from GitHub do):

```bash
./aws/deploy.sh --domain nq.example.com --github-repo owner/repo
gh secret set AWS_DEPLOY_ROLE_ARN --repo owner/repo --body "<the ARN it prints>"
```

`--github-repo` creates a role trusted only by that repository, via the OIDC
provider — no access keys, nothing long-lived in GitHub. It goes in a *secret*
rather than a variable because a public repository has public Actions logs, and
secrets are masked there while variables are not. The workflow reads the
bucket, distribution and function names from the stack at run time rather than
hardcoding them, which matters here because the bucket name contains the account
id and this repo is public.

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
diary never goes stale: the jobs report on the first Friday, inflation figures
the 10th–13th, wholesale prices and retail sales mid-month, the Fed's preferred
inflation gauge at month-end, the business surveys on the first and third
business days, unemployment claims every Thursday, monthly options expiry on the
third Friday, the quarterly expiry four times a year.

**Interest-rate decisions follow the usual meeting cadence and shift by about a
week in some years — check them against the Fed's own calendar before you trade
them.**

---

## Not advice

This is a tool for thinking, not financial advice. Nothing it produces is a
recommendation to buy or sell anything. Futures are borrowed money by design:
losses are magnified exactly as gains are, and you can lose more than you put
in. The prices are made up until you load real ones, and every number the app
shows you comes with its reasoning, in plain words, so that you can disagree
with it.
