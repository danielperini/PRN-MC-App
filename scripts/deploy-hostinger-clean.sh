#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/danielperini/PRN-MC-App.git}"
OLD_DIR="${APP_DIR:-/opt/gestor-museus}"
STAMP="$(date +%Y%m%d-%H%M%S)"
STAGE_DIR="/opt/gestor-museus-release-$STAMP"
DB_BACKUP_DIR="$OLD_DIR/backups/db"

log() { printf '\n[%s] %s\n' "$(date '+%F %T')" "$*"; }
compose_old() { (cd "$OLD_DIR" && docker compose "$@"); }
compose_stage() { (cd "$STAGE_DIR" && docker compose "$@"); }
rollback() {
  log "Falha: restaurando os containers anteriores"
  compose_stage down >/dev/null 2>&1 || true
  compose_old up -d >/dev/null 2>&1 || true
}

[[ "$EUID" -eq 0 ]] || { echo "Execute como root."; exit 1; }
[[ -d "$OLD_DIR" ]] || { echo "Diretório ausente: $OLD_DIR"; exit 1; }

for file in .env .env.oauth secrets/google-drive.json; do
  [[ -f "$OLD_DIR/$file" ]] || { echo "Arquivo obrigatório ausente: $OLD_DIR/$file"; exit 1; }
done

mkdir -p "$DB_BACKUP_DIR"
log "Garantindo banco disponível para backup"
compose_old up -d db

for i in $(seq 1 60); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' appgestor-db 2>/dev/null || true)"
  [[ "$status" == "healthy" ]] && break
  echo "Banco: $status ($i/60)"
  sleep 2
done
status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' appgestor-db 2>/dev/null || true)"
[[ "$status" == "healthy" ]] || { compose_old logs --tail=120 db; exit 1; }

log "Criando backup do banco"
compose_old exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$DB_BACKUP_DIR/appgestor-$STAMP.sql"
test -s "$DB_BACKUP_DIR/appgestor-$STAMP.sql"

log "Clonando uma cópia limpa do main"
git clone --depth 1 --branch main "$REPO_URL" "$STAGE_DIR"
cp "$OLD_DIR/.env" "$STAGE_DIR/.env"
cp "$OLD_DIR/.env.oauth" "$STAGE_DIR/.env.oauth"
mkdir -p "$STAGE_DIR/secrets"
cp "$OLD_DIR/secrets/google-drive.json" "$STAGE_DIR/secrets/google-drive.json"

log "Validando e construindo a nova versão"
compose_stage config >/dev/null
compose_stage build

log "Trocando os containers"
compose_old down
trap rollback ERR
compose_stage up -d --build

log "Validando API e web"
for i in $(seq 1 60); do
  api_ok=0; web_ok=0
  curl -fsS --max-time 5 http://127.0.0.1:3001/health >/dev/null 2>&1 && api_ok=1 || true
  curl -fsS --max-time 5 http://127.0.0.1:8081/ >/dev/null 2>&1 && web_ok=1 || true
  if [[ "$api_ok" -eq 1 && "$web_ok" -eq 1 ]]; then
    trap - ERR
    log "DEPLOY_OK"
    echo "Versão: $STAGE_DIR"
    echo "Backup: $DB_BACKUP_DIR/appgestor-$STAMP.sql"
    compose_stage ps
    exit 0
  fi
  echo "Aguardando serviços... tentativa $i/60"
  sleep 2
done

compose_stage ps
compose_stage logs --tail=150 api web migrate
exit 1
