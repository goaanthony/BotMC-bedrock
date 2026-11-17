import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { BedrockPortal } from 'bedrock-portal'
import { GatewayPortal } from '../src/gateway/GatewayPortal.js'
import { Logger } from '../src/core/logger.js'

const original = { start: BedrockPortal.prototype.start, end: BedrockPortal.prototype.end }
let calls

before(() => {
  // Simule la lib : start() ré-attache son handler 'connect' à chaque appel
  BedrockPortal.prototype.start = async function () {
    calls.starts++
    if (calls.failNext > 0) { calls.failNext--; throw new Error('simulé') }
    this.server.on('connect', this.onServerConnection)
  }
  BedrockPortal.prototype.end = async function () { calls.ends++ }
})
after(() => Object.assign(BedrockPortal.prototype, original))

const make = () => {
  calls = { starts: 0, ends: 0, closes: 0, failNext: 0 }
  const log = new Logger({ level: 'error', out: { isTTY: false, write() {} } })
  const p = new GatewayPortal({ ip: 'exemple.fr' }, log, { retryBaseMs: 1 })
  p.server.close = async () => { calls.closes++ }
  return p
}

test('un seul handler connect après plusieurs redémarrages', async () => {
  const p = make()
  await p.start()
  await p.restart()
  await p.restart()
  assert.equal(p.server.listenerCount('connect'), 1)
  assert.equal(calls.closes, 2) // l'ancien signaling est fermé à chaque redémarrage
})

test('les redémarrages simultanés sont regroupés', async () => {
  const p = make()
  await p.start()
  await Promise.all([p.restart(), p.restart(), p.end(true)])
  assert.equal(calls.starts, 2)
})

test('réessaie jusqu\'à réussite et émet restarting/restarted', async () => {
  const p = make()
  await p.start()
  const events = []
  p.on('restarting', () => events.push('restarting'))
  p.on('restarted', () => events.push('restarted'))
  calls.failNext = 2
  await p.restart()
  assert.equal(calls.starts, 4)
  assert.deepEqual(events, ['restarting', 'restarted'])
  assert.equal(p.restarting, false)
})

test('end() ferme le serveur NetherNet', async () => {
  const p = make()
  await p.start()
  await p.end()
  assert.equal(calls.closes, 1)
})
