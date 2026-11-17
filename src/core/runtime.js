/**
 * Socle commun aux commandes longues (passerelle, amis) : logger, stats,
 * résumé périodique, arrêt propre et filets de sécurité.
 */

import fs from 'node:fs'
import path from 'node:path'
import { Logger, describe } from './logger.js'
import { Stats } from './stats.js'
import { summaryLine } from './ui.js'
import { ROOT } from './config.js'

export const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version

export function createLogger(config) {
  const { level, format, dir, retentionDays } = config.log
  const log = new Logger({ level, format: format === 'auto' ? undefined : format, dir, retentionDays })
  log.captureLibraryLogs()
  return log
}

export function createRuntime(config, meta = {}) {
  const log   = createLogger(config)
  const stats = new Stats(path.join(config.dataDir, 'status.json'), {
    mode: config.mode,
    target: config.targetHost ? `${config.targetHost}:${config.targetPort}` : null,
    account: config.auth.username,
    version: VERSION,
    ...meta,
  })
  log.onEntry((entry) => stats.track(entry))

  const cleanups = []
  let stopping = false

  const stop = async (reason, code = 0) => {
    if (stopping) return
    stopping = true
    log.info('system', `Arrêt demandé (${reason})...`)
    const force = setTimeout(() => {
      log.error('system', 'Arrêt forcé après 10s')
      process.exit(1)
    }, 10_000)
    for (const fn of cleanups.reverse()) {
      await Promise.resolve().then(fn).catch(err => log.warn('system', `Nettoyage : ${describe(err)}`))
    }
    clearTimeout(force)
    log.info('stats', summaryLine(stats))
    stats.setState('offline')
    stats.flush()
    log.info('system', 'Arrêté proprement. À bientôt !')
    await log.close()
    process.exit(code)
  }

  process.on('SIGINT',  () => stop('Ctrl+C'))
  process.on('SIGTERM', () => stop('SIGTERM'))
  // Une erreur réseau isolée ne doit pas faire tomber le bot ; systemd relance en cas de crash réel
  process.on('unhandledRejection', (err) => log.error('system', `Erreur non gérée : ${describe(err)}`, err instanceof Error ? err : undefined))
  process.on('uncaughtException', (err) => {
    log.error('system', `Exception fatale : ${describe(err)}`, err)
    stop('crash', 1)
  })

  if (config.log.statsEveryMin > 0) {
    const t = setInterval(() => log.info('stats', summaryLine(stats)), config.log.statsEveryMin * 60_000)
    t.unref()
    cleanups.push(() => clearInterval(t))
  }

  return { log, stats, stop, onStop: (fn) => cleanups.push(fn) }
}
