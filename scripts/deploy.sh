#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
SHA="${1:?Usage: bash scripts/deploy.sh COMMIT_SHA}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || exit 1
[[ "$(git rev-parse HEAD)" == "$SHA" ]] || exit 1
test -f .env.production
export PMS_IMAGE_TAG="$SHA"

mkdir -p .deploy/backups
exec 8>.deploy/build.lock
flock -w 300 8

dc() {
  docker compose --project-name pms-production \
    --env-file "$ROOT/.env.production" \
    -f "$ROOT/compose.production.yaml" "$@"
}

on_error() {
  echo "Deployment failed: $SHA; database migrations are not automatically reverted."
  dc ps -a || true
  dc logs --tail=100 api web || true
}
trap on_error ERR

dc config --quiet
# Build before touching running application containers. Keep commit-tagged images.
dc build api web
dc up -d --wait --wait-timeout 180 db redis

BACKUP=".deploy/backups/$(date -u +%Y%m%dT%H%M%SZ)-$SHA.dump"
dc exec -T db sh -ec \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP.tmp"
mv "$BACKUP.tmp" "$BACKUP"

dc run --rm --no-deps api node node_modules/typeorm/cli.js \
  migration:run -d dist/database/data-source.js
dc up -d --no-build --wait --wait-timeout 240 api web

WEB_ADDRESS="$(dc port web 80)"
curl --fail --silent --show-error --retry 5 --retry-connrefused \
  "http://$WEB_ADDRESS/healthz"
curl --fail --silent --show-error --retry 5 --retry-connrefused \
  "http://$WEB_ADDRESS/api"

if [[ -f .deploy/current-release ]]; then
  cp .deploy/current-release .deploy/previous-release
fi
printf '%s\n' "$SHA" > .deploy/current-release.tmp
mv .deploy/current-release.tmp .deploy/current-release
echo "Deployment succeeded: $SHA"
