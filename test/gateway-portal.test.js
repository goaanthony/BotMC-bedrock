import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { BedrockPortal } from 'bedrock-portal'
import { GatewayPortal, TRANSFER_EVENT } from '../src/gateway/GatewayPortal.js'
import { Logger } from '../src/core/logger.js'

const original = { start: BedrockPortal.prototype.start, end: BedrockPortal.prototype.end }
let calls

before(() => {
  // Imite bedrock-portal 2.8.2 : chaque start() ajoute un listener ANONYME
  BedrockPortal.prototype.start = async function () {
    calls.starts++
    if (calls.failNext > 0) { calls.failNext--; throw new Error('simulé') }
    this.server.on('connect', (client) => this.onServerConnection(client))
  }
  BedrockPortal.prototype.end = async function () { calls.ends++ }
})
after(() => Object.assign(BedrockPortal.prototype, original))

const quiet = () => new Logger({ level: 'error', out: { isTTY: false, write() {} } })

const make = (opts = {}) => {
  calls = { starts: 0, ends: 0, closes: 0, failNext: 0, handled: 0 }
  const p = new GatewayPortal({ ip: 'exemple.fr', port: 19133 }, quiet(), { retryBaseMs: 1, ...opts })
  p.server.close = async () => { calls.closes++ }
  return p
}

test('un seul traitement par connexion, même après plusieurs redémarrages', async () => {
  const p = make()
  p.onServerConnection = () => { calls.handled++ }
  p.server.on('connect', () => {}) // listener de suivi de run.js : doit être conservé
  await p.start()
  await p.restart()
  await p.restart()
  assert.equal(p.server.listenerCount('connect'), 2)
  p.server.emit('connect', new EventEmitter())
  assert.equal(calls.handled, 1)
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

/** Faux client NetherNet qui enregistre les paquets envoyés */
const fakeClient = (xuid = '42', nonce = 'abc') => {
  const c = new EventEmitter()
  c.profile = { name: 'Steve', xuid }
  c.skinData = { Nonce: nonce }
  c.sent = []
  c.write = (name, params) => c.sent.push({ name, params })
  c.disconnect = (reason) => c.sent.push({ name: 'disconnect', params: reason })
  return c
}

const handshake = (p, c) => {
  p.onServerConnection(c)
  c.emit('login')
  c.emit('join')
  c.emit('resource_pack_client_response', { response_status: 'have_all_packs' })
  c.emit('resource_pack_client_response', { response_status: 'completed' })
}

test('transfert seulement après l\'apparition du joueur', async () => {
  const p = make()
  p.session.nonces = { 42: 'abc' }
  const c = fakeClient()
  const transfers = []
  c.on(TRANSFER_EVENT, (why) => transfers.push(why))

  handshake(p, c)
  assert.ok(c.sent.some(s => s.name === 'start_game'))
  c.emit('request_chunk_radius', { chunk_radius: 8, max_radius: 32 })
  const afterChunk = c.sent.map(s => s.name)
  assert.deepEqual(afterChunk.slice(-3), ['chunk_radius_update', 'play_status', 'creative_content'])
  assert.equal(afterChunk.includes('transfer'), false) // pas encore
  assert.equal(c.sent.find(s => s.name === 'chunk_radius_update').params.chunk_radius, 8)
  assert.equal(c.sent.find(s => s.name === 'play_status').params.status, 'player_spawn')

  c.emit('set_local_player_as_initialized', { runtime_entity_id: 1n })
  const t = c.sent.at(-1)
  assert.equal(t.name, 'transfer')
  assert.deepEqual(t.params, { server_address: 'exemple.fr', port: 19133, reload_world: false, gatherings_configuration: undefined })
  assert.deepEqual(transfers, ['spawned'])
})

test('délai de secours si le joueur ne confirme jamais', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const p = make({ spawnTimeoutMs: 5000 })
  p.session.nonces = { 42: 'abc' }
  const c = fakeClient()
  const transfers = []
  c.on(TRANSFER_EVENT, (why) => transfers.push(why))
  handshake(p, c)
  c.emit('request_chunk_radius', {})
  t.mock.timers.tick(4999)
  assert.equal(transfers.length, 0)
  t.mock.timers.tick(1)
  assert.deepEqual(transfers, ['timeout'])
  c.emit('set_local_player_as_initialized', {}) // pas de 2e transfert
  assert.equal(c.sent.filter(s => s.name === 'transfer').length, 1)
})

test('refuse un joueur sans nonce valide', () => {
  const p = make()
  p.session.nonces = { 42: 'abc' }
  const c = fakeClient('42', 'mauvais')
  p.onServerConnection(c)
  c.emit('login')
  assert.deepEqual(c.sent, [{ name: 'disconnect', params: 'Server authentication error' }])
})
