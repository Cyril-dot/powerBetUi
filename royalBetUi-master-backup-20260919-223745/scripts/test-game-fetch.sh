#!/usr/bin/env bash
set -Eeuo pipefail

# Usage:
#   ./scripts/test-game-fetch.sh
#   API_BASE_URL=https://... ./scripts/test-game-fetch.sh ./fetch-report
#
# The script does not mutate the backend. It saves every raw response, then
# prints endpoint status/counts and a normalized detail dump for every item.

BASE_URL="${API_BASE_URL:-${VITE_API_BASE_URL:-https://futballbackend-production-15ee.up.railway.app}}"
BASE_URL="${BASE_URL%/}"
OUT_DIR="${1:-./fetch-report-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT_DIR/raw"

# These are the same football sources currently called by fetchFootball() in
# client/src/lib/sportsbook.ts.
declare -A ENDPOINTS=(
  [with-all-odds]="/api/public/football/matches/with-all-odds"
  [matches-live]="/api/public/football/matches/live"
  [matches-upcoming]="/api/public/football/matches/upcoming"
  [matches-today]="/api/public/football/matches/today"
  [matches-results]="/api/public/football/matches/results?limit=50"
  [cups-upcoming]="/api/public/football/matches/all-cups/upcoming"
  [cups-today]="/api/public/football/matches/all-cups/today"
  [cups-live]="/api/public/football/matches/all-cups/live"
  [livescore-live]="/api/public/football/livescore/live"
  [livescore-today]="/api/public/football/livescore/today"
  [livescore-fixtures]="/api/public/football/livescore/fixtures"
  [livescore-all-leagues-today]="/api/public/football/livescore/all-leagues/today"
  [livescore-all-cups-today]="/api/public/football/livescore/all-cups/today"
)

printf 'PowerBet game-fetch probe\nBackend: %s\nOutput:  %s\n\n' "$BASE_URL" "$OUT_DIR"
printf '%-32s %-5s %-8s %-10s %s\n' "SOURCE" "HTTP" "ITEMS" "UUID_IDS" "URL"
printf '%-32s %-5s %-8s %-10s %s\n' "------" "----" "-----" "--------" "---"

summary="$OUT_DIR/summary.tsv"
printf 'source\thttp\titems\tuuid_ids\tshort_provider_ids\turl\n' > "$summary"

for source in "${!ENDPOINTS[@]}"; do
  path="${ENDPOINTS[$source]}"
  raw="$OUT_DIR/raw/$source.json"
  meta="$OUT_DIR/raw/$source.http"
  curl -sS --connect-timeout 15 --max-time 60 -o "$raw" -w '%{http_code}\n' "$BASE_URL$path" > "$meta" || true
  http="$(cat "$meta" 2>/dev/null || printf '000')"

  if ! jq -e . "$raw" >/dev/null 2>&1; then
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$source" "$http" "INVALID_JSON" "-" "-" "$BASE_URL$path" >> "$summary"
    continue
  fi

  # Backend list endpoints return data[] items; with-all-odds returns items
  # with a nested match object. Also retain raw livescore/ESPN objects.
  jq -c '
    (.data // []) as $data |
    if ($data|type) == "array" then $data[]
    elif ($data|type) == "object" then ($data|to_entries[]|select(.value|type=="array")|.value[])
    else empty end
  ' "$raw" | jq -s '
    map(if (.match|type)=="object" then .match else . end)
    | {
        items:length,
        uuid_ids: map(.id // .backendId // .uuid // .matchUuid // .matchId // .fixtureId // "") | map(select(test("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"))) | length,
        short_provider_ids: map(.id // .externalId // .eventId // "") | map(select(test("^[0-9]+$"))) | length
      }
  ' > "$OUT_DIR/raw/$source.stats.json"

  items="$(jq -r '.items' "$OUT_DIR/raw/$source.stats.json")"
  uuid_ids="$(jq -r '.uuid_ids' "$OUT_DIR/raw/$source.stats.json")"
  short_ids="$(jq -r '.short_provider_ids' "$OUT_DIR/raw/$source.stats.json")"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$source" "$http" "$items" "$uuid_ids" "$short_ids" "$BASE_URL$path" >> "$summary"
done

# Stable readable table in endpoint order, rather than associative-array order.
{
  head -n 1 "$summary"
  for source in with-all-odds matches-live matches-upcoming matches-today matches-results cups-upcoming cups-today cups-live livescore-live livescore-today livescore-fixtures livescore-all-leagues-today livescore-all-cups-today; do
    awk -F '\t' -v s="$source" 'NR==1 || $1==s' "$summary"
  done
} > "$OUT_DIR/summary-ordered.tsv"
awk -F '\t' '
  NR == 1 { for (i=1; i<=NF; i++) h[i]=$i; next }
  { for (i=1; i<=NF; i++) if (length($i)>w[i]) w[i]=length($i); rows[NR]=$0 }
  END {
    for (i=1; i<=length(h); i++) printf "%-*s%s", w[i], h[i], i==length(h)?"\n":"  ";
    for (r=2; r<=NR; r++) { n=split(rows[r], a, FS); for (i=1; i<=n; i++) printf "%-*s%s", w[i], a[i], i==n?"\n":"  " }
  }
' "$OUT_DIR/summary-ordered.tsv"

# Produce one JSON file with every feed item plus source/path, preserving all
# fields so the complete details can be inspected with jq.
all_details="$OUT_DIR/all-game-details.json"
details_jsonl="$OUT_DIR/.all-game-details.jsonl"
: > "$details_jsonl"
for source in with-all-odds matches-live matches-upcoming matches-today matches-results cups-upcoming cups-today cups-live livescore-live livescore-today livescore-fixtures livescore-all-leagues-today livescore-all-cups-today; do
  path="${ENDPOINTS[$source]}"
  jq -c --arg source "$source" --arg url "$BASE_URL$path" '
    (.data // []) as $data |
    if ($data|type) == "array" then $data[]
    elif ($data|type) == "object" then ($data|to_entries[]|select(.value|type=="array")|.value[])
    else empty end
    | {source:$source, url:$url, item:(if (.match|type)=="object" then .match else . end), odds:(.odds // .match_result // .markets // [])}
  ' "$OUT_DIR/raw/$source.json" 2>/dev/null >> "$details_jsonl"
done
jq -s '.' "$details_jsonl" > "$all_details"
rm -f "$details_jsonl"

printf '\nSaved files:\n  summary: %s\n  all details: %s\n  raw responses: %s/raw/\n' "$OUT_DIR/summary-ordered.tsv" "$all_details" "$OUT_DIR"
printf '\nID warning check (provider-only numeric IDs that the current isBettableMatchId() rejects):\n'
jq -r '.[] | select(.item.id? and (.item.id|tostring|test("^[0-9]+$"))) | [.source,.item.id,.item.name,.item.shortName] | @tsv' "$all_details" | head -80 || true
chmod +x /home/ubuntu/powerBetUi-main/powerBetUi-main/scripts/test-game-fetch.sh
