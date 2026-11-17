import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Logger, stripAnsi } from '../src/core/logger.js'
import { Stats } from '../src/core/stats.js'
import { renderDetails, renderPlayers, ago } from '../src/core/panels.js'
import { colorizeFileLine } from '../src/console.js'

const capture = () => {
  let text = ''
  return { log: new Logger({ format: 'plain', out: { isTTY: false, write: (s) => { text += s } } }), text: () => text }
}

test('panneau E vide (aucun joueur)', () => {
  const c = capture()
  renderDetails(c.log, new Stats().snapshot())
  assert.match(c.text(), /Joueurs uniques\s+0/)
  assert.match(c.text(), /aucune donnée pour l'instant/)
  assert.match(c.text(), /aucune connexion aujourd'hui/)
})

test('panneau E rempli', () => {
  const s = new Stats()
  s.connection({ gamertag: 'Steve', platform: 'Windows', input: 'Clavier/souris', version: '1.21.120' })
  s.connection({ gamertag: 'Alex', platform: 'Switch', input: 'Manette', version: '1.21.120' })
  s.transfer('Steve', { ms: 800, totalMs: 3000 })
  s.transfer('Alex', { ms: 1200 })
  const c = capture()
  renderDetails(c.log, s.snapshot())
  const out = c.text()
  assert.match(out, /Joueurs uniques\s+2/)
  assert.match(out, /Transferts réussis\s+2\s+100 % de réussite/)
  assert.match(out, /1 s moy/)
  assert.match(out, /Windows\s+█+░*\s+1\s+50 %/)
  assert.match(out, /Steve\s+Windows\s+1 transfert/)
  // aucune ligne d'encadré ne dépasse la largeur
  for (const line of out.split('\n').filter(l => /^[│╭╰]/.test(l))) assert.ok([...stripAnsi(line)].length <= 78, line)
})

test('panneau J', () => {
  const s = new Stats()
  s.connection({ gamertag: 'Steve', platform: 'iOS', input: 'Tactile', version: '1.21.120' })
  const c = capture()
  renderPlayers(c.log, s.snapshot())
  assert.match(c.text(), /Joueurs d'aujourd'hui \(1\)/)
  assert.match(c.text(), /Steve\s+iOS\s+Tactile/)
})

test('ago()', () => {
  const now = Date.parse('2026-11-17T12:00:00Z')
  assert.equal(ago('2026-11-17T11:59:30Z', now), 'à l\'instant')
  assert.equal(ago('2026-11-17T11:55:00Z', now), 'il y a 5 min')
  assert.equal(ago('2026-11-17T09:00:00Z', now), 'il y a 3 h')
  assert.equal(ago(null, now), '—')
})

test('console : recoloration des lignes du fichier de log', () => {
  const line = colorizeFileLine('2026-11-17 21:05:00 INF [TRANSFERT] Steve → play.exemple.fr:19132')
  assert.equal(stripAnsi(line), '21:05:00 • TRANSFERT  Steve → play.exemple.fr:19132')
  assert.match(colorizeFileLine('    at foo (bar.js:1:1)'), /\x1b\[2m/)
})
