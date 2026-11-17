#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#  BotMC — installation sur un serveur Linux
#
#  Depuis le dossier du projet (git clone) :
#      sudo ./install.sh
#
#  Options :
#      --dir DIR            dossier d'installation        (défaut : /opt/botmc)
#      --user USER          utilisateur système du bot     (défaut : botmc)
#      --target-host HOST   serveur Bedrock cible          (sinon demandé)
#      --target-port PORT   port du serveur cible          (défaut : 19132)
#      --world-name NOM     nom du monde dans l'onglet Amis
#      --mode MODE          gateway | friends              (défaut : gateway)
#      --yes                aucune question (valeurs par défaut / options)
#      --no-start           ne démarre pas le service à la fin
#      --uninstall          désinstalle BotMC
#
#  Le script est rejouable : il sert aussi à mettre à jour (« botmc update »).
#  La configuration (.env), la connexion Xbox et les logs sont conservés.
# ═══════════════════════════════════════════════════════════════════════
set -Eeuo pipefail

SERVICE=botmc
NODE_MAJOR_MIN=20
NODE_MAJOR_INSTALL=22
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

INSTALL_DIR=/opt/botmc
BOT_USER=botmc
TARGET_HOST="${TARGET_HOST:-}"
TARGET_PORT="${TARGET_PORT:-19132}"
WORLD_NAME="${WORLD_NAME:-}"
BOT_MODE="${BOT_MODE:-gateway}"
ASSUME_YES=0
START=1
UNINSTALL=0

# ── Affichage ────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  B=$'\e[1m' D=$'\e[2m' R=$'\e[0m' RED=$'\e[31m' GRN=$'\e[32m' YEL=$'\e[33m' CYN=$'\e[36m'
else
  B='' D='' R='' RED='' GRN='' YEL='' CYN=''
fi
STEP=0
step()  { STEP=$((STEP + 1)); printf '\n%s[%d]%s %s%s%s\n' "$CYN$B" "$STEP" "$R" "$B" "$*" "$R"; }
ok()    { printf '    %s✔%s %s\n' "$GRN" "$R" "$*"; }
info()  { printf '    %s·%s %s\n' "$D" "$R" "$*"; }
warn()  { printf '    %s▲ %s%s\n' "$YEL" "$*" "$R"; }
die()   { printf '\n%s✖ %s%s\n\n' "$RED$B" "$*" "$R" >&2; exit 1; }
trap 'die "Erreur ligne $LINENO : « $BASH_COMMAND »"' ERR

# Questions : lit sur le terminal même si le script est lancé via un pipe
has_tty() { [[ $ASSUME_YES -eq 0 ]] && { [[ -t 0 ]] || [[ -r /dev/tty ]]; }; }
ask() { # ask "Question" "défaut" → réponse
  local q=$1 def=${2:-} ans
  if ! has_tty; then printf '%s' "$def"; return; fi
  printf '    %s?%s %s%s : ' "$CYN" "$R" "$q" "${def:+ ${D}[${def}]${R}}" > /dev/tty
  IFS= read -r ans < /dev/tty || true
  printf '%s' "${ans:-$def}"
}
confirm() { # confirm "Question" [o|n]
  local def=${2:-o} ans
  ans=$(ask "$1 (o/n)" "$def")
  [[ $ans =~ ^[oOyY] ]]
}

# ── Arguments ────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --dir)          INSTALL_DIR=$2; shift 2 ;;
    --user)         BOT_USER=$2; shift 2 ;;
    --target-host)  TARGET_HOST=$2; shift 2 ;;
    --target-port)  TARGET_PORT=$2; shift 2 ;;
    --world-name)   WORLD_NAME=$2; shift 2 ;;
    --mode)         BOT_MODE=$2; shift 2 ;;
    --yes|-y)       ASSUME_YES=1; shift ;;
    --no-start)     START=0; shift ;;
    --uninstall)    UNINSTALL=1; shift ;;
    -h|--help)      sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)              die "Option inconnue : $1 (voir --help)" ;;
  esac
done
INSTALL_DIR=${INSTALL_DIR%/}

[[ $EUID -eq 0 ]] || die "Lance ce script en root : sudo $0 $*"
[[ $BOT_MODE =~ ^(gateway|friends)$ ]] || die "--mode doit valoir gateway ou friends"
[[ $INSTALL_DIR == /* ]] || die "--dir doit être un chemin absolu"

HAS_SYSTEMD=0
if command -v systemctl >/dev/null && [[ -d /run/systemd/system ]]; then HAS_SYSTEMD=1; fi
UNIT_FILE=/etc/systemd/system/$SERVICE.service
CLI_FILE=/usr/local/bin/botmc

as_bot() { runuser -u "$BOT_USER" -- env HOME="$INSTALL_DIR" "$@"; }

# ── Désinstallation ──────────────────────────────────────────────────────
if [[ $UNINSTALL -eq 1 ]]; then
  printf '\n%sDésinstallation de BotMC%s\n' "$B" "$R"
  if [[ $HAS_SYSTEMD -eq 1 && -f $UNIT_FILE ]]; then
    systemctl disable --now "$SERVICE" >/dev/null 2>&1 || true
    rm -f "$UNIT_FILE"
    systemctl daemon-reload
    ok "Service supprimé"
  fi
  rm -f "$CLI_FILE" && ok "Commande botmc supprimée"
  if [[ -d $INSTALL_DIR ]] && confirm "Supprimer aussi $INSTALL_DIR (config, connexion Xbox, logs) ?" n; then
    rm -rf "$INSTALL_DIR" && ok "$INSTALL_DIR supprimé"
  else
    info "$INSTALL_DIR conservé"
  fi
  if id "$BOT_USER" >/dev/null 2>&1 && confirm "Supprimer l'utilisateur système $BOT_USER ?" n; then
    userdel "$BOT_USER" && ok "Utilisateur $BOT_USER supprimé"
  fi
  printf '\n%s✔ BotMC est désinstallé.%s\n\n' "$GRN$B" "$R"
  exit 0
fi

# ── Bannière ─────────────────────────────────────────────────────────────
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$SRC_DIR/package.json" | head -1)
UPGRADE=0; [[ -f $INSTALL_DIR/package.json ]] && UPGRADE=1
cat <<EOF

${CYN}${B}  ___      _   __  __  ___
 | _ ) ___| |_|  \\/  |/ __|
 | _ \\/ _ \\  _| |\\/| | (__
 |___/\\___/\\__|_|  |_|\\___|${R}
${D}  Installation v${VERSION}$([[ $UPGRADE -eq 1 ]] && echo ' (mise à jour)') → ${INSTALL_DIR}${R}
EOF

# ── 1. Système ───────────────────────────────────────────────────────────
step "Vérification du système"
[[ -f /etc/os-release ]] && . /etc/os-release
ok "${PRETTY_NAME:-Linux} ($(uname -m))"
if   command -v apt-get >/dev/null; then PKG=apt
elif command -v dnf     >/dev/null; then PKG=dnf
elif command -v yum     >/dev/null; then PKG=yum
else PKG=none; warn "Gestionnaire de paquets non reconnu : installe Node.js ${NODE_MAJOR_MIN}+ toi-même si besoin"
fi
case $(uname -m) in
  x86_64|aarch64|arm64) ;;
  *) warn "Architecture $(uname -m) non testée : le module WebRTC (node-datachannel) risque de ne pas s'installer" ;;
esac
[[ $HAS_SYSTEMD -eq 1 ]] && ok "systemd disponible" || warn "systemd absent : le bot ne sera pas lancé automatiquement au démarrage"

pkg_install() {
  case $PKG in
    apt) DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" >/dev/null ;;
    dnf|yum) "$PKG" install -y -q "$@" >/dev/null ;;
    *) return 1 ;;
  esac
}

MISSING=()
for bin in curl rsync; do command -v $bin >/dev/null || MISSING+=("$bin"); done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  info "Installation de : ${MISSING[*]}"
  [[ $PKG == apt ]] && apt-get update -qq
  pkg_install "${MISSING[@]}" ca-certificates || die "Impossible d'installer ${MISSING[*]}"
fi
ok "Outils de base présents (curl, rsync)"

# ── 2. Node.js ───────────────────────────────────────────────────────────
step "Node.js"
node_major() { command -v node >/dev/null && node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [[ $(node_major) -lt $NODE_MAJOR_MIN ]]; then
  info "Node.js ${NODE_MAJOR_MIN}+ requis (trouvé : $(command -v node >/dev/null && node -v || echo aucun)) → installation de Node.js ${NODE_MAJOR_INSTALL}"
  case $PKG in
    apt)     curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR_INSTALL}.x" | bash - >/dev/null 2>&1 ;;
    dnf|yum) curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR_INSTALL}.x" | bash - >/dev/null 2>&1 ;;
    *)       die "Installe Node.js ${NODE_MAJOR_MIN}+ manuellement puis relance ce script" ;;
  esac
  pkg_install nodejs || die "L'installation de Node.js a échoué"
fi
[[ $(node_major) -ge $NODE_MAJOR_MIN ]] || die "Node.js ${NODE_MAJOR_MIN}+ introuvable après installation"
NODE_BIN=$(command -v node)
ok "Node.js $(node -v) ($NODE_BIN), npm $(npm -v)"

# ── 3. Utilisateur et fichiers ───────────────────────────────────────────
step "Utilisateur et fichiers"
if ! id "$BOT_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$INSTALL_DIR" --no-create-home --shell /usr/sbin/nologin "$BOT_USER"
  ok "Utilisateur système « $BOT_USER » créé"
else
  ok "Utilisateur « $BOT_USER » existant"
fi

if [[ $HAS_SYSTEMD -eq 1 ]] && systemctl is-active --quiet "$SERVICE"; then
  WAS_RUNNING=1; systemctl stop "$SERVICE"; info "Service arrêté pendant la mise à jour"
else
  WAS_RUNNING=0
fi

mkdir -p "$INSTALL_DIR"
if [[ $SRC_DIR != "$INSTALL_DIR" ]]; then
  rsync -a --delete \
    --exclude '.git/' --exclude 'node_modules/' --exclude '.npm/' \
    --exclude '.env' --exclude 'auth_cache/' --exclude 'logs/' --exclude 'data/' \
    "$SRC_DIR/" "$INSTALL_DIR/"
  ok "Fichiers copiés dans $INSTALL_DIR"
else
  ok "Installation sur place ($INSTALL_DIR)"
fi
printf '%s\n' "$SRC_DIR" > "$INSTALL_DIR/.install-source"
mkdir -p "$INSTALL_DIR"/{auth_cache,logs,data}
chown -R "$BOT_USER:$BOT_USER" "$INSTALL_DIR"
chmod 700 "$INSTALL_DIR/auth_cache"

# ── 4. Dépendances ───────────────────────────────────────────────────────
step "Dépendances npm"
info "npm ci --omit=dev (peut prendre une minute)..."
( cd "$INSTALL_DIR" && as_bot npm ci --omit=dev --no-audit --no-fund --update-notifier=false --loglevel=error --cache "$INSTALL_DIR/.npm" ) \
  || die "npm ci a échoué (voir les messages ci-dessus)"
( cd "$INSTALL_DIR" && as_bot "$NODE_BIN" -e "require('node-datachannel')" ) \
  || die "Le module WebRTC node-datachannel ne se charge pas sur cette machine"
ok "Dépendances installées"

# ── 5. Configuration ─────────────────────────────────────────────────────
step "Configuration"
ENV_FILE=$INSTALL_DIR/.env
env_quote() { local v=${1//\\/\\\\}; v=${v//\"/\\\"}; printf '"%s"' "$v"; }

if [[ -f $ENV_FILE ]]; then
  ok "Configuration existante conservée ($ENV_FILE)"
else
  if [[ -z $TARGET_HOST ]] || has_tty; then
    BOT_MODE=$(ask "Mode (gateway = passerelle onglet Amis, friends = BDS)" "$BOT_MODE")
    [[ $BOT_MODE =~ ^(gateway|friends)$ ]] || die "Mode invalide : $BOT_MODE"
    TARGET_HOST=$(ask "Adresse du serveur Bedrock cible (IP ou domaine)" "$TARGET_HOST")
    TARGET_PORT=$(ask "Port du serveur cible" "$TARGET_PORT")
    WORLD_NAME=$(ask "Nom du monde affiché dans l'onglet Amis" "${WORLD_NAME:-Mon Serveur Minecraft}")
  fi
  [[ $BOT_MODE == friends || -n $TARGET_HOST ]] || die "Adresse du serveur cible obligatoire (--target-host)"
  [[ $TARGET_PORT =~ ^[0-9]+$ ]] && (( TARGET_PORT >= 1 && TARGET_PORT <= 65535 )) || die "Port invalide : $TARGET_PORT"

  # Part du modèle .env.example et remplace les valeurs saisies
  set_env() { # set_env CLE valeur
    local key=$1 val; val=$(env_quote "$2")
    if grep -q "^$key=" "$ENV_FILE"; then
      KEY=$key VAL=$val awk -F= 'BEGIN{OFS="="} $1==ENVIRON["KEY"]{print ENVIRON["KEY"], ENVIRON["VAL"]; next} {print}' "$ENV_FILE" > "$ENV_FILE.tmp"
      mv "$ENV_FILE.tmp" "$ENV_FILE"
    else
      printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
    fi
  }
  cp "$INSTALL_DIR/.env.example" "$ENV_FILE"
  set_env BOT_MODE "$BOT_MODE"
  set_env TARGET_HOST "$TARGET_HOST"
  set_env TARGET_PORT "$TARGET_PORT"
  set_env WORLD_NAME "${WORLD_NAME:-Mon Serveur Minecraft}"
  ok "Configuration écrite ($ENV_FILE)"
fi
chown "$BOT_USER:$BOT_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"
( cd "$INSTALL_DIR" && as_bot "$NODE_BIN" src/cli.js check >/dev/null ) \
  || { as_bot "$NODE_BIN" "$INSTALL_DIR/src/cli.js" check || true; die "Configuration invalide : corrige $ENV_FILE puis relance"; }
ok "Configuration valide"

# ── 6. Commande botmc et service ─────────────────────────────────────────
step "Commande « botmc » et service"
sed -e "s#@INSTALL_DIR@#$INSTALL_DIR#g" -e "s#@BOT_USER@#$BOT_USER#g" \
    -e "s#@NODE_BIN@#$NODE_BIN#g" -e "s#@SERVICE@#$SERVICE#g" \
    "$INSTALL_DIR/scripts/botmc" > "$CLI_FILE"
chmod 755 "$CLI_FILE"
ok "Commande installée : $CLI_FILE"

if [[ $HAS_SYSTEMD -eq 1 ]]; then
  # ProtectHome est incompatible avec une installation sous /home ou /root
  case $INSTALL_DIR in /home/*|/root/*) PROTECT_HOME=read-only ;; *) PROTECT_HOME=yes ;; esac
  sed -e "s#@INSTALL_DIR@#$INSTALL_DIR#g" -e "s#@BOT_USER@#$BOT_USER#g" \
      -e "s#@NODE_BIN@#$NODE_BIN#g" -e "s#@PROTECT_HOME@#$PROTECT_HOME#g" \
      "$INSTALL_DIR/scripts/botmc.service" > "$UNIT_FILE"
  systemctl daemon-reload
  systemctl enable "$SERVICE" >/dev/null 2>&1
  ok "Service systemd « $SERVICE » activé au démarrage"
fi

# ── 7. Connexion Xbox ────────────────────────────────────────────────────
step "Compte Xbox du bot"
logged_in() { grep -rqs refresh_token "$INSTALL_DIR/auth_cache"; }
if logged_in; then
  ok "Compte déjà connecté"
elif has_tty && confirm "Connecter le compte Xbox du bot maintenant ?" o; then
  info "Utilise un compte secondaire, jamais ton compte principal."
  ( cd "$INSTALL_DIR" && as_bot "$NODE_BIN" src/cli.js login < /dev/tty ) || warn "Connexion échouée : réessaie avec « botmc login »"
else
  warn "Compte non connecté : lance « botmc login » avant de démarrer le bot"
fi

# ── 8. Démarrage ─────────────────────────────────────────────────────────
step "Démarrage"
if [[ $HAS_SYSTEMD -eq 0 ]]; then
  warn "Sans systemd, lance le bot à la main : cd $INSTALL_DIR && sudo -u $BOT_USER node src/cli.js start"
elif [[ $START -eq 0 ]]; then
  info "Démarrage ignoré (--no-start) : « botmc start » quand tu es prêt"
elif ! logged_in; then
  info "Le service démarrera après « botmc login » puis « botmc start »"
else
  systemctl restart "$SERVICE"
  sleep 3
  if systemctl is-active --quiet "$SERVICE"; then
    ok "BotMC tourne $([[ $WAS_RUNNING -eq 1 ]] && echo '(redémarré)')"
  else
    warn "Le service ne tourne pas : regarde « botmc logs »"
  fi
fi

cat <<EOF

${GRN}${B}✔ Installation terminée.${R}

  ${B}botmc status${R}     état et statistiques
  ${B}botmc logs${R}       logs en direct (Ctrl+C pour quitter)
  ${B}botmc config${R}     modifier la configuration
  ${B}botmc restart${R}    redémarrer le bot
  ${B}botmc help${R}       toutes les commandes

EOF
