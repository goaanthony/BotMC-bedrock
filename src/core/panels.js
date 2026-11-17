/**
 * Panneaux d'informations détaillées (touche E / J, « botmc stats »).
 * Ils travaillent sur un snapshot de Stats : le même rendu sert dans le
 * process du bot et dans « botmc console », qui lit data/status.json.
 */

import { ANSI as A, stripAnsi } from './logger.js'
import { box } from './ui.js'
import { dayKey, newDay, timingSummary, formatDuration, formatMs } from './stats.js'

const W = 78
const visible = (s) => [...stripAnsi(s)].length
const padEnd = (s, w) => s + ' '.repeat(Math.max(0, w - visible(s)))
const padStart = (s, w) => ' '.repeat(Math.max(0, w - visible(s))) + s
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0)
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`

export function ago(iso, now = Date.now()) {
  if (!iso) return '—'
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000))
  if (s < 60) return 'à l\'instant'
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`
  return `il y a ${Math.floor(s / 86400)} j`
}

const fmtBytes = (b) => (b ? `${Math.round(b / 1048576)} Mo` : '—')

/** Barre horizontale proportionnelle */
function bar(value, max, width = 18) {
  const n = max ? Math.max(value ? 1 : 0, Math.round((value / max) * width)) : 0
  return `${A.cyan}${'█'.repeat(n)}${A.gray}${'░'.repeat(width - n)}${A.reset}`
}

/** Classement « nom ████░░ n  xx % » d'un objet { clé: nombre } */
function ranking(obj, { limit = 6, label = 16 } = {}) {
  const entries = Object.entries(obj ?? {}).sort((a, b) => b[1] - a[1])
  if (!entries.length) return [`${A.dim}aucune donnée pour l'instant${A.reset}`]
  const total = entries.reduce((s, [, n]) => s + n, 0)
  const max = entries[0][1]
  const shown = entries.slice(0, limit)
  const rest = entries.slice(limit).reduce((s, [, n]) => s + n, 0)
  if (rest) shown.push(['Autres', rest])
  return shown.map(([k, n]) =>
    `${padEnd(k.slice(0, label), label)} ${bar(n, max)} ${padStart(String(n), 4)}  ${A.dim}${padStart(pct(n, total) + ' %', 5)}${A.reset}`)
}

/** Activité par heure : histogramme vertical sur 4 lignes + axe */
function hoursChart(hours, nowHour) {
  const max = Math.max(...hours)
  if (!max) return [`${A.dim}aucune connexion aujourd'hui${A.reset}`]
  const rows = 4
  const levels = ' ▁▂▃▄▅▆▇█'
  const lines = []
  for (let r = rows - 1; r >= 0; r--) {
    let line = ''
    for (let h = 0; h < 24; h++) {
      const v = (hours[h] / max) * rows - r            // remplissage de cette ligne (0..1+)
      const ch = v >= 1 ? '█' : v > 0 ? levels[Math.max(1, Math.round(v * 8))] : ' '
      const color = h === nowHour ? A.yellow : A.cyan
      line += `${color}${ch}${ch}${A.reset} `
    }
    lines.push(line)
  }
  let axis = ''
  for (let h = 0; h < 24; h++) axis += h % 3 === 0 ? `${A.dim}${String(h).padStart(2, '0')}${A.reset} ` : '   '
  lines.push(axis)
  const peak = hours.indexOf(max)
  lines.push(`${A.dim}pic : ${String(peak).padStart(2, '0')}h–${String((peak + 1) % 24).padStart(2, '0')}h (${plural(max, 'connexion')})${A.reset}`)
  return lines
}

const section = (title) => `${A.bold}${A.white}${title}${A.reset}`
const kv = (k, v, w = 20) => `${A.gray}${padEnd(k, w)}${A.reset}${v}`

function timingLine(t) {
  const s = timingSummary(t)
  if (!s) return `${A.dim}pas encore de mesure${A.reset}`
  const dot = ` ${A.dim}·${A.reset} `
  return `${A.bold}${formatMs(s.avg)}${A.reset} moy${dot}méd ${formatMs(s.median)}${dot}95 % < ${formatMs(s.p95)}${dot}max ${formatMs(s.max)}`
}

const STATE = {
  starting:   `${A.yellow}● démarrage${A.reset}`,
  online:     `${A.green}● en ligne${A.reset}`,
  refreshing: `${A.cyan}● recréation de session${A.reset}`,
  offline:    `${A.red}● arrêté${A.reset}`,
}

/**
 * Panneau complet (touche E)
 * @param {import('./logger.js').Logger} log
 * @param {ReturnType<import('./stats.js').Stats['snapshot']>} s
 * @param {{ alive?: boolean, now?: Date }} [opts]
 */
export function renderDetails(log, s, { alive = true, now = new Date() } = {}) {
  const day = { ...newDay(), ...(s.days?.[dayKey(now)] ?? {}) }
  const at = s.allTime ?? {}
  const uniqueToday = Object.keys(day.players).length
  const attempts = day.transfers + day.failures
  const success = attempts ? `${pct(day.transfers, attempts)} % de réussite` : '—'
  const dateFr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  const out = []
  const push = (...l) => out.push(...l)

  // ── Aujourd'hui ────────────────────────────────────────────────────────
  push(...box([
    kv('Joueurs uniques', `${A.bold}${A.green}${uniqueToday}${A.reset}`),
    kv('Connexions', `${day.connections}  ${A.dim}(${plural(day.joins, 'clic')} « Rejoindre »)${A.reset}`),
    kv('Transferts réussis', `${A.bold}${day.transfers}${A.reset}  ${A.dim}${success}${day.failures ? `, ${plural(day.failures, 'abandon')}` : ''}${A.reset}`),
    kv('Temps de transfert', timingLine(day.timing.transfer)),
    kv('Clic → serveur', timingLine(day.timing.total)),
    kv('Dernier transfert', day.lastTransfer ? `${A.yellow}${day.lastTransfer.gamertag}${A.reset} ${A.dim}${ago(day.lastTransfer.time, now)}${A.reset}` : '—'),
    kv('Amis acceptés', String(day.friendsAccepted)),
    kv('Sessions recréées', String(day.sessionRefreshes)),
    kv('Incidents', `${day.errors ? A.red : ''}${plural(day.errors, 'erreur')}${A.reset}, ${plural(day.warnings, 'avertissement')}`),
  ], { title: `Aujourd'hui — ${dateFr}`, width: W }))

  // ── Répartition ────────────────────────────────────────────────────────
  push('', section(' Plateformes'), ...ranking(day.platforms).map(l => '  ' + l))
  push('', section(' Contrôles'), ...ranking(day.inputs, { limit: 4 }).map(l => '  ' + l))
  push('', section(' Versions du jeu'), ...ranking(day.versions, { limit: 4 }).map(l => '  ' + l))
  if (Object.keys(day.languages).length) push('', section(' Langues'), ...ranking(day.languages, { limit: 4 }).map(l => '  ' + l))

  // ── Activité ───────────────────────────────────────────────────────────
  push('', section(' Activité par heure'), ...hoursChart(day.hours, now.getHours()).map(l => '  ' + l))

  // ── Top joueurs ────────────────────────────────────────────────────────
  const top = Object.entries(day.players).sort((a, b) => b[1].transfers - a[1].transfers || b[1].connections - a[1].connections).slice(0, 8)
  push('', section(' Joueurs du jour'))
  if (!top.length) push(`  ${A.dim}personne pour l'instant${A.reset}`)
  for (const [name, p] of top) {
    push(`  ${A.yellow}${padEnd(name.slice(0, 18), 18)}${A.reset} ${padEnd(p.platform ?? '?', 12)} ${padStart(String(p.transfers), 3)} transfert(s)  ${A.dim}${ago(p.lastSeen, now)}${A.reset}`)
  }

  // ── Depuis toujours ────────────────────────────────────────────────────
  const best = at.bestDay ? `${at.bestDay.players} joueurs le ${new Date(at.bestDay.date).toLocaleDateString('fr-FR')}` : '—'
  const since = at.since ? new Date(at.since).toLocaleDateString('fr-FR') : '—'
  const activeDays = Object.values(s.days ?? {}).filter(d => d.connections > 0).length
  push('', ...box([
    kv('Joueurs différents', `${A.bold}${Object.keys(at.players ?? {}).length}${A.reset}`),
    kv('Transferts', `${at.transfers ?? 0}  ${A.dim}(${plural(at.failures ?? 0, 'abandon')})${A.reset}`),
    kv('Temps de transfert', timingLine(at.timing?.transfer)),
    kv('Record', best),
    kv('Jours actifs (30 j)', String(activeDays)),
    kv('Amis acceptés', String(at.friendsAccepted ?? 0)),
  ], { title: `Depuis le ${since}`, width: W, color: A.blue }))

  // ── Système ────────────────────────────────────────────────────────────
  const state = alive ? (STATE[s.state] ?? s.state) : STATE.offline
  push('', ...box([
    kv('État', `${state}   ${A.dim}uptime ${alive ? formatDuration(now - Date.parse(s.startedAt)) : '—'}${A.reset}`),
    kv('Compte bot', s.gamertag ? `${s.gamertag} ${A.dim}(${s.account})${A.reset}` : (s.account ?? '—')),
    kv('Serveur cible', s.target ?? '—'),
    kv('Depuis le démarrage', `${plural(s.counters?.transfers ?? 0, 'transfert')}, ${plural(s.counters?.sessionRefreshes ?? 0, 'session')} recréée(s)`),
    kv('Mémoire', `${fmtBytes(s.memory?.rss)}  ${A.dim}(PID ${s.pid} · v${s.version ?? '?'})${A.reset}`),
    ...(s.lastError ? [kv('Dernière erreur', `${A.red}${s.lastError.message.slice(0, 40)}${A.reset} ${A.dim}${ago(s.lastError.time, now)}${A.reset}`)] : []),
  ], { title: 'Système', width: W, color: A.gray }))

  log.raw()
  for (const l of out) log.raw(l)
  log.raw()
}

/** Liste détaillée des joueurs du jour (touche J) */
export function renderPlayers(log, s, { now = new Date() } = {}) {
  const day = { ...newDay(), ...(s.days?.[dayKey(now)] ?? {}) }
  const rows = Object.entries(day.players).sort((a, b) => Date.parse(b[1].lastSeen) - Date.parse(a[1].lastSeen))
  log.raw()
  log.raw(section(` Joueurs d'aujourd'hui (${rows.length})`))
  if (!rows.length) { log.raw(`  ${A.dim}personne pour l'instant${A.reset}\n`); return }
  log.raw(`  ${A.dim}${padEnd('Joueur', 18)} ${padEnd('Plateforme', 12)} ${padEnd('Contrôles', 15)} ${padEnd('Version', 10)} Trf  Vu${A.reset}`)
  for (const [name, p] of rows) {
    log.raw(`  ${A.yellow}${padEnd(name.slice(0, 18), 18)}${A.reset} ${padEnd(p.platform ?? '?', 12)} ${padEnd(p.input ?? '?', 15)} ${padEnd(p.version ?? '?', 10)} ${padStart(String(p.transfers), 3)}  ${A.dim}${ago(p.lastSeen, now)}${A.reset}`)
  }
  log.raw()
}

export const KEYS_HELP = `${A.dim}Touches : ${A.reset}${A.bold}E${A.reset}${A.dim} infos détaillées · ${A.reset}${A.bold}J${A.reset}${A.dim} joueurs du jour · ${A.reset}${A.bold}R${A.reset}${A.dim} recréer la session · ${A.reset}${A.bold}C${A.reset}${A.dim} effacer · ${A.reset}${A.bold}H${A.reset}${A.dim} aide · ${A.reset}${A.bold}Ctrl+C${A.reset}${A.dim} quitter${A.reset}`
