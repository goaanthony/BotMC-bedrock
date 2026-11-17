/**
 * dashboard.js
 * Interface console élégante, aérée et sans spam pour la passerelle Minecraft.
 */

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
}

/** Retire les séquences ANSI pour calculer la vraie longueur visible */
function visLen(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\u{1F300}-\u{1FFFF}]/gu, '  ').length
}

/** Centre un string dans une largeur donnée (gère les ANSI + emojis) */
function center(str, width) {
  const len = visLen(str)
  if (len >= width) return str
  const left  = Math.floor((width - len) / 2)
  const right = width - len - left
  return ' '.repeat(left) + str + ' '.repeat(right)
}

/** Remplit à droite pour atteindre une largeur visible cible */
function padRight(str, width) {
  const len = visLen(str)
  return str + ' '.repeat(Math.max(0, width - len))
}

export class Dashboard {
  constructor(config = {}) {
    this.config = config
    this.startTime = Date.now()
    this.stats = {
      friendsAccepted:  0,
      playersRedirected: 0,
      activeConnections: 0,
    }
  }

  time() {
    return new Date().toLocaleTimeString('fr-FR', { hour12: false })
  }

  uptime() {
    const s   = Math.floor((Date.now() - this.startTime) / 1000)
    const h   = Math.floor(s / 3600)
    const m   = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`
  }

  /** Affiche le grand tableau de démarrage */
  renderHeader() {
    console.clear()
    const { cyan, bold, reset, dim, green, yellow, white, gray } = C
    const W = 62  // largeur interne (entre les ║)

    const bar   = (l, r) => `${cyan}${l}${'═'.repeat(W)}${r}${reset}`
    const div   =          `${cyan}╟${'─'.repeat(W)}╢${reset}`
    const row   = (content) => {
      const inner = padRight(content, W)
      return `${cyan}║${reset}${inner}${cyan}║${reset}`
    }

    // ── Titre ────────────────────────────────────────────────────────
    const title    = this.config.title    || 'MINECRAFT BEDROCK GATEWAY'
    const subtitle = this.config.subtitle || 'Passerelle Xbox Live — redirection automatique'
    console.log()
    console.log(bar('╔', '╗'))
    console.log(row(center(`${bold}${white}  ${title}  ${reset}`, W)))
    console.log(row(center(`${dim}${subtitle}${reset}`, W)))
    console.log(bar('╠', '╣'))

    // ── Configuration ────────────────────────────────────────────────
    const mode = this.config.mode || 'gateway'

    console.log(row(`${bold}${yellow}  CONFIGURATION${reset}`))
    console.log(div)

    const targetStr = `${green}${bold}${this.config.targetHost}:${this.config.targetPort}${reset}`
    const worldStr  = `${white}${this.config.worldName || 'Mon Serveur'}${reset}`

    if (mode === 'friends') {
      console.log(row(`  ${gray}Compte Xbox    ${reset}: ${green}${bold}${this.config.accountLabel}${reset}`))
      console.log(row(`  ${gray}Serveur cible  ${reset}: ${targetStr}`))
      console.log(row(`  ${gray}Verification   ${reset}: ${cyan}toutes les ${this.config.friendPollInterval / 1000}s${reset}`))
      console.log(row(`  ${gray}Mode           ${reset}: ${white}BDS (monde heberge par bedrock_server.exe)${reset}`))
    } else {
      console.log(row(`  ${gray}Serveur cible   ${reset}: ${targetStr}`))
      console.log(row(`  ${gray}Nom du monde    ${reset}: ${worldStr}`))
      console.log(row(`  ${gray}Protocole       ${reset}: ${cyan}NetherNet (WebRTC P2P) + Xbox RTA${reset}`))
      console.log(row(`  ${gray}Compte          ${reset}: ${green}Bedrock Crossplay${reset}`))
    }
    console.log(bar('╠', '╣'))

    // ── Statut ───────────────────────────────────────────────────────
    console.log(row(`${bold}${green}  STATUT EN DIRECT${reset}`))
    console.log(div)
    console.log(row(`  ${gray}Session Xbox    ${reset}: ${green}${bold}EN LIGNE  (visible dans l'onglet Amis)${reset}`))
    console.log(row(`  ${gray}Auto-amis       ${reset}: ${green}${bold}ACTIF     (ecoute WebSocket instantanee)${reset}`))
    console.log(bar('╠', '╣'))

    // ── Journal ──────────────────────────────────────────────────────
    console.log(row(`${bold}${white}  JOURNAL D'ACTIVITE EN TEMPS REEL${reset}`))
    console.log(bar('╚', '╝'))
    console.log()
  }

  /** Affiche un événement de façon espacée et lisible */
  log(icon, tag, message, color = C.white) {
    const { dim, reset, bold, cyan } = C
    const timeStr = `${dim}[${this.time()}]${reset}`
    const tagStr  = `${cyan}${bold}${tag.padEnd(13)}${reset}`
    console.log(`  ${timeStr}  ${icon}  ${tagStr} ${color}${message}${reset}`)
  }

  friendAccepted(gamertag, xuid) {
    this.stats.friendsAccepted++
    this.log('>', 'AMI ACCEPTE', `${gamertag}  ${C.dim}XUID: ${xuid}${C.reset}`, C.green)
  }

  playerConnecting(gamertag) {
    this.stats.activeConnections++
    this.log('+', 'CONNEXION', `${gamertag} a clique "Rejoindre" dans l'onglet Amis`, C.yellow)
  }

  playerRedirected(gamertag) {
    this.stats.playersRedirected++
    this.log('~>', 'TRANSFERT', `${gamertag} -> ${this.config.targetHost}:${this.config.targetPort}`, C.green)
  }

  playerDisconnected(gamertag) {
    this.stats.activeConnections = Math.max(0, this.stats.activeConnections - 1)
    this.log('-', 'DECONNEXION', `${gamertag} a quitte le lobby`, C.gray)
  }

  authRequired(verificationUri, userCode) {
    const { yellow, bold, cyan, reset } = C
    console.log()
    console.log(`${yellow}╔${'═'.repeat(62)}╗${reset}`)
    console.log(`${yellow}║${bold}  AUTHENTIFICATION MICROSOFT / XBOX REQUISE${reset}${' '.repeat(19)}${yellow}║${reset}`)
    console.log(`${yellow}╠${'═'.repeat(62)}╣${reset}`)
    console.log(`${yellow}║${reset}  1. Ouvre   : ${bold}${cyan}${verificationUri}${reset}`)
    console.log(`${yellow}║${reset}  2. Code    : ${bold}${cyan}${userCode}${reset}`)
    console.log(`${yellow}║${reset}  3. Connecte le compte du bot Xbox`)
    console.log(`${yellow}╚${'═'.repeat(62)}╝${reset}`)
    console.log()
  }

  warn(message)  { this.log('!', 'ATTENTION',  message, C.yellow) }
  error(message) { this.log('X', 'ERREUR',     message, C.red) }
}
