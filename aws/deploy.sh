#!/usr/bin/env bash
# Deploy NQ Trading OS to AWS. One command, no extra tooling beyond the AWS CLI.
#
#   ./aws/deploy.sh                          # site + scheduled feed (no LLM cost)
#   ./aws/deploy.sh --key sk-ant-...         # also deploy the Analyst endpoint
#   ./aws/deploy.sh --schedule "cron(0/30 * ? * MON-FRI *)"
#
# Re-run it any time: it updates the stack, the Lambda code and the page.
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT="nq-trading-os"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
SCHEDULE="cron(0/10 * ? * MON-FRI *)"
MODEL="claude-haiku-4-5"
MAX_TOKENS="900"
KEY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --project)   PROJECT="$2"; shift 2 ;;
    --region)    REGION="$2"; shift 2 ;;
    --schedule)  SCHEDULE="$2"; shift 2 ;;
    --key)       KEY="$2"; shift 2 ;;
    --model)     MODEL="$2"; shift 2 ;;
    --max-tokens) MAX_TOKENS="$2"; shift 2 ;;
    -h|--help)   sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

command -v aws  >/dev/null || { echo "aws CLI not found: https://aws.amazon.com/cli/" >&2; exit 1; }
command -v zip  >/dev/null || { echo "zip not found (apt install zip / brew install zip)" >&2; exit 1; }
aws sts get-caller-identity --region "$REGION" >/dev/null || { echo "AWS credentials not configured. Run: aws configure" >&2; exit 1; }

# The analyst endpoint is public, so it carries a shared token. Keep the same
# one across redeploys; CloudFormation cannot read a NoEcho parameter back.
TOKEN=""
TOKFILE="aws/.deploy-token"
if [ -n "$KEY" ]; then
  if [ -f "$TOKFILE" ]; then TOKEN="$(cat "$TOKFILE")"
  else TOKEN="$(openssl rand -hex 16 2>/dev/null || head -c16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
       printf '%s' "$TOKEN" > "$TOKFILE"; chmod 600 "$TOKFILE"; fi
fi

echo "==> stack: $PROJECT   region: $REGION"
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$PROJECT" \
  --template-file aws/stack.yaml \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
      ProjectName="$PROJECT" \
      FeedSchedule="$SCHEDULE" \
      AnthropicApiKey="$KEY" \
      AnalystModel="$MODEL" \
      AnalystMaxTokens="$MAX_TOKENS" \
      AnalystSharedToken="$TOKEN"

out() { aws cloudformation describe-stacks --region "$REGION" --stack-name "$PROJECT" \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }

BUCKET="$(out SiteBucket)"
DIST="$(out DistributionId)"
SITE="$(out SiteUrl)"
FEEDFN="$(out FeedFunction)"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

echo "==> packaging feed function"
mkdir -p "$TMP/feed"
cp aws/lambda/feed/index.mjs feed/core.mjs feed/sources.mjs "$TMP/feed/"
# The Node 22 managed runtime ships the AWS SDK, but vendoring the one client we
# use costs a few seconds and removes any dependency on that staying true.
if command -v npm >/dev/null; then
  ( cd "$TMP/feed" && npm install --silent --no-audit --no-fund --omit=dev @aws-sdk/client-s3 >/dev/null 2>&1 ) \
    && echo "    vendored @aws-sdk/client-s3" \
    || echo "    npm install failed - falling back to the runtime's bundled SDK"
fi
( cd "$TMP/feed" && zip -qr ../feed.zip . )
echo "    $(du -h "$TMP/feed.zip" | cut -f1) zip"
aws lambda update-function-code --region "$REGION" --function-name "$FEEDFN" \
  --zip-file "fileb://$TMP/feed.zip" --output text --query LastModified
aws lambda wait function-updated --region "$REGION" --function-name "$FEEDFN"

if [ -n "$KEY" ]; then
  echo "==> packaging analyst function"
  mkdir -p "$TMP/analyst"; cp aws/lambda/analyst/index.mjs "$TMP/analyst/"
  ( cd "$TMP/analyst" && zip -qr ../analyst.zip . )
  aws lambda update-function-code --region "$REGION" --function-name "${PROJECT}-analyst" \
    --zip-file "fileb://$TMP/analyst.zip" --output text --query LastModified
  aws lambda wait function-updated --region "$REGION" --function-name "${PROJECT}-analyst"
  # The token lives in the page, which is only reachable over your CloudFront URL.
  sed "s|__NQOS_TOKEN__|$TOKEN|" os/index.html > "$TMP/index.html"
else
  cp os/index.html "$TMP/index.html"
fi

echo "==> uploading the OS"
aws s3 cp "$TMP/index.html" "s3://$BUCKET/index.html" --region "$REGION" \
  --content-type "text/html; charset=utf-8" \
  --cache-control "public, max-age=60, must-revalidate" --only-show-errors

echo "==> first feed pull (takes ~20s)"
aws lambda invoke --region "$REGION" --function-name "$FEEDFN" \
  --cli-read-timeout 120 "$TMP/out.json" --output text --query StatusCode >/dev/null
cat "$TMP/out.json"; echo

aws cloudfront create-invalidation --distribution-id "$DIST" \
  --paths "/index.html" "/feed.json" --output text --query 'Invalidation.Status' >/dev/null

echo
echo "  $SITE"
echo
echo "  CloudFront takes a few minutes to go live the first time."
[ -n "$KEY" ] && echo "  Analyst: $(out AnalystEndpoint)  (model $MODEL, capped at $MAX_TOKENS tokens)"
echo "  Feeds refresh on: $SCHEDULE (UTC)"
echo "  Tear it all down with: ./aws/destroy.sh --project $PROJECT --region $REGION"
