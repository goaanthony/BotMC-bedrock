/**
 * Éléments d'affichage console : bannière, encadrés, résumés.
 * Tout passe par Logger#raw, qui retire les couleurs hors terminal.
 */

import { ANSI as A, stripAnsi } from './logger.js'
import { formatDuration } from './stats.js'

const WIDTH = 64

const visible = (s) => [...stripAnsi(s)].length
const padEnd  = (s, w) => s + ' '.repeat(Math.max(0, w - visible(s)))
/** Coupe une ligne trop longue (les couleurs sont alors retirées) */
const fit = (s, w) => (visible(s) <= w ? s : [...stripAnsi(s)].slice(0, w - 1).join('') + '…')

/** Encadré à bords arrondis, titre optionnel */
export function box(lines, { title = '', color = A.cyan, width = WIDTH } = {}) {
  const inner = width - 2
  const head  = title
    ? `${color}╭─ ${A.bold}${title}${A.reset}${color} ${'─'.repeat(Math.max(0, inner - visible(title) - 3))}╮${A.reset}`
    : `${color}╭${'─'.repeat(inner)}╮${A.reset}`
  const body = lines.map(l => `${color}│${A.reset} ${padEnd(fit(l, inner - 2), inner - 2)} ${color}│${A.reset}`)
  return [head, ...body, `${color}╰${'─'.repeat(inner)}╯${A.reset}`]
}

const kv = (key, value) => `${A.gray}${key.padEnd(15)}${A.reset} ${value}`

const LOGO = [
  '  ___      _   __  __  ___ ',
  ' | _ ) ___| |_|  \\/  |/ __|',
  ' | _ \\/ _ \\  _| |\\/| | (__ ',
  ' |___/\\___/\\__|_|  |_|\\___|',
]

export function banner(log, config, version) {
  if (log.format === 'json') return
  const target = config.targetHost ? `${A.green}${A.bold}${config.targetHost}:${config.targetPort}${A.reset}` : `${A.gray}—${A.reset}`
  const lines = config.mode === 'gateway'
    ? [
        kv('Mode', `${A.white}Passerelle${A.reset} ${A.dim}(onglet Amis → transfert)${A.reset}`),
        kv('Serveur cible', target),
        kv('Monde affiché', `${A.white}${config.world.hostName}${A.reset} ${A.dim}· ${config.world.name}${A.reset}`),
        kv('Visibilité', config.joinabilityLabel.replaceAll('_', ' ')),
        kv('Amis', `acceptation auto${config.autoFriendAdd ? ' + ajout des followers' : ''}`),
        kv('Compte bot', config.auth.username),
      ]
    : [
        kv('Mode', `${A.white}Amis seulement${A.reset} ${A.dim}(BDS)${A.reset}`),
        kv('Serveur cible', target),
        kv('Vérification', `instantanée + toutes les ${config.friendPollInterval / 1000}s`),
        kv('Compte bot', config.auth.username),
      ]
  lines.push(kv('Logs', config.log.dir ? `${A.dim}${config.log.dir}${A.reset} ${A.gray}(${config.log.level})${A.reset}` : `${A.gray}console (${config.log.level})${A.reset}`))

  log.raw()
  for (const l of LOGO) log.raw(`${A.cyan}${A.bold}${l}${A.reset}`)
  log.raw(`${A.dim}  Minecraft Bedrock Gateway · v${version}${A.reset}`)
  log.raw()
  for (const l of box(lines, { title: 'Configuration' })) log.raw(l)
  log.raw()
}

export function authBox(log, uri, code) {
  const lines = [
    `1. Ouvre      ${A.cyan}${A.bold}${uri}${A.reset}`,
    `2. Entre      ${A.yellow}${A.bold}${code}${A.reset}`,
    '3. Connecte-toi avec le compte Xbox du BOT',
    `${A.dim}   (jamais ton compte principal)${A.reset}`,
  ]
  log.raw()
  for (const l of box(lines, { title: 'Connexion Microsoft requise', color: A.yellow })) log.raw(l)
  log.raw()
}

/** Une ligne de résumé pour les logs périodiques */
export function summaryLine(stats) {
  const c = stats.counters
  return `En ligne depuis ${formatDuration(stats.uptimeMs())} · ${c.transfers} transfert(s), ` +
    `${stats.uniquePlayers} joueur(s) unique(s), ${c.friendsAccepted} ami(s) accepté(s), ` +
    `${c.sessionRefreshes} session(s) recréée(s), ${c.errors} erreur(s)`
}

const STATE_LABEL = {
  starting:   `${A.yellow}● démarrage${A.reset}`,
  online:     `${A.green}● en ligne${A.reset}`,
  refreshing: `${A.cyan}● recréation de session${A.reset}`,
  offline:    `${A.red}● arrêté${A.reset}`,
}

/** Rendu de data/status.json pour `botmc status` */
export function renderStatus(log, s, { alive }) {
  const state = alive ? (STATE_LABEL[s.state] ?? s.state) : STATE_LABEL.offline
  const since = alive ? formatDuration(Date.now() - Date.parse(s.startedAt)) : '—'
  const c = s.counters
  const lines = [
    kv('État', state),
    kv('Mode', s.mode === 'friends' ? 'amis seulement (BDS)' : 'passerelle'),
    kv('Serveur cible', s.target || '—'),
    kv('Compte bot', s.gamertag ? `${s.gamertag} ${A.dim}(${s.account})${A.reset}` : (s.account ?? '—')),
    kv('Uptime', since),
    '',
    kv('Transferts', `${A.bold}${c.transfers}${A.reset} ${A.dim}(${c.uniquePlayers} joueur(s) unique(s))${A.reset}`),
    kv('Amis acceptés', String(c.friendsAccepted)),
    kv('Sessions', `${c.sessionRefreshes} recréation(s)`),
    kv('Incidents', `${c.errors ? A.red : ''}${c.errors} erreur(s)${A.reset}, ${c.warnings} avertissement(s)`),
  ]
  if (s.lastError) lines.push(kv('Dernière err.', `${A.red}${s.lastError.message.slice(0, 44)}${A.reset}`))

  log.raw()
  for (const l of box(lines, { title: 'BotMC — statut' })) log.raw(l)

  const top = Object.entries(s.players ?? {}).sort((a, b) => b[1].transfers - a[1].transfers).slice(0, 5)
  if (top.length) {
    log.raw()
    log.raw(`${A.bold} Joueurs les plus actifs${A.reset}`)
    for (const [name, p] of top) log.raw(`  ${A.yellow}${name.padEnd(20)}${A.reset} ${p.transfers} transfert(s)`)
  }
  if (s.recent?.length) {
    log.raw()
    log.raw(`${A.bold} Derniers événements${A.reset}`)
    for (const e of s.recent.slice(-8)) {
      const t = new Date(e.time).toLocaleTimeString('fr-FR', { hour12: false })
      const color = e.level === 'error' ? A.red : e.level === 'warn' ? A.yellow : ''
      log.raw(`  ${A.dim}${t}${A.reset} ${color}${e.message}${A.reset}`)
    }
  }
  log.raw()
}
