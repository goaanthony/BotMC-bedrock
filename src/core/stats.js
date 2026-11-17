/**
 * Statistiques d'exécution, persistées dans data/status.json pour que
 * `botmc status` puisse les afficher sans parler au process.
 */

import fs from 'node:fs'
import path from 'node:path'

const MAX_RECENT = 15

export class Stats {
  constructor(file = null, meta = {}) {
    this.file = file
    this.startedAt = new Date().toISOString()
    this.state = 'starting'          // starting | online | refreshing | offline
    this.meta = meta                 // mode, cible, compte…
    this.counters = {
      transfers: 0,
      joins: 0,
      friendsAccepted: 0,
      friendsRemoved: 0,
      sessionRefreshes: 0,
      errors: 0,
      warnings: 0,
    }
    this.players = new Map()         // gamertag -> { transfers, lastSeen }
    this.recent = []                 // derniers événements notables
    this.lastError = null
    this.timer = null
    if (file) fs.mkdirSync(path.dirname(file), { recursive: true })
  }

  setState(state) { this.state = state; this.save() }

  inc(counter, n = 1) { this.counters[counter] += n; this.save() }

  transfer(gamertag) {
    this.counters.transfers++
    const p = this.players.get(gamertag) ?? { transfers: 0, lastSeen: null }
    p.transfers++
    p.lastSeen = new Date().toISOString()
    this.players.set(gamertag, p)
    this.save()
  }

  /** Branché sur Logger#onEntry : garde l'historique des événements importants */
  track(entry) {
    if (entry.level === 'debug' || entry.category === 'lib' || entry.category === 'stats') return
    if (entry.level === 'error') { this.counters.errors++; this.lastError = { time: entry.time, message: entry.message } }
    if (entry.level === 'warn') this.counters.warnings++
    this.recent.push({ time: entry.time, level: entry.level, category: entry.category, message: entry.message })
    if (this.recent.length > MAX_RECENT) this.recent.shift()
    this.save()
  }

  get uniquePlayers() { return this.players.size }

  uptimeMs(now = Date.now()) { return now - Date.parse(this.startedAt) }

  snapshot() {
    return {
      pid: process.pid,
      state: this.state,
      startedAt: this.startedAt,
      updatedAt: new Date().toISOString(),
      ...this.meta,
      counters: { ...this.counters, uniquePlayers: this.uniquePlayers },
      players: Object.fromEntries(this.players),
      lastError: this.lastError,
      recent: this.recent,
    }
  }

  /** Écriture regroupée (au plus une par seconde), atomique via renommage */
  save() {
    if (!this.file || this.timer) return
    this.timer = setTimeout(() => { this.timer = null; this.flush() }, 1000)
    this.timer.unref?.()
  }

  flush() {
    if (!this.file) return
    clearTimeout(this.timer)
    this.timer = null
    try {
      const tmp = `${this.file}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(this.snapshot(), null, 2))
      fs.renameSync(tmp, this.file)
    } catch { /* l'état est informatif : on ignore les erreurs disque */ }
  }
}

export function formatDuration(ms) {
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return `${d}j ${h}h ${m}min`
  if (h) return `${h}h ${m}min`
  if (m) return `${m}min ${s % 60}s`
  return `${s % 60}s`
}
