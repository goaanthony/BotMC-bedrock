/**
 * « botmc console » : console interactive pour un bot qui tourne en service.
 *
 * Affiche les logs en direct (fichier du jour, en couleurs) et donne accès
 * aux mêmes touches que la console du bot : E, J, R, C, H. Les infos sont lues
 * dans data/status.json, la recréation de session passe par un signal SIGUSR2.
 */

import fs from 'node:fs'
import path from 'node:path'
import { Logger, LEVEL_STYLE, prettyLine, ANSI as A } from './core/logger.js'
import { dayKey } from './core/stats.js'
import { renderDetails, renderPlayers, KEYS_HELP } from './core/panels.js'
import { attachKeys } from './core/keys.js'

const LINE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (DBG|INF|WRN|ERR) \[([^\]]+)\] (.*)$/
const LEVEL_BY_LABEL = Object.fromEntries(Object.entries(LEVEL_STYLE).map(([k, v]) => [v.label, k]))

/** Recolore une ligne du fichier de log (les stack traces sont grisées) */
export function colorizeFileLine(line) {
  const m = LINE.exec(line)
  if (!m) return `${A.dim}${line}${A.reset}`
  return prettyLine(m[2], LEVEL_BY_LABEL[m[3]] ?? 'info', m[4], m[5])
}

/** Suit le fichier de log du jour (gère le changement de jour) */
class LogTail {
  constructor(dir, onLine, backlog = 30) {
    this.dir = dir
    this.onLine = onLine
    this.backlog = backlog
    this.file = null
    this.offset = 0
    this.rest = ''
    this.timer = null
  }

  start() {
    this.#poll(true)
    this.timer = setInterval(() => this.#poll(false), 500)
  }

  stop() { clearInterval(this.timer) }

  #poll(first) {
    const file = path.join(this.dir, `botmc-${dayKey()}.log`)
    if (file !== this.file) {
      this.file = file
      this.offset = 0
      this.rest = ''
      if (first) {
        // n'affiche que les dernières lignes au démarrage
        try {
          const content = fs.readFileSync(file, 'utf8')
          const lines = content.split('\n').filter(Boolean)
          for (const l of lines.slice(-this.backlog)) this.onLine(l)
          this.offset = Buffer.byteLength(content)
        } catch { /* pas encore de fichier aujourd'hui */ }
        return
      }
    }
    let size
    try { size = fs.statSync(file).size } catch { return }
    if (size < this.offset) this.offset = 0 // fichier recréé
    if (size === this.offset) return
    const fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(size - this.offset)
    fs.readSync(fd, buf, 0, buf.length, this.offset)
    fs.closeSync(fd)
    this.offset = size
    const text = this.rest + buf.toString('utf8')
    const lines = text.split('\n')
    this.rest = lines.pop()
    for (const l of lines) if (l) this.onLine(l)
  }
}

export function runConsole(config) {
  const log = new Logger({ format: 'pretty' })
  const statusFile = path.join(config.dataDir, 'status.json')

  const readStatus = () => {
    try {
      const s = JSON.parse(fs.readFileSync(statusFile, 'utf8'))
      let alive = s.state !== 'offline'
      if (alive) { try { process.kill(s.pid, 0) } catch (err) { alive = err.code === 'EPERM' } }
      return { s, alive }
    } catch {
      log.raw(`\n${A.yellow}Aucune donnée : le bot n'a encore jamais tourné.${A.reset}\n`)
      return null
    }
  }

  if (!config.log.dir) {
    log.raw(`${A.yellow}LOG_TO_FILE=false : pas de fichier à suivre, seules les touches E et J fonctionnent.${A.reset}`)
  }
  const tail = config.log.dir ? new LogTail(config.log.dir, (l) => log.raw(colorizeFileLine(l))) : null

  log.raw(`\n${A.cyan}${A.bold}BotMC — console${A.reset} ${A.dim}(logs en direct de ${config.log.dir ?? '—'})${A.reset}`)
  log.raw(`${KEYS_HELP}\n`)
  tail?.start()

  const quit = () => { tail?.stop(); log.raw(''); process.exit(0) }
  attachKeys({
    e: () => { const r = readStatus(); if (r) renderDetails(log, r.s, { alive: r.alive }) },
    j: () => { const r = readStatus(); if (r) renderPlayers(log, r.s) },
    r: () => {
      const r = readStatus()
      if (!r) return
      if (!r.alive || r.s.mode !== 'gateway') return log.raw(`${A.yellow}Le bot passerelle ne tourne pas.${A.reset}`)
      try {
        process.kill(r.s.pid, 'SIGUSR2')
        log.raw(`${A.cyan}Recréation de la session demandée...${A.reset}`)
      } catch (err) {
        log.raw(`${A.red}Impossible de joindre le bot (PID ${r.s.pid}) : ${err.code}${A.reset}`)
      }
    },
    c: () => process.stdout.write('\x1b[2J\x1b[3J\x1b[H'),
    h: () => log.raw(`\n${KEYS_HELP}\n`),
    q: quit,
  }, quit)

  if (!process.stdin.isTTY) log.raw(`${A.dim}(pas de terminal interactif : touches désactivées)${A.reset}`)
}
