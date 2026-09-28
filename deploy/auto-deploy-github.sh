#!/usr/bin/env bash
set -Eeuo pipefail

repo=/opt/gestor-museus
state_dir=/var/lib/gestor-museus-deploy
cd "$repo"
mkdir -p "$state_dir"
mark_failure() {
  status=$?
  trap - ERR
  set +e
  if [[ ${needs_rollback:-false} == true ]]; then
    echo 'GITHUB_DEPLOY_ROLLBACK restoring_previous_images' >&2
    docker tag "$old_api" gestor-museus-api:latest
    docker tag "$old_web" gestor-museus-web:latest
    docker compose up -d --no-deps --force-recreate api web
  fi
  if [[ -n ${target:-} ]]; then printf '%s\n' "$target" > "$state_dir/failed.sha"; fi
  echo "GITHUB_DEPLOY_FAILED status=$status commit=${target:-unknown}" >&2
  exit "$status"
}
trap mark_failure ERR

origin_url=$(git remote get-url origin)
if [[ "$origin_url" != 'https://github.com/danielperini/PRN-MC-App.git' ]]; then
  echo "GITHUB_DEPLOY_BLOCKED unexpected_origin=$origin_url" >&2
  exit 2
fi

git fetch --quiet origin main
target=$(git rev-parse origin/main)
current=$(git rev-parse HEAD)
deployed=$(cat "$state_dir/deployed.sha" 2>/dev/null || printf '%s' "$current")
failed=$(cat "$state_dir/failed.sha" 2>/dev/null || true)

if [[ "$target" == "$deployed" ]]; then
  echo "GITHUB_DEPLOY_NO_CHANGE commit=${target:0:12}"
  exit 0
fi
if [[ "$target" == "$failed" ]]; then
  echo "GITHUB_DEPLOY_BLOCKED previously_failed=${target:0:12}" >&2
  exit 2
fi
if [[ -n $(git status --porcelain=v1 -uno) ]]; then
  echo 'GITHUB_DEPLOY_BLOCKED tracked_worktree_changes' >&2
  exit 2
fi
if ! git merge-base --is-ancestor "$current" "$target"; then
  echo "GITHUB_DEPLOY_BLOCKED non_fast_forward current=${current:0:12} target=${target:0:12}" >&2
  exit 2
fi

changed=$(git diff --name-only "$current" "$target")
if printf '%s\n' "$changed" | grep -Eq '^(migration/|migrations/|compose\.yml$|Dockerfile$|backend/Dockerfile$|nginx\.conf$|\.github/workflows/)'; then
  echo "GITHUB_DEPLOY_BLOCKED manual_review_required commit=${target:0:12}" >&2
  exit 2
fi

git merge --ff-only "$target"
if ! printf '%s\n' "$changed" | grep -Eq '^(backend/|src/|public/|package(-lock)?\.json$|index\.html$|vite\.config\.)'; then
  printf '%s\n' "$target" > "$state_dir/deployed.sha"
  echo "GITHUB_DEPLOY_SOURCE_ONLY commit=${target:0:12}"
  exit 0
fi

node --check backend/server.mjs
node --test tests/*.test.mjs
old_api=$(docker image inspect gestor-museus-api:latest --format '{{.Id}}')
old_web=$(docker image inspect gestor-museus-web:latest --format '{{.Id}}')
docker compose build api web

mkdir -p backups
backup="backups/pre-github-deploy-${target:0:12}-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T db pg_dump -U appgestor -d appgestor -Fc > "$backup"
test -s "$backup"
needs_rollback=true
docker compose up -d --no-deps api web

healthy=false
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:3001/health >/dev/null \
      && curl -fsS --max-time 3 http://127.0.0.1:8081/ >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done
if [[ "$healthy" != true ]]; then
  echo "GITHUB_DEPLOY_HEALTH_FAILED commit=${target:0:12}" >&2
  false
fi

needs_rollback=false
printf '%s\n' "$target" > "$state_dir/deployed.sha"
: > "$state_dir/failed.sha"
echo "GITHUB_DEPLOY_OK commit=${target:0:12} backup=$backup"
