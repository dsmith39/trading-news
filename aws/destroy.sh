#!/usr/bin/env bash
# Remove everything this project created. Nothing is left behind to bill you.
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT="nq-trading-os"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --region)  REGION="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

BUCKET="$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$PROJECT" \
  --query "Stacks[0].Outputs[?OutputKey=='SiteBucket'].OutputValue" --output text 2>/dev/null || true)"

read -r -p "Delete stack '$PROJECT' in $REGION and its bucket? [y/N] " a
[ "$a" = "y" ] || [ "$a" = "Y" ] || { echo "cancelled"; exit 0; }

if [ -n "$BUCKET" ] && [ "$BUCKET" != "None" ]; then
  echo "==> emptying s3://$BUCKET"
  aws s3 rm "s3://$BUCKET" --recursive --region "$REGION" --only-show-errors || true
fi
echo "==> deleting stack (CloudFront takes a few minutes to release)"
aws cloudformation delete-stack --region "$REGION" --stack-name "$PROJECT"
aws cloudformation wait stack-delete-complete --region "$REGION" --stack-name "$PROJECT"
rm -f aws/.deploy-token
echo "done - nothing left running."
