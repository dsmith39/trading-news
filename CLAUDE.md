# NQ Trading OS — working notes

A windowed desktop for trading Nasdaq-100 futures off news, scheduled catalysts
and sentiment. Live at **https://nq.nightowltradinggroup.com**.

## The session log

[SESSIONS.md](SESSIONS.md) records what has been built, why it was built that
way, and what went wrong getting there.

**Update it as part of every change to the codebase or the project — in the same
commit, not afterwards.** A change is not finished until its entry exists. This
applies to infrastructure, configuration and process changes too, not only code:
several of the costliest problems here lived in an IAM policy and a workflow
file, not in the repository's source.

An entry records what changed, why, the commit or PR, and anything learned that
the diff does not show — a constraint discovered, a failure and its cause, a
decision and the option it beat. Skip it only for changes that teach nothing, a
typo fix being the clear case.

The reason is concrete: every defect in this project so far was invisible from
the code and cost a failed deploy to find. Written down they cost nothing to
avoid; undocumented they get rediscovered by whoever comes next, including a
later session of Claude with no memory of this one.

## Branching

Feature branches off `main`, merged by pull request. **Do not commit directly to
`main`** — it is what deploys. `check.yml` gates every PR.

```bash
git checkout main && git pull
git checkout -b <type>/<short-name>
# ... work ...
git push -u origin <type>/<short-name>   # then open a PR into main
```

## What deploys, and what does not

| Change | How it ships |
|---|---|
| `os/index.html`, `feed/**`, `aws/lambda/**` | merge to `main` → `deploy.yml` |
| `aws/stack.yaml` (infrastructure) | a deliberate `./aws/deploy.sh` run |

That split is why the CI role is tiny: it can replace the page, update and invoke
the feed function, invalidate one distribution, and read one stack's outputs.
Nothing else. A stack change needs credentials Actions does not have.

## Layout

```
os/index.html          the entire OS - one file, no build step, no dependencies
feed/core.mjs          RSS parsing, quote pulls, session-level derivation
feed/sources.mjs       source registry and endpoints
feed/instruments.mjs   the sixteen markets, and what drives each of them
feed/score.mjs         the headline scorer - a second copy of the page's block
feed/history.mjs       the scorer's track record: prices in, forward returns out
feed/fetch-news.mjs    local CLI -> data/feed.json + data/history.json
feed/score-report.mjs  local CLI -> what the scorer has been worth
aws/stack.yaml         S3 + CloudFront + DNS + scheduled Lambda + CI role
aws/deploy.sh          one-command infrastructure deploy
aws/package-feed.sh    the Lambda zip's file list, in one place
aws/lambda/feed/       the scheduled fetcher (shares everything in feed/)
tools/                 the checks check.yml runs
```

## Checking your work

Before pushing:

```bash
node -e 'const fs=require("fs");const m=fs.readFileSync("os/index.html","utf8").match(/<script>([\s\S]*)<\/script>/);fs.writeFileSync("/tmp/os.js",m[1])' && node --check /tmp/os.js
node --check feed/core.mjs && node --check aws/lambda/feed/index.mjs
bash -n aws/deploy.sh
node tools/check-scorer.mjs    # the page's scorer and feed/score.mjs still match
node tools/check-history.mjs   # the forward-return bookkeeping still holds
npm run serve      # drop a data/feed.json beside os/ and it behaves as deployed
```

`check.yml` runs exactly these. Most of them prove things **parse** — they do not
catch runtime or environment behaviour, which is where every real defect here has
come from. The two in `tools/` are the exceptions and the only behavioural checks
in the repo: they guard the places where being wrong leaves no trace, a scorer
that has drifted out of step with the page and a forward return measured from the
wrong moment. Add to them rather than starting a framework.

## Invariants worth keeping

- **Never present simulated data as real.** The tape is a random walk until a
  snapshot loads. A live feed that cannot compute a level (VWAP and the initial
  balance do not exist before the cash session) must leave it absent rather than
  fall back to a seeded value — the structure factor weights VWAP heavily, and a
  real price measured against an invented one is worse than no reading.
- **A measurement may not flatter the thing it measures.** The forward-return
  log records the entry at the moment the feed *saw* a headline, not the time
  the publisher stamped on it, and leaves a horizon blank when no price sits
  near it. Both rules cost readings. Both exist because breaking either makes
  the scorer look better than it is, and a scoreboard that cheats is worse than
  no scoreboard.
- **The score is not AI.** Headline sentiment is a keyword lexicon split into a
  rates channel and a risk channel; the composite is a weighted sum. Only the
  Brief app involves a model, and it only assembles a prompt for you to paste.
- **The model is allowed to say "no trade"**, and most of the day it should.
  Gates override direction entirely.
- **One file, three runtimes.** `os/index.html` must work as a published
  artifact, on AWS serving its own `feed.json`, and from any static server.

## AWS

Region `us-east-1`, stack `nq-trading-os`, account-scoped resources all prefixed
`nq-trading-os-`. Feeds refresh every 10 minutes on weekdays via EventBridge.
Cost is effectively zero — it is inside the perpetual free tiers.

## Traps already paid for

- **OIDC subject claims.** GitHub issues this repo's token as
  `repo:owner@<ownerid>/name@<repoid>:ref:...`, not `repo:owner/name:ref:...`.
  Trust policies must match both shapes. CloudTrail carries the real claim; the
  role and provider look correct either way, so reading them tells you nothing.
- **`npm` walks up for `package.json`.** This repo has one at its root, so
  installing into a subdirectory without its own manifest silently installs to
  the root and ships an incomplete zip.
- **`aws lambda wait function-updated`** polls `lambda:GetFunctionConfiguration`,
  which is a different action from `lambda:GetFunction`.
- **ACM certificates for CloudFront must live in `us-east-1`**, whatever region
  the rest of the stack is in.
- **Never update this stack blind — use a change set and read every line of it.**
  Two things hide there. `FeedFunction` carries a placeholder `ZipFile` in the
  template while the real package is pushed afterwards by `deploy.yml`, so an
  update that re-applied `Code` would blank the feed; capture `CodeSha256`
  before and compare it after. And a resource you did not intend to change
  appearing in the list means the deployed template has drifted from this
  repository's — which it had, because two IAM fixes were once applied straight
  to the role and never through CloudFormation. The role read correct; the
  stack's record of it did not.

## Not advice

Decision-support software. Nothing it produces is a recommendation to buy or
sell anything, and the bias score is a weighted opinion, not a backtested edge.
The journal exists so its value can be measured against real trades.
