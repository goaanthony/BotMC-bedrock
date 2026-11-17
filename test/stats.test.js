import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Stats, formatDuration } from '../src/core/stats.js'

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
