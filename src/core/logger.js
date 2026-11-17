/**
 * Logger : niveaux, catégories, sortie console (jolie, texte ou JSON) et
 * fichiers journaliers avec rotation. Capture aussi les logs internes des
 * bibliothèques (module `debug`) au niveau « debug ».
 */

import fs from 'node:fs'
import path from 'node:path'
import util from 'node:util'
import createDebug from 'debug'

export const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }

const ANSI = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m', white: '\x1b[97m',
}

/** Catégories d'événements : libellé affiché et couleur */
const CATEGORIES = {
  system:   { label: 'SYSTÈME',   color: ANSI.blue },
  xbox:     { label: 'XBOX',      color: ANSI.green },
  session:  { label: 'SESSION',   color: ANSI.cyan },
  player:   { label: 'JOUEUR',    color: ANSI.yellow },
  transfer: { label: 'TRANSFERT', color: ANSI.magenta },
  friend:   { label: 'AMIS',      color: ANSI.green },
  stats:    { label: 'STATS',     color: ANSI.blue },
  lib:      { label: 'LIB',       color: ANSI.gray },
}

const LEVEL_STYLE = {
  debug: { icon: '·', color: ANSI.gray,   label: 'DBG' },
  info:  { icon: '•', color: ANSI.white,  label: 'INF' },
  warn:  { icon: '▲', color: ANSI.yellow, label: 'WRN' },
  error: { icon: '✖', color: ANSI.red,    label: 'ERR' },
}

const pad2 = (n) => String(n).padStart(2, '0')
const localDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const localTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`

/** Message d'erreur lisible, avec la cause réseau (ex. « fetch failed (ENOTFOUND login.live.com) ») */
export function describe(err) {
  if (!(err instanceof Error)) return String(err)
  const c = err.cause
  if (!c) return err.message
  const detail = c.code ? `${c.code}${c.hostname ? ' ' + c.hostname : ''}` : c.message
  return `${err.message} (${detail})`
}

export const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')

/** Fichier de log journalier : logs/botmc-AAAA-MM-JJ.log, purge après N jours */
export class DailyFile {
  constructor(dir, retentionDays = 14, prefix = 'botmc') {
    this.dir = dir
    this.retentionDays = retentionDays
    this.prefix = prefix
    this.day = null
    this.stream = null
    fs.mkdirSync(dir, { recursive: true })
  }

  write(line, now = new Date()) {
    const day = localDate(now)
    if (day !== this.day) this.#rotate(day)
    this.stream.write(line + '\n')
  }

  #rotate(day) {
    this.stream?.end()
    this.day = day
    this.stream = fs.createWriteStream(path.join(this.dir, `${this.prefix}-${day}.log`), { flags: 'a' })
    this.stream.on('error', () => {}) // un disque plein ne doit pas faire tomber le bot
    this.purge()
  }

  purge(now = Date.now()) {
    if (this.retentionDays <= 0) return
    const limit = now - this.retentionDays * 86_400_000
    const re = new RegExp(`^${this.prefix}-(\\d{4})-(\\d{2})-(\\d{2})\\.log$`)
    for (const file of fs.readdirSync(this.dir)) {
      const m = re.exec(file)
      if (m && new Date(+m[1], +m[2] - 1, +m[3]).getTime() < limit) {
        fs.rmSync(path.join(this.dir, file), { force: true })
      }
    }
  }

  close() {
    return new Promise((resolve) => (this.stream ? this.stream.end(resolve) : resolve()))
  }
}

export class Logger {
  /**
   * @param {object} opts
   * @param {'debug'|'info'|'warn'|'error'} [opts.level]
   * @param {'pretty'|'plain'|'json'} [opts.format]
   * @param {string|null} [opts.dir]  dossier des fichiers de log (null = désactivé)
   * @param {number} [opts.retentionDays]
   * @param {NodeJS.WriteStream} [opts.out]
   */
  constructor({ level = 'info', format, dir = null, retentionDays = 14, out = process.stdout } = {}) {
    this.level  = LEVELS[level] ?? LEVELS.info
    this.out    = out
    this.format = format ?? (out.isTTY ? 'pretty' : 'plain')
    this.file   = dir ? new DailyFile(dir, retentionDays) : null
    this.listeners = new Set()
  }

  get color() { return this.format === 'pretty' }

  /** Écrit une ligne brute (bannières, encadrés) sur la console uniquement */
  raw(text = '') {
    this.out.write((this.color ? text : stripAnsi(text)) + '\n')
  }

  /** Abonnement aux événements (pour les statistiques / fichier d'état) */
  onEntry(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) }

  log(level, category, message, extra) {
    const now = new Date()
    const err = extra instanceof Error ? extra : null
    const entry = { time: now.toISOString(), level, category, message }
    if (err) entry.error = err.stack ?? String(err)
    else if (extra !== undefined) entry.data = extra

    for (const fn of this.listeners) fn(entry)

    // Fichier : tout à partir du niveau configuré, stack trace comprise
    if (this.file && LEVELS[level] >= this.level) {
      const base = `${localDate(now)} ${localTime(now)} ${LEVEL_STYLE[level].label} [${CATEGORIES[category]?.label ?? category}] ${stripAnsi(message)}`
      this.file.write(err ? `${base}\n${entry.error}` : base, now)
    }

    if (LEVELS[level] < this.level) return

    if (this.format === 'json') {
      this.out.write(JSON.stringify(entry) + '\n')
      return
    }

    const cat = CATEGORIES[category] ?? { label: category.toUpperCase(), color: ANSI.white }
    const lvl = LEVEL_STYLE[level]
    const tag = cat.label.padEnd(10)

    if (this.format === 'plain') {
      // journald ajoute déjà la date : on garde l'heure pour les fichiers copiés-collés
      this.out.write(`${lvl.label} [${tag}] ${stripAnsi(message)}\n`)
    } else {
      const msgColor = level === 'info' ? '' : lvl.color
      this.out.write(
        `${ANSI.dim}${localTime(now)}${ANSI.reset} ${lvl.color}${lvl.icon}${ANSI.reset} ` +
        `${cat.color}${ANSI.bold}${tag}${ANSI.reset} ${msgColor}${message}${ANSI.reset}\n`,
      )
    }
    if (err && this.level <= LEVELS.debug) this.out.write(`${ANSI.dim}${entry.error}${ANSI.reset}\n`)
  }

  debug(cat, msg, extra) { this.log('debug', cat, msg, extra) }
  info(cat, msg, extra)  { this.log('info',  cat, msg, extra) }
  warn(cat, msg, extra)  { this.log('warn',  cat, msg, extra) }
  error(cat, msg, extra) { this.log('error', cat, msg, extra) }

  /**
   * Redirige les logs internes des bibliothèques (module `debug`) vers ce logger.
   * Activé automatiquement en LOG_LEVEL=debug, ou via la variable DEBUG habituelle.
   */
  captureLibraryLogs(namespaces = 'bedrock-portal*,xbox-rta*,prismarine-auth*') {
    const logger = this
    createDebug.formatArgs = function () {} // pas de préfixe ni de couleur : on formate nous-mêmes
    createDebug.log = function (...args) {
      logger.debug('lib', `${this.namespace} ${util.format(...args)}`)
    }
    if (this.level <= LEVELS.debug && !process.env.DEBUG) createDebug.enable(namespaces)
  }

  close() { return this.file?.close() }
}

export { ANSI }
