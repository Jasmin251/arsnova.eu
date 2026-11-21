#!/usr/bin/env bash
# Störungsserie auf Release 1.3 (Commit 85ebdb8c). Ergebnisse nach $L/v13-*.txt
set -u
LAB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE="$LAB/.state"; mkdir -p "$STATE"
REPO="${ARSNOVA_DIR:-$(cd "$LAB/../../../.." && pwd)}"
L="$LAB"
cd "$REPO"
export NO_PROXY='*' no_proxy='*'
. "$L/sem.env"
T=$(cat "$STATE/llm_token")
N=${N:-5}
llm_ready() { until [ "$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $T" 'http://127.0.0.1:8080/slots?fail_on_no_slot=1')" = "200" ]; do sleep 0.5; done; }
block_slot() { (curl -s --noproxy '*' -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Schreibe einen sehr langen Aufsatz über Wolken."}],"max_tokens":900}' \
  http://127.0.0.1:8080/v1/chat/completions -o /dev/null &); sleep 2; }
S() { node "$L/driver.mjs" summary "$STATE/s13.json" | python3 "$L/s.py"; }
LB() { node "$L/driver.mjs" labels "$STATE/s13-labels.json" | python3 "$L/l.py"; }
HP() { node "$L/driver.mjs" hotpath "$STATE/s13.json"; }

echo "## E1 Summary Timeout 2 s"
OPEN_WEIGHT_LLM_SUMMARY_TIMEOUT_MS=2000 QA_SUMMARY_TIMEOUT_MS=2000 "$L/start-backend13.sh" >/dev/null
for i in $(seq 1 "$N"); do S; sleep 6; done
echo "hotpath während Timeout:"; (S >/dev/null &) ; sleep 0.3; HP; sleep 5

echo "## L3 Labels Timeout 1 s"
for i in $(seq 1 "$N"); do OPEN_WEIGHT_LLM_LABEL_TIMEOUT_MS=1000 "$L/start-backend13.sh" >/dev/null; LB; done

echo "## E2 Summary belegt (503)"
"$L/start-backend13.sh" >/dev/null; llm_ready; sleep 2; block_slot
echo "slot-sonde: $(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $T" 'http://127.0.0.1:8080/slots?fail_on_no_slot=1')"
for i in $(seq 1 "$N"); do S; sleep 6; done
echo "hotpath während belegt:"; HP

echo "## L2 Labels belegt"
for i in $(seq 1 "$N"); do "$L/start-backend13.sh" >/dev/null; LB; done
echo "warte auf freien Slot"; llm_ready

echo "## E3 Summary LLM gestoppt"
docker stop arsnova-v3-open-weight-llm-http >/dev/null
"$L/start-backend13.sh" >/dev/null
for i in $(seq 1 "$N"); do S; sleep 6; done
echo "hotpath während Ausfall:"; HP

echo "## L1 Labels LLM gestoppt"
for i in $(seq 1 "$N"); do "$L/start-backend13.sh" >/dev/null; LB; done

echo "## E4 Summary ungültige Ausgabe (Testadapter)"
for F in garbage schema; do
  pkill -f fake-llm.mjs; FAULT=$F node "$L/fake-llm.mjs" > "$STATE/fake13-$F.log" 2>&1 & sleep 1
  OPEN_WEIGHT_LLM_URL=http://127.0.0.1:8081 "$L/start-backend13.sh" >/dev/null
  echo "# $F"; for i in $(seq 1 "$N"); do S; sleep 6; done
done

echo "## L5 Labels ungültige Ausgabe (Testadapter)"
for F in garbage schema; do
  pkill -f fake-llm.mjs; FAULT=$F node "$L/fake-llm.mjs" > "$STATE/fake13-l-$F.log" 2>&1 & sleep 1
  echo "# $F"; for i in $(seq 1 3); do OPEN_WEIGHT_LLM_URL=http://127.0.0.1:8081 "$L/start-backend13.sh" >/dev/null; LB; done
done
pkill -f fake-llm.mjs

echo "## L4 Encoder gestoppt (Kontrast)"
pkill -f wordcloud-encoder/server.py; sleep 1
for i in 1 2 3; do "$L/start-backend13.sh" >/dev/null; LB; done
echo "## Ende $(date +%T)"
