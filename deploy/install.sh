#!/usr/bin/env bash
# Installs or updates Family Finance on a Linux VM (Debian/Ubuntu with systemd). Idempotent:
# the same command does the first install and every later update.
#
#   ssh david-nguyen 'curl -fsSL https://raw.githubusercontent.com/haiprobmt/family-finance/main/deploy/install.sh | sudo bash'
#   ssh david-nguyen 'sudo /opt/family-finance/app/deploy/install.sh'            # later updates
#   ... install.sh --branch <name>                                               # deploy another branch
#
# Layout:  /opt/family-finance/app   code (git checkout of the public repository, owned by root)
#          /opt/family-finance/node  private Node.js 22 (only if the system has no Node >= 20)
#          /etc/family-finance/env   settings and secrets (root:family-finance, 0640) — never in git
#          /etc/family-finance/google-credentials.json  service-account key (0640)
# The service listens on 127.0.0.1:8080; put Caddy/nginx in front for HTTPS (deploy/Caddyfile.example).
set -euo pipefail

REPO="https://github.com/haiprobmt/family-finance.git"
BRANCH="main"
BASE="/opt/family-finance"
APP="$BASE/app"
ETC="/etc/family-finance"
SERVICE="family-finance"
USER_NAME="family-finance"
NODE_MAJOR=22

while [ $# -gt 0 ]; do
  case "$1" in
    --branch) BRANCH="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)." >&2; exit 1; }
command -v systemctl >/dev/null || { echo "systemd is required." >&2; exit 1; }
log() { printf '\n==> %s\n' "$*"; }

if ! command -v git >/dev/null || ! command -v curl >/dev/null; then
  log "Installing git and curl"
  if command -v apt-get >/dev/null; then apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git curl ca-certificates
  elif command -v dnf >/dev/null; then dnf install -y git curl
  else echo "Install git and curl, then run again." >&2; exit 1; fi
fi

# Node.js >= 20: use the system one if present, else a private copy verified against nodejs.org checksums.
NODE_BIN=""
if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then
  NODE_BIN="$(command -v node)"
elif [ -x "$BASE/node/bin/node" ]; then
  NODE_BIN="$BASE/node/bin/node"
else
  log "Installing Node.js $NODE_MAJOR into $BASE/node"
  case "$(uname -m)" in x86_64) ARCH=x64 ;; aarch64|arm64) ARCH=arm64 ;; *) echo "Unsupported CPU $(uname -m)" >&2; exit 1 ;; esac
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  DIST="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
  curl -fsSL "$DIST/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt"
  TARBALL="$(grep -oE "node-v[0-9.]+-linux-$ARCH\.tar\.xz" "$TMP/SHASUMS256.txt" | head -1)"
  curl -fsSL "$DIST/$TARBALL" -o "$TMP/$TARBALL"
  (cd "$TMP" && grep " $TARBALL\$" SHASUMS256.txt | sha256sum -c -)
  mkdir -p "$BASE/node" && tar -xJf "$TMP/$TARBALL" -C "$BASE/node" --strip-components=1
  NODE_BIN="$BASE/node/bin/node"
fi
echo "Node: $NODE_BIN $("$NODE_BIN" -v)"

id "$USER_NAME" >/dev/null 2>&1 || { log "Creating system user $USER_NAME"; useradd --system --no-create-home --shell /usr/sbin/nologin "$USER_NAME"; }

log "Fetching $BRANCH from $REPO"
mkdir -p "$BASE"
if [ ! -d "$APP/.git" ]; then git clone --quiet "$REPO" "$APP"; fi
git -C "$APP" fetch --quiet origin "$BRANCH"
git -C "$APP" checkout --quiet -B "$BRANCH" FETCH_HEAD
git -C "$APP" reset --quiet --hard FETCH_HEAD
BUILD="$(git -C "$APP" rev-parse --short=12 HEAD)"
echo "$BUILD" > "$APP/BUILD"
echo "Build: $BUILD ($(git -C "$APP" log -1 --format=%s))"

mkdir -p "$ETC"
if [ ! -f "$ETC/env" ]; then
  log "Creating $ETC/env (fill it in, then run this script again)"
  cp "$APP/deploy/family-finance.env.example" "$ETC/env"
fi
chown root:"$USER_NAME" "$ETC" "$ETC/env"; chmod 750 "$ETC"; chmod 640 "$ETC/env"
[ -f "$ETC/google-credentials.json" ] && { chown root:"$USER_NAME" "$ETC/google-credentials.json"; chmod 640 "$ETC/google-credentials.json"; }

log "Installing systemd service"
sed "s#@NODE@#$NODE_BIN#; s#@APP@#$APP#; s#@ETC@#$ETC#; s#@USER@#$USER_NAME#" "$APP/deploy/family-finance.service" > "/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload
systemctl enable --quiet "$SERVICE"

# shellcheck disable=SC1090
set -a; . "$ETC/env"; set +a
if [ -z "${SPREADSHEET_ID:-}" ] || [ -z "${FAMILY_ACCESS_TOKEN:-}" ]; then
  echo
  echo "Not started yet: set SPREADSHEET_ID and FAMILY_ACCESS_TOKEN in $ETC/env and put the"
  echo "service-account key at $ETC/google-credentials.json, then run this script again."
  exit 0
fi

log "Checking Google Sheets access"
runuser -u "$USER_NAME" -- bash -c 'set -a; . "$1"; set +a; exec "$2" "$3" --check' _ "$ETC/env" "$NODE_BIN" "$APP/server/index.js"

log "Restarting $SERVICE"
systemctl restart "$SERVICE"
PORT="${PORT:-8080}"
for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:$PORT/api?build=1" 2>/dev/null | grep -q "\"build\":\"$BUILD\""; then
    echo "Family Finance build $BUILD is running on 127.0.0.1:$PORT."
    exit 0
  fi
  sleep 0.5
done
echo "The service did not answer with build $BUILD on 127.0.0.1:$PORT." >&2
echo "--- service status ---" >&2; systemctl status "$SERVICE" --no-pager -n 0 >&2 || true
echo "--- recent logs ---" >&2; journalctl -u "$SERVICE" -n 30 --no-pager >&2 || true
echo "--- programs listening on port $PORT ---" >&2; (ss -ltnp 2>/dev/null | grep ":$PORT " >&2) || echo "(none)" >&2
exit 1
