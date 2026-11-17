import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Stats, formatDuration, formatMs, timingSummary, newDay } from '../src/core/stats.js'

test('compte les transferts et les joueurs uniques', () => {
  const s = new Stats()
  s.transfer('Steve'); s.transfer('Alex'); s.transfer('Steve')
  assert.equal(s.counters.transfers, 3)
  assert.equal(s.uniquePlayers, 2)
  assert.equal(s.players.get('Steve').transfers, 2)
})

test('garde les derniers événements et compte les erreurs', () => {
  const s = new Stats()
  for (let i = 0; i < 20; i++) s.track({ time: '', level: 'info', category: 'session', message: `m${i}` })
  s.track({ time: 't', level: 'error', category: 'system', message: 'boom' })
  s.track({ time: '', level: 'debug', category: 'lib', message: 'ignoré' })
  assert.equal(s.recent.length, 15)
  assert.equal(s.recent.at(-1).message, 'boom')
  assert.equal(s.counters.errors, 1)
  assert.deepEqual(s.lastError, { time: 't', message: 'boom' })
})

test('écrit un fichier d\'état lisible', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'botmc-'))
  const file = path.join(dir, 'data', 'status.json')
  const s = new Stats(file, { mode: 'gateway' })
  s.transfer('Steve')
  s.setState('online')
  s.flush()
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(json.state, 'online')
  assert.equal(json.mode, 'gateway')
  assert.equal(json.counters.transfers, 1)
  assert.equal(json.counters.uniquePlayers, 1)
  fs.rmSync(dir, { recursive: true })
})

test('formatDuration', () => {
  assert.equal(formatDuration(5_000), '5s')
  assert.equal(formatDuration(125_000), '2min 5s')
  assert.equal(formatDuration(3_725_000), '1h 2min')
  assert.equal(formatDuration(90_000_000), '1j 1h 0min')
})

test('fiche du jour : joueurs uniques, plateformes, activité par heure', () => {
  const s = new Stats()
  const at = new Date(2026, 10, 17, 21, 5)
  s.connection({ gamertag: 'Steve', platform: 'Windows', input: 'Clavier/souris', version: '1.21.120', language: 'fr-FR' }, at)
  s.connection({ gamertag: 'Alex', platform: 'Switch', input: 'Manette', version: '1.21.120' }, at)
  s.connection({ gamertag: 'Steve', platform: 'Windows', input: 'Clavier/souris', version: '1.21.120' }, at)
  const day = s.today(at)
  assert.equal(day.connections, 3)
  assert.equal(Object.keys(day.players).length, 2)
  assert.deepEqual(day.platforms, { Windows: 2, Switch: 1 })
  assert.equal(day.hours[21], 3)
  assert.equal(day.players.Steve.connections, 2)
  assert.deepEqual(s.allTime.bestDay, { date: '2026-11-17', players: 2 })
})

test('temps de transfert : moyenne, médiane, 95e centile', () => {
  const s = new Stats()
  for (const ms of [400, 500, 600, 700, 2800]) s.transfer('Steve', { ms, totalMs: ms + 2000 })
  const t = timingSummary(s.today().timing.transfer)
  assert.equal(t.count, 5)
  assert.equal(t.avg, 1000)
  assert.equal(t.median, 600)
  assert.equal(t.p95, 2800)
  assert.equal(t.min, 400)
  assert.equal(timingSummary(s.today().timing.total).avg, 3000)
  assert.equal(timingSummary(newDay().timing.transfer), null)
})

test('les chiffres du jour survivent à un redémarrage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'botmc-'))
  const file = path.join(dir, 'status.json')
  const a = new Stats(file)
  a.connection({ gamertag: 'Steve', platform: 'Xbox', input: 'Manette', version: '1.21' })
  a.transfer('Steve', { ms: 800, platform: 'Xbox' })
  a.failure()
  a.flush()
  const b = new Stats(file)
  assert.equal(b.today().transfers, 1)
  assert.equal(b.today().failures, 1)
  assert.equal(b.allTime.transfers, 1)
  assert.equal(b.allTime.players.Steve.platform, 'Xbox')
  assert.equal(b.counters.transfers, 0) // compteurs « depuis le démarrage » remis à zéro
  b.transfer('Steve', { ms: 600 })
  assert.equal(b.today().timing.transfer.count, 2)
  fs.rmSync(dir, { recursive: true })
})

test('formatMs', () => {
  assert.equal(formatMs(812.4), '812 ms')
  assert.equal(formatMs(2140), '2,1 s')
  assert.equal(formatMs(null), '—')
})
