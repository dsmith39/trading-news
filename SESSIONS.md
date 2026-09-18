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
| PR #3 | Keep an expanded News headline expanded — state held in the DOM was wiped by the two-second redraw |
| PR #4 | This log, and the rule in `CLAUDE.md` to keep it updated |

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

### Also worth knowing

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
- **Open:** PR #3 (News headline stays expanded) and PR #4 (this log)
- **Needs a human:** three merged branches await deletion — this environment's
  git proxy blocks ref deletion
