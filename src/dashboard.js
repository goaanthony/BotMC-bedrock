/**
 * dashboard.js
 * Affichage console : un en-tête de configuration puis un journal horodaté.
 */

export const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  white:  '\x1b[37m',
  gray:   '\x1b[90m',
}

const W = 62 // largeur interne du cadre

const visLen = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').length
const pad    = (s) => s + ' '.repeat(Math.max(0, W - visLen(s)))
const center = (s) => {
  const free = Math.max(0, W - visLen(s))
  return ' '.repeat(Math.floor(free / 2)) + s + ' '.repeat(Math.ceil(free / 2))
}

export class Dashboard {
  constructor(config = {}) {
    this.config = config
  }

  time() {
    return new Date().toLocaleTimeString('fr-FR', { hour12: false })
  }

  renderHeader() {
    const { cyan, bold, reset, dim, green, yellow, white, gray } = C
    const c   = this.config
    const bar = (l, r) => `${cyan}${l}${'═'.repeat(W)}${r}${reset}`
    const div = `${cyan}╟${'─'.repeat(W)}╢${reset}`
    const row = (s) => console.log(`${cyan}║${reset}${pad(s)}${cyan}║${reset}`)
    const kv  = (k, v) => row(`  ${gray}${k.padEnd(16)}${reset}: ${v}`)

    console.log()
    console.log(bar('╔', '╗'))
    row(center(`${bold}${white}MINECRAFT BEDROCK GATEWAY${reset}`))
    row(center(`${dim}${c.mode === 'friends' ? 'Acceptation automatique des amis Xbox' : 'Redirection automatique via l\'onglet Amis'}${reset}`))
    console.log(bar('╠', '╣'))
    row(`${bold}${yellow}  CONFIGURATION${reset}`)
    console.log(div)
    kv('Compte bot', `${green}${c.account}${reset}`)
    if (c.targetHost) kv('Serveur cible', `${green}${bold}${c.targetHost}:${c.targetPort}${reset}`)
    if (c.mode === 'friends') {
      kv('Demandes d\'amis', `${cyan}instantané (RTA) + vérif. ${c.friendPollInterval / 1000}s${reset}`)
    } else {
      kv('Nom du monde', `${white}${c.worldName}${reset}`)
      kv('Visibilité', `${white}${c.joinability}${reset}`)
      kv('Amis', `${cyan}acceptation auto${c.autoFriendAdd ? ' + ajout des followers' : ''}${reset}`)
    }
    console.log(bar('╚', '╝'))
    console.log()
  }

  log(icon, tag, message, color = C.white) {
    const { dim, reset, bold, cyan } = C
    console.log(`  ${dim}[${this.time()}]${reset}  ${icon}  ${cyan}${bold}${tag.padEnd(12)}${reset} ${color}${message}${reset}`)
  }

  friendAccepted(gamertag, xuid) { this.log('+', 'AMI', `${gamertag}  ${C.dim}XUID ${xuid}${C.reset}`, C.green) }
  friendRemoved(gamertag)        { this.log('-', 'AMI RETIRE', gamertag, C.gray) }
  playerJoined(gamertag)         { this.log('>', 'SESSION', `${gamertag} a cliqué « Rejoindre »`, C.yellow) }
  playerConnecting(gamertag)     { this.log('…', 'CONNEXION', `${gamertag} connecté à la passerelle`, C.yellow) }
  playerTransferred(gamertag)    { this.log('→', 'TRANSFERT', `${gamertag} → ${this.config.targetHost}:${this.config.targetPort}`, C.green) }
  playerLeft(gamertag)           { this.log('<', 'SESSION', `${gamertag} a quitté la session`, C.gray) }
  session(message)               { this.log('⟳', 'SESSION', message, C.cyan) }
  warn(message)                  { this.log('!', 'ATTENTION', message, C.yellow) }
  error(message)                 { this.log('X', 'ERREUR', message, C.red) }

  authRequired(verificationUri, userCode) {
    const { yellow, bold, cyan, reset } = C
    console.log()
    console.log(`${yellow}╔${'═'.repeat(W)}╗${reset}`)
    console.log(`${yellow}║${reset}${pad(`${bold}  CONNEXION MICROSOFT / XBOX REQUISE${reset}`)}${yellow}║${reset}`)
    console.log(`${yellow}╚${'═'.repeat(W)}╝${reset}`)
    console.log(`  1. Ouvre   : ${bold}${cyan}${verificationUri}${reset}`)
    console.log(`  2. Code    : ${bold}${cyan}${userCode}${reset}`)
    console.log(`  3. Connecte-toi avec le compte Xbox du bot (pas ton compte principal)`)
    console.log()
  }
}
