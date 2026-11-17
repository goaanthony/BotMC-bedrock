import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Logger, DailyFile, describe, stripAnsi } from '../src/core/logger.js'

const sink = () => {
  const lines = []
  return { lines, isTTY: false, write: (s) => { lines.push(s) } }
}

test('filtre par niveau et formate en texte hors terminal', () => {
  const out = sink()
  const log = new Logger({ level: 'info', out })
  log.debug('system', 'caché')
  log.info('transfer', 'Steve → serveur')
  log.warn('xbox', 'attention')
  assert.equal(out.lines.length, 2)
  assert.equal(out.lines[0], 'INF [TRANSFERT ] Steve → serveur\n')
  assert.match(out.lines[1], /^WRN \[XBOX/)
  assert.equal(out.lines.join('').includes('\x1b['), false)
})

test('format json', () => {
  const out = sink()
  new Logger({ format: 'json', out }).error('system', 'boom', new Error('x'))
  const e = JSON.parse(out.lines[0])
  assert.equal(e.level, 'error')
  assert.equal(e.message, 'boom')
  assert.match(e.error, /Error: x/)
})

test('les abonnés reçoivent tous les événements, même filtrés', () => {
  const log = new Logger({ level: 'error', out: sink() })
  const seen = []
  log.onEntry((e) => seen.push(e.level))
  log.info('system', 'a')
  log.error('system', 'b')
  assert.deepEqual(seen, ['info', 'error'])
})

test('fichier journalier avec stack trace et purge des anciens fichiers', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'botmc-'))
  fs.writeFileSync(path.join(dir, 'botmc-2000-01-01.log'), 'vieux')
  fs.writeFileSync(path.join(dir, 'autre.txt'), 'à garder')
  const log = new Logger({ dir, retentionDays: 7, out: sink() })
  log.error('session', 'échec', new Error('détail'))
  await log.close()
  const files = fs.readdirSync(dir).sort()
  assert.equal(files.includes('botmc-2000-01-01.log'), false)
  assert.equal(files.includes('autre.txt'), true)
  const today = files.find(f => f.startsWith('botmc-'))
  const content = fs.readFileSync(path.join(dir, today), 'utf8')
  assert.match(content, /ERR \[SESSION\] échec/)
  assert.match(content, /Error: détail/)
  fs.rmSync(dir, { recursive: true })
})

test('rotation au changement de jour', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'botmc-'))
  const f = new DailyFile(dir, 0)
  f.write('a', new Date(2026, 0, 1, 23, 59))
  f.write('b', new Date(2026, 0, 2, 0, 1))
  await f.close()
  assert.deepEqual(fs.readdirSync(dir).sort(), ['botmc-2026-01-01.log', 'botmc-2026-01-02.log'])
  fs.rmSync(dir, { recursive: true })
})

test('describe() affiche la cause réseau', () => {
  const err = new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ENOTFOUND', hostname: 'login.live.com' }) })
  assert.equal(describe(err), 'fetch failed (ENOTFOUND login.live.com)')
  assert.equal(describe(new Error('simple')), 'simple')
  assert.equal(stripAnsi('\x1b[31mrouge\x1b[0m'), 'rouge')
})
