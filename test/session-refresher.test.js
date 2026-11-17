import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SessionRefresher } from '../src/gateway/SessionRefresher.js'

const setup = (state = {}) => {
  const s = { busy: false, restarting: false, refreshes: 0, ...state }
  const r = new SessionRefresher({
    isBusy: () => s.busy,
    isRestarting: () => s.restarting,
    refresh: async () => { s.refreshes++ },
  }, 3000)
  return { s, r }
}

test('recrée la session après le délai', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { s, r } = setup()
  r.request()
  t.mock.timers.tick(2999)
  assert.equal(s.refreshes, 0)
  t.mock.timers.tick(1)
  assert.equal(s.refreshes, 1)
})

test('attend la fin des connexions en cours', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { s, r } = setup({ busy: true })
  r.request()
  t.mock.timers.tick(9000)
  assert.equal(s.refreshes, 0)
  s.busy = false
  t.mock.timers.tick(3000)
  assert.equal(s.refreshes, 1)
})

test('un clic « Rejoindre » récent repousse la recréation', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { s, r } = setup()
  r.request()
  t.mock.timers.tick(2000)
  r.noteJoin()
  t.mock.timers.tick(2000)
  assert.equal(s.refreshes, 0)
  t.mock.timers.tick(1000)
  assert.equal(s.refreshes, 1)
})

test('plusieurs transferts rapprochés → une seule recréation', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { s, r } = setup()
  r.request(); r.request(); r.request()
  t.mock.timers.tick(10_000)
  assert.equal(s.refreshes, 1)
})

test('stop() annule la recréation prévue', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { s, r } = setup()
  r.request()
  r.stop()
  t.mock.timers.tick(10_000)
  assert.equal(s.refreshes, 0)
})

