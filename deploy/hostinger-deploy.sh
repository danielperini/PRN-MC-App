#!/usr/bin/env bash
set -Eeuo pipefail

# Execute in the Hostinger VPS terminal from any directory.
APP_DIR="${APP_DIR:-/opt/gestor-museus}"
REPO_URL="https://github.com/danielperini/PRN-MC-App.git"
BRANCH="${DEPLOY_BRANCH:-main}"
BACKUP_DIR="${APP_DIR}/backups"

need() { command -v "$1" >/dev/null 2>&1 || { echo "ERRO: comando ausente: $1" >&2; exit 1; }; }
need git
need docker

if ! docker compose version >/dev/null 2>&1; then
  echo 'ERRO: Docker Compose não está disponível.' >&2
  exit 1
fi

if [ ! -d "${APP_DIR}/.git" ]; then
  mkdir -p "$(dirname "${APP_DIR}")"
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
fi

cd "${APP_DIR}"
git remote set-url origin "${REPO_URL}"
git fetch --prune origin "${BRANCH}"
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"

mkdir -p "${BACKUP_DIR}"
if docker ps --format '{{.Names}}' | grep -qx 'appgestor-db'; then
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  docker compose exec -T db pg_dump -U "${POSTGRES_USER:?Defina POSTGRES_USER no .env}" -d "${POSTGRES_DB:?Defina POSTGRES_DB no .env}" -Fc > "${BACKUP_DIR}/pre-deploy-${timestamp}.dump"
fi

docker compose build --pull api web
docker compose up -d db
docker compose run --rm migrate
docker compose up -d --no-deps api web

healthy=false
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 http://127.0.0.1:3001/health >/dev/null \
    && curl -fsS --max-time 5 http://127.0.0.1:8081/ >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [ "${healthy}" != true ]; then
  echo "ERRO: serviços não ficaram saudáveis. Consulte: docker compose logs --tail=150 api web" >&2
  exit 1
fi

echo "DEPLOY_OK commit=$(git rev-parse --short HEAD) url=https://appgestor.periniprojetos.com.br"
