#!/usr/bin/env bash
# Deploy NQ Trading OS to AWS. One command, no extra tooling beyond the AWS CLI.
#
#   ./aws/deploy.sh                          # site + scheduled feed (no LLM cost)
#   ./aws/deploy.sh --domain nq.example.com  # custom hostname on Route 53
#   ./aws/deploy.sh --github-repo owner/repo # add a scoped Actions deploy role
#   ./aws/deploy.sh --schedule "cron(0/30 * ? * MON-FRI *)"
#
# Re-run it any time: it updates the stack, the Lambda code and the page.
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT="nq-trading-os"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
SCHEDULE="cron(0/10 * ? * MON-FRI *)"
DOMAIN=""
ZONE_ID=""
CERT_ARN=""
GH_REPO=""

while [ $# -gt 0 ]; do
  case "$1" in
    --project)   PROJECT="$2"; shift 2 ;;
    --region)    REGION="$2"; shift 2 ;;
    --schedule)  SCHEDULE="$2"; shift 2 ;;
    --domain)    DOMAIN="$2"; shift 2 ;;
    --github-repo) GH_REPO="$2"; shift 2 ;;
    --zone-id)   ZONE_ID="$2"; shift 2 ;;
    --cert)      CERT_ARN="$2"; shift 2 ;;
    -h|--help)   sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

command -v aws  >/dev/null || { echo "aws CLI not found: https://aws.amazon.com/cli/" >&2; exit 1; }
command -v zip  >/dev/null || { echo "zip not found (apt install zip / brew install zip)" >&2; exit 1; }
aws sts get-caller-identity --region "$REGION" >/dev/null || { echo "AWS credentials not configured. Run: aws configure" >&2; exit 1; }

# ---------------------------------------------------------------- custom domain
# Find the Route 53 zone and an ACM certificate that already cover the hostname.
# CloudFront only accepts certificates from us-east-1, whatever region the rest
# of the stack lives in, so every ACM call below pins that region explicitly.
if [ -n "$DOMAIN" ]; then
  if [ -z "$ZONE_ID" ]; then
    best_len=0
    while read -r zid zname; do
      [ -z "${zname:-}" ] && continue
      zname="${zname%.}"
      if [ "$DOMAIN" = "$zname" ] || [ "${DOMAIN%".$zname"}" != "$DOMAIN" ]; then
        if [ ${#zname} -gt $best_len ]; then ZONE_ID="$zid"; best_len=${#zname}; fi
      fi
    done < <(aws route53 list-hosted-zones \
               --query 'HostedZones[?Config.PrivateZone==`false`].[Id,Name]' \
               --output text | sed 's#/hostedzone/##')
    [ -n "$ZONE_ID" ] || { echo "No public Route 53 zone covers $DOMAIN. Pass --zone-id." >&2; exit 1; }
    echo "==> hosted zone: $ZONE_ID"
  fi

  if [ -z "$CERT_ARN" ]; then
    for arn in $(aws acm list-certificates --region us-east-1 \
                   --certificate-statuses ISSUED \
                   --query 'CertificateSummaryList[].CertificateArn' --output text); do
      for n in $(aws acm describe-certificate --region us-east-1 --certificate-arn "$arn" \
                   --query 'Certificate.SubjectAlternativeNames' --output text); do
        if [ "$n" = "$DOMAIN" ]; then CERT_ARN="$arn"; break 2; fi
        case "$n" in
          \*.*) suffix="${n#\*.}"
                # a wildcard covers exactly one extra label, not a deeper subdomain
                if [ "${DOMAIN%".$suffix"}" != "$DOMAIN" ] &&
                   [ "${DOMAIN%".$suffix"}" = "${DOMAIN%%.*}" ]; then CERT_ARN="$arn"; break 2; fi ;;
        esac
      done
    done
  fi
  if [ -z "$CERT_ARN" ]; then
    cat >&2 <<MSG
No issued us-east-1 certificate covers $DOMAIN.

Request one (DNS validation, free), add the CNAME it prints to zone $ZONE_ID,
wait for it to be issued, then re-run this script:

  aws acm request-certificate --region us-east-1 --domain-name $DOMAIN \\
      --validation-method DNS --query CertificateArn --output text
  aws acm describe-certificate --region us-east-1 --certificate-arn <arn> \\
      --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
  aws acm wait certificate-validated --region us-east-1 --certificate-arn <arn>

Or pass an existing one with --cert <arn>.
MSG
    exit 1
  fi
  echo "==> certificate: $CERT_ARN"
fi

PARAMS=(ProjectName="$PROJECT" FeedSchedule="$SCHEDULE")
if [ -n "$DOMAIN" ]; then
  PARAMS+=(DomainName="$DOMAIN" HostedZoneId="$ZONE_ID" CertificateArn="$CERT_ARN")
fi
[ -n "$GH_REPO" ] && PARAMS+=(GithubRepo="$GH_REPO")

echo "==> stack: $PROJECT   region: $REGION"
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$PROJECT" \
  --template-file aws/stack.yaml \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides "${PARAMS[@]}"

out() { aws cloudformation describe-stacks --region "$REGION" --stack-name "$PROJECT" \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }

BUCKET="$(out SiteBucket)"
DIST="$(out DistributionId)"
SITE="$(out SiteUrl)"
FEEDFN="$(out FeedFunction)"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

echo "==> packaging feed function"
aws/package-feed.sh "$TMP/feed"
( cd "$TMP/feed" && zip -qr ../feed.zip . )
echo "    $(du -h "$TMP/feed.zip" | cut -f1) zip"
aws lambda update-function-code --region "$REGION" --function-name "$FEEDFN" \
  --zip-file "fileb://$TMP/feed.zip" --output text --query LastModified
aws lambda wait function-updated --region "$REGION" --function-name "$FEEDFN"

echo "==> uploading the OS"
aws s3 cp os/index.html "s3://$BUCKET/index.html" --region "$REGION" \
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
[ -n "$DOMAIN" ] && echo "  Also reachable at $(out CloudFrontDomain) while DNS settles."
echo "  Feeds refresh on: $SCHEDULE (UTC)"
if [ -n "$GH_REPO" ]; then
  echo
  echo "  GitHub Actions deploy role created. Point the workflow at it with:"
  echo "    gh variable set AWS_DEPLOY_ROLE_ARN --repo $GH_REPO --body \"$(out GithubDeployRoleArn)\""
fi
echo "  Tear it all down with: ./aws/destroy.sh --project $PROJECT --region $REGION"
