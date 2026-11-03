#!/usr/bin/env bash
# Applies all migrations to a fresh database and runs the SQL test suite.
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres tests/db/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${TEST_DB:-bizpro_test}
export PGOPTIONS='-c client_min_messages=warning'
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d $DB -f tests/db/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "apply $f"; psql -q -v ON_ERROR_STOP=1 -d $DB -f "$f"
done
if [ "${SKIP_TESTS:-0}" != "1" ]; then psql -q -t -o /dev/null -v ON_ERROR_STOP=1 -d $DB -f tests/db/tests.sql 2>&1 | sed "s/^psql:[^ ]* //"; fi
