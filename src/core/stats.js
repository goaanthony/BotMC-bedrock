/**
 * Statistiques du bot.
 *
 *  - `counters` : depuis le démarrage du process (résumés périodiques) ;
 *  - `days`     : une fiche par jour (joueurs, plateformes, temps de transfert,
 *                 activité par heure…), conservée HISTORY_DAYS jours ;
 *  - `allTime`  : cumul depuis la première installation.
 *
 * Tout est persisté dans data/status.json (écriture atomique, au plus une fois
 * par seconde) et rechargé au démarrage : un redémarrage ne remet pas à zéro
 * les chiffres du jour. `botmc status` / `botmc stats` lisent ce même fichier.
 */

import fs from 'node:fs'
import path from 'node:path'

const MAX_RECENT   = 15
const MAX_SAMPLES  = 500     // durées gardées pour la médiane / le 95e centile
const HISTORY_DAYS = 30

const pad2 = (n) => String(n).padStart(2, '0')
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

const newTiming = () => ({ count: 0, sum: 0, min: null, max: null, samples: [] })

export const newDay = () => ({
  connections: 0,       // connexions à la passerelle
  transfers: 0,         // transferts réussis
  failures: 0,          // déconnexions avant le transfert
  joins: 0,             // clics « Rejoindre » (session Xbox)
  friendsAccepted: 0,
  sessionRefreshes: 0,
  errors: 0,
  warnings: 0,
  players: {},          // gamertag -> { xuid, platform, input, version, transfers, connections, firstSeen, lastSeen }
  platforms: {},
  inputs: {},
  versions: {},
  languages: {},
  hours: Array(24).fill(0), // connexions par heure
  timing: { transfer: newTiming(), total: newTiming() },
  lastTransfer: null,
})

const newAllTime = () => ({
  since: new Date().toISOString(),
  connections: 0,
  transfers: 0,
  failures: 0,
  friendsAccepted: 0,
  sessionRefreshes: 0,
  players: {},          // gamertag -> { platform, transfers, firstSeen, lastSeen }
  platforms: {},
  timing: { transfer: newTiming(), total: newTiming() },
  bestDay: null,        // { date, players }
})

const bump = (obj, key, n = 1) => { obj[key] = (obj[key] ?? 0) + n }

function addTiming(t, ms) {
  t.count++
  t.sum += ms
  t.min = t.min == null ? ms : Math.min(t.min, ms)
  t.max = t.max == null ? ms : Math.max(t.max, ms)
  t.samples.push(ms)
  if (t.samples.length > MAX_SAMPLES) t.samples.shift()
}

/** moyenne, médiane, 95e centile, min, max d'une série de durées */
export function timingSummary(t) {
  if (!t?.count) return null
  const sorted = [...t.samples].sort((a, b) => a - b)
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  return { count: t.count, avg: t.sum / t.count, median: pick(0.5), p95: pick(0.95), min: t.min, max: t.max }
}

export class Stats {
  constructor(file = null, meta = {}) {
    this.file = file
    this.startedAt = new Date().toISOString()
    this.state = 'starting'          // starting | online | refreshing | offline
    this.meta = meta                 // mode, cible, compte…
    this.counters = {
      transfers: 0,
      joins: 0,
      connections: 0,
      failures: 0,
      friendsAccepted: 0,
      friendsRemoved: 0,
      sessionRefreshes: 0,
      errors: 0,
      warnings: 0,
    }
    this.players = new Map()         // depuis le démarrage : gamertag -> { transfers, lastSeen }
    this.recent = []
    this.lastError = null
    this.days = {}
    this.allTime = newAllTime()
    this.timer = null
    if (file) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      this.#load()
    }
  }

  #load() {
    try {
      const prev = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (prev.allTime) this.allTime = { ...newAllTime(), ...prev.allTime }
      for (const [k, d] of Object.entries(prev.days ?? {})) this.days[k] = { ...newDay(), ...d }
    } catch { /* premier démarrage ou fichier illisible : on repart de zéro */ }
  }

  /** Fiche du jour (créée à la volée, purge des jours trop anciens) */
  today(now = new Date()) {
    const key = dayKey(now)
    if (!this.days[key]) {
      this.days[key] = newDay()
      const keys = Object.keys(this.days).sort()
      for (const k of keys.slice(0, Math.max(0, keys.length - HISTORY_DAYS))) delete this.days[k]
    }
    return this.days[key]
  }

  setState(state) { this.state = state; this.save() }

  /** Compteur simple (friendsAccepted, sessionRefreshes, joins…) */
  inc(counter, n = 1) {
    bump(this.counters, counter, n)
    const day = this.today()
    if (counter in day) bump(day, counter, n)
    if (counter in this.allTime) bump(this.allTime, counter, n)
    this.save()
  }

  /**
   * Un joueur s'est connecté à la passerelle.
   * @param {{ gamertag: string, xuid?: string, platform: string, input: string, version: string, language?: string|null }} c
   */
  connection(c, now = new Date()) {
    const day = this.today(now)
    this.counters.connections++
    day.connections++
    this.allTime.connections++
    day.hours[now.getHours()]++
    bump(day.platforms, c.platform)
    bump(day.inputs, c.input)
    bump(day.versions, c.version)
    if (c.language) bump(day.languages, c.language)

    const iso = now.toISOString()
    const p = day.players[c.gamertag] ?? { transfers: 0, connections: 0, firstSeen: iso }
    Object.assign(p, { xuid: c.xuid, platform: c.platform, input: c.input, version: c.version, lastSeen: iso })
    p.connections++
    day.players[c.gamertag] = p

    const players = Object.keys(day.players).length
    if (!this.allTime.bestDay || players > this.allTime.bestDay.players) {
      this.allTime.bestDay = { date: dayKey(now), players }
    }
    this.save()
  }

  /**
   * Transfert réussi.
   * @param {string} gamertag
   * @param {{ ms?: number, totalMs?: number|null, platform?: string }} [t]
   *   ms : connexion → transfert ; totalMs : clic « Rejoindre » → transfert
   */
  transfer(gamertag, { ms, totalMs, platform } = {}, now = new Date()) {
    const day = this.today(now)
    const iso = now.toISOString()
    this.counters.transfers++
    day.transfers++
    this.allTime.transfers++
    day.lastTransfer = { gamertag, time: iso }

    const s = this.players.get(gamertag) ?? { transfers: 0, lastSeen: null }
    s.transfers++
    s.lastSeen = iso
    this.players.set(gamertag, s)

    const dp = day.players[gamertag] ?? { transfers: 0, connections: 0, firstSeen: iso, platform }
    dp.transfers++
    dp.lastSeen = iso
    day.players[gamertag] = dp

    const ap = this.allTime.players[gamertag] ?? { transfers: 0, firstSeen: iso }
    ap.transfers++
    ap.lastSeen = iso
    if (platform ?? dp.platform) ap.platform = platform ?? dp.platform
    if (!this.allTime.players[gamertag] && ap.platform) bump(this.allTime.platforms, ap.platform)
    this.allTime.players[gamertag] = ap

    if (Number.isFinite(ms)) { addTiming(day.timing.transfer, ms); addTiming(this.allTime.timing.transfer, ms) }
    if (Number.isFinite(totalMs)) { addTiming(day.timing.total, totalMs); addTiming(this.allTime.timing.total, totalMs) }
    this.save()
  }

  /** Déconnexion avant le transfert */
  failure() {
    this.counters.failures++
    this.today().failures++
    this.allTime.failures++
    this.save()
  }

  /** Branché sur Logger#onEntry : historique des événements importants */
  track(entry) {
    if (entry.level === 'debug' || entry.category === 'lib' || entry.category === 'stats') return
    if (entry.level === 'error') {
      this.counters.errors++
      this.today().errors++
      this.lastError = { time: entry.time, message: entry.message }
    }
    if (entry.level === 'warn') { this.counters.warnings++; this.today().warnings++ }
    this.recent.push({ time: entry.time, level: entry.level, category: entry.category, message: entry.message })
    if (this.recent.length > MAX_RECENT) this.recent.shift()
    this.save()
  }

  get uniquePlayers() { return this.players.size }

  uptimeMs(now = Date.now()) { return now - Date.parse(this.startedAt) }

  snapshot() {
    this.today() // garantit la fiche du jour (et la purge)
    const mem = process.memoryUsage()
    return {
      pid: process.pid,
      state: this.state,
      startedAt: this.startedAt,
      updatedAt: new Date().toISOString(),
      ...this.meta,
      memory: { rss: mem.rss, heapUsed: mem.heapUsed },
      counters: { ...this.counters, uniquePlayers: this.uniquePlayers },
      players: Object.fromEntries(this.players),
      lastError: this.lastError,
      recent: this.recent,
      allTime: this.allTime,
      days: this.days,
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
      fs.writeFileSync(tmp, JSON.stringify(this.snapshot()))
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

/** 812 → « 812 ms », 2140 → « 2,1 s » */
export function formatMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1).replace(/\.0$/, '').replace('.', ',')} s`
}
