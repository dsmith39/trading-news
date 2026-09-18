# Session log

What has been built, why it was built that way, and what went wrong on the road
there. Newest session first.

**This file is maintained by hand and must be updated with every change** — see
[CLAUDE.md](CLAUDE.md#the-session-log). An entry is worth writing when it
records a decision, a constraint, or a defect; a typo fix is not worth an entry.

---

## Session 1 — 18 September 2026

Built the whole thing, from empty repository to a live site on a custom domain
with CI.

### What it is

A single-file browser "OS" for trading Nasdaq-100 futures off news, scheduled
catalysts and sentiment, backed by a scheduled Lambda that pulls free feeds.
Live at **https://nq.nightowltradinggroup.com**.

### The work, in order

| Commit | What |
|---|---|
| `fe37c8f` | The OS: eight apps, a six-factor scoring engine, a rule-generated economic calendar, and a free-feed fetcher (1,902 lines) |
| `5fffe97` | AWS deployment — S3 + CloudFront + a scheduled Lambda — and the OS learned to read its own `feed.json` |
| `b4da7d6` | Vendored `@aws-sdk/client-s3` rather than trusting the runtime to bundle it |
| `072f697` | Only pass analyst parameters when a key is supplied |
| `69015bb` | Custom domain behind one flag, with zone and certificate discovery |
| `2998c1b` | Replaced the Claude-backed Analyst with a prompt builder, removing the API key, the public endpoint and all per-question cost |
| `ee24e47` | Deploy from GitHub Actions via OIDC instead of by hand |
| `90c7556` | Keep the AWS account id out of public Actions logs |
| `83bd345` | Accept GitHub's immutable-id OIDC subject claim |
| `e76862c` | Grant `lambda:GetFunctionConfiguration` to the deploy role |
| `8f91949` | Stop mixing real and simulated session levels; fix the vendoring |
| `61165b0` | Distinct phone and tablet shells, not a scaled-down desktop (548 lines) |
| `b8312ab` | A pull-request check, and deploy from `main` |
| `1970e94` | `CLAUDE.md` — conventions and traps (PR #1) |
| `2564253` | Plain English across every screen (PR #2, 594 lines) |
| `40941e3` | Keep an expanded News headline expanded — state held in the DOM was wiped by the two-second redraw (PR #3) |
| `02e4024` | This log, and the rule in `CLAUDE.md` to keep it updated (PR #4) |
| `PR #5` | Correcting this table, which recorded two PRs as open and was wrong within the minute |
| `9e3210a` | Read sixteen markets, not one — futures, FX, crypto, single stocks — plus options expected-move, and one shared Lambda packager (PR #6) |
| `PR #7` | The console reads them: market picker, driver-based factors, news weighted by how much it could read, options panel |

### Decisions worth remembering

- **Static site plus a scheduled function**, not a server. No load balancer, no
  NAT gateway, no database, nothing running between pulls. That shape is why it
  costs effectively nothing rather than the $3–5/month a small instance would.
- **No model in the stack.** The Analyst was replaced by a Brief app that
  assembles a prompt you paste into Claude yourself. That removed an API key, a
  public Function URL, a shared secret and every per-question cost, and left the
  stack with no credential and nothing accepting input from the internet.
- **The scoring engine is not AI**, deliberately. A keyword lexicon and a
  weighted sum are auditable and reproducible; you can click any headline and
  see which patterns fired.
- **A dedicated CI role, not the account's shared one.** The existing
  `Github-Actions` role enumerates buckets belonging to other projects, and
  `PutRolePolicy` replaces a policy wholesale — one bad edit would have broken
  unrelated deploys.
- **Content and infrastructure deploy differently.** Actions ships the page and
  the function code; `aws/deploy.sh` owns the stack. That split is what keeps
  the CI role as small as it is.

### Defects found, and how

Five of the six were only visible in production or from outside the code.

| Defect | How it was found |
|---|---|
| OIDC trust never matched — GitHub sends immutable-id subjects | CloudTrail. The role, provider and audience all read correct |
| `aws lambda wait function-updated` needs `GetFunctionConfiguration`, not `GetFunction` | A deploy that died *after* `update-function-code` had succeeded |
| `npm` walks up for a `package.json`, so vendoring silently installed to the repo root | Lambda `CodeSize` of 5,125 bytes — the step itself passed |
| Live feed merged over simulated levels, so a real price was measured against an invented VWAP while the bar read LIVE | A deploy that happened to land at 00:32 ET, when VWAP does not exist |
| A level above the price displayed its distance as negative | Reading the rendered output |
| A verdict that could not fund one contract said "sit it out", as though the market were shut | Same |

The fourth is the one that mattered: session structure weights VWAP more than
anything else it looks at, so the score was partly reading fiction. In daylight
it would have looked fine.

### Reading more than one market

The scorer's own numbers made the case: on 58 live headlines, **54 scored zero**
and two of the four that scored were wrong-signed. The news factor carried the
largest weight (24%) while reading almost nothing. Two of its misses were BOJ
stories — which matter to the Nasdaq through the yen carry trade, so the fault
was never that Japan is irrelevant, it was that a keyword list reads words and
not sentences. "Stocks rise, yen weakens as BOJ split-vote hike tempers hawkish"
scored −46 on `hike` and `hawkish` alone.

`feed/instruments.mjs` now declares sixteen markets and, for each, a `drivers`
map saying which series move it and in which direction: a weaker yen lifts the
Nikkei, a weaker dollar lifts crude and bitcoin, rising yields press the Nasdaq.
That is what lets one engine serve several markets rather than one.

Options come from **CBOE's free delayed endpoint**. Yahoo's options API now
returns `Invalid Crumb` — an anti-scraping gate — and was rejected as a
load-bearing dependency for that reason; its chart endpoint is unaffected. Each
chain yields the at-the-money straddle, which is the move the market is paying
for. Two expiries are reported for two different questions: the one dated today
answers "how much further before the close", the next one out answers "is this
already priced", which is the one worth asking of a headline.

### One engine, sixteen markets

The console now reads whichever market is picked, and the factor model is built
from each instrument's `drivers` map rather than hardcoded to the Nasdaq. What
that produces is per-market rather than relabelled: the Nikkei's rates factor
reads "the yen (up = weaker yen) +0.44% (helps) · the US borrowing rate +1.07%
(hurts)" and explains the carry trade underneath, while the euro drops the mood
and company factors entirely because it has neither a volatility driver nor a
partner market. Weights re-spread to sum to one whenever a factor is dropped or
scaled, so losing an input cannot quietly shrink every score.

**The news factor's weight now scales with how much of the wire it could
actually read.** Measured on the live feed it falls to 4% for the Nikkei, crude,
gold and crypto — where it scored almost nothing — and holds its full 24% for
the euro, where it read well. Counting silence as "neutral" was letting the
largest-weighted input speak with authority it had not earned.

### Options, and the one question they answer cheaply

The at-the-money straddle is what the market charges to be wrong about
direction, so it is the move being paid for. Comparing it with what has already
happened answers "is this news already in the price?".

The first version of that gate was wrong and the numbers caught it. It compared
the day's move against the straddle expiring **today** — which prices only the
minutes still left and decays toward zero, so it fired on four of sixteen
markets and would have fired nearly every afternoon. Against the forward expiry
it behaves: Tesla at 1.49% against ±2.04% priced correctly stops firing, while
the Nasdaq at 1.06% against ±0.68% correctly still does. Comparing like with
like was the whole fix.

### Traps found this round

- **The Lambda package's file list lived in two places.** `core.mjs` gained an
  import; `deploy.sh` and the workflow each copied three named files. The zip
  would have shipped without a module it imports, and nothing would have caught
  it — `node --check` does not resolve imports. There is now one packager,
  `aws/package-feed.sh`, used by the deploy, the workflow and a new CI step that
  builds the package and imports it. Verified by building the old three-file
  package and watching it fail on the missing module.
- **Two instrument keys can share a symbol** — `usdjpy` the instrument and `jpy`
  the context series are the same tape. Fetching per key made 21 calls for 19
  symbols; it now fetches per symbol and fans out.

### Also worth knowing

- **Status does not belong in this log.** The entry above originally listed two
  pull requests as "open" and was wrong within the minute, because they were
  merged immediately after. A log records what happened and what was learned;
  what is currently open belongs in the pull request list, which maintains
  itself. Write entries that stay true.
- A commit was nearly lost. The plain-English rewrite sat on a branch that had
  been declared safe to delete; a re-check before deleting found it. "I verified
  this earlier" has a shelf life when something else can still write to what you
  verified.
- The CI checks prove things **parse**. Not one of the defects above would have
  been caught by them.

### State at end of session

- Live on the custom domain, feed refreshing every 10 minutes on weekdays
- `main` is default and deploys; PRs gated by `check.yml`
- One CloudFormation stack in `us-east-1`, effectively $0/month
- The account's shared `Github-Actions` role also fixed for immutable-id claims
- 19 commits, the last four through the pull request flow, all deploys verified
  against the live site rather than trusted from a green check
- **Needs a human:** merged branches await deletion — this environment's git
  proxy blocks ref deletion, and the GitHub tooling available here has no
  delete-branch call
