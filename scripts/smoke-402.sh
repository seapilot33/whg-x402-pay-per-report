#!/usr/bin/env bash
# Smoke: pricing + unpaid report must return 402
set -euo pipefail
BASE="${1:-http://localhost:4020}"
echo "== pricing =="
curl -sS "$BASE/api/pricing" | head -c 400
echo ""
echo "== unpaid report (expect 402) =="
CODE=$(curl -sS -o /tmp/whg-402.json -w "%{http_code}" -X POST "$BASE/api/report" \
  -H 'Content-Type: application/json' -d '{}')
echo "HTTP $CODE"
head -c 500 /tmp/whg-402.json
echo ""
test "$CODE" = "402" && echo "OK: 402 Payment Required" || (echo "FAIL: expected 402"; exit 1)
