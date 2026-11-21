#!/usr/bin/env bash
# Startet das Backend für das Labor 4A. Overrides per Umgebungsvariable möglich, z. B.
#   OPEN_WEIGHT_LLM_SUMMARY_TIMEOUT_MS=500 QA_SUMMARY_TIMEOUT_MS=500 ./start-backend.sh
set -euo pipefail
LAB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE="$LAB/.state"; mkdir -p "$STATE"
REPO="${ARSNOVA_DIR:-$(cd "$LAB/../../../.." && pwd)}"
pkill -f "tsx src/index.ts" 2>/dev/null || true
sleep 1
cd "${ARSNOVA_13_DIR:?ARSNOVA_13_DIR auf die 1.3-Arbeitskopie setzen}/apps/backend"
export DATABASE_URL='postgresql://arsnova_user:secretpassword@localhost:5432/arsnova_13?schema=public' REDIS_URL='redis://localhost:6379/1'
export NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1
export QA_SUMMARY_ENABLED=true
export HOST_SESSION_TTL_SECONDS=${HOST_SESSION_TTL_SECONDS:-14400}
export QA_SUMMARY_COOLDOWN_MS=${QA_SUMMARY_COOLDOWN_MS:-5000}
export QA_SUMMARY_TIMEOUT_MS=${QA_SUMMARY_TIMEOUT_MS:-90000}
export OPEN_WEIGHT_LLM_ENABLED=${OPEN_WEIGHT_LLM_ENABLED:-true}
export OPEN_WEIGHT_LLM_URL=${OPEN_WEIGHT_LLM_URL:-http://127.0.0.1:8080}
export OPEN_WEIGHT_LLM_TOKEN=$(cat "$STATE/llm_token")
export OPEN_WEIGHT_LLM_SUMMARY_TIMEOUT_MS=${OPEN_WEIGHT_LLM_SUMMARY_TIMEOUT_MS:-90000}
export OPEN_WEIGHT_LLM_LABEL_TIMEOUT_MS=${OPEN_WEIGHT_LLM_LABEL_TIMEOUT_MS:-30000}
nohup npx tsx src/index.ts > "$STATE/backend13.log" 2>&1 &
for i in $(seq 1 60); do
  if curl -s --noproxy '*' -o /dev/null http://127.0.0.1:3000/trpc/health.check 2>/dev/null; then echo "backend up after ${i}s"; exit 0; fi
  sleep 1
done
echo "backend did not start"; tail -30 "$STATE/backend13.log"; exit 1
