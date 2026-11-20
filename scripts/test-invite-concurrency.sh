#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
command -v psql >/dev/null 2>&1 || { echo "psql is required"; exit 1; }

OWNER_ID="$(cat /proc/sys/kernel/random/uuid)"
GOAL_ID="$(cat /proc/sys/kernel/random/uuid)"
EMAIL="invite-race-${OWNER_ID}@example.test"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# Create a real Auth user so the auth.users trigger creates an eligible profile.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '$OWNER_ID', 'authenticated', 'authenticated', '$EMAIL', '',
  now(), '{"provider":"email","providers":["email"]}',
  '{"birth_date":"1980-01-01"}', now(), now()
);

insert into public.goals (
  id, owner_id, name, category, target_cents, status, is_shared
) values (
  '$GOAL_ID', '$OWNER_ID', 'Concurrent invite test', 'outros', 100000, 'active', true
);

-- Start with four valid active invites. Two concurrent requests compete for
-- the single remaining slot.
insert into public.goal_invites (goal_id, token_hash, created_by, expires_at)
select
  '$GOAL_ID',
  encode(extensions.digest('seed-' || n::text || '-$GOAL_ID', 'sha256'), 'hex'),
  '$OWNER_ID',
  now() + interval '7 days'
from generate_series(1, 4) as n;
SQL

run_invite() {
  local label="$1"
  local output="$TMP_DIR/$label.log"
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >"$output" 2>&1 <<SQL
set role authenticated;
set request.jwt.claim.sub = '$OWNER_ID';
select public.create_goal_invite('$GOAL_ID');
SQL
  then
    echo success >"$TMP_DIR/$label.result"
  else
    echo failure >"$TMP_DIR/$label.result"
  fi
}

run_invite first &
PID1=$!
run_invite second &
PID2=$!
wait "$PID1"
wait "$PID2"

SUCCESSES="$(grep -l '^success$' "$TMP_DIR"/*.result | wc -l | tr -d ' ')"
FAILURES="$(grep -l '^failure$' "$TMP_DIR"/*.result | wc -l | tr -d ' ')"
ACTIVE_COUNT="$(psql "$DATABASE_URL" -Atq -v goal="$GOAL_ID" -c "select count(*) from public.goal_invites where goal_id = '$GOAL_ID' and used_at is null and expires_at > now();")"

if [[ "$SUCCESSES" != "1" || "$FAILURES" != "1" || "$ACTIVE_COUNT" != "5" ]]; then
  echo "Concurrency test failed: successes=$SUCCESSES failures=$FAILURES active_invites=$ACTIVE_COUNT"
  cat "$TMP_DIR"/*.log
  exit 1
fi

echo "PASS: two simultaneous requests produced exactly one success, one rejection, and five active invites."
