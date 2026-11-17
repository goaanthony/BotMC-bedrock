import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { FriendManager } from '../src/friends/FriendManager.js'
import { Logger } from '../src/core/logger.js'

const quiet = () => new Logger({ level: 'error', out: { isTTY: false, write() {} } })

const setup = (requests) => {
  const rest = {
    calls: 0,
    async getFriendRequestsReceived() { this.calls++; return requests },
    async acceptFriendRequests(xuids) { return { updatedPeople: xuids.filter(x => x !== '3') } },
  }
  const rta = Object.assign(new EventEmitter(), {
    subscribed: null,
    async connect() {},
    async subscribe(uri) { this.subscribed = uri },
    async destroy() {},
  })
  const auth = { getXboxToken: async () => ({ userXUID: '42' }) }
  const fm = new FriendManager(auth, 60_000, quiet(), { rest, createRta: () => rta })
  return { fm, rest, rta }
}

test('accepte les demandes et signale celles refusées par Xbox', async () => {
  const { fm } = setup([{ xuid: '1', gamertag: 'A' }, { xuid: '3', gamertag: 'C' }])
  const accepted = []
  fm.on('accepted', (p) => accepted.push(p.gamertag))
  await fm.check()
  assert.deepEqual(accepted, ['A'])
})

test('s\'abonne aux notifications et réagit aux nouvelles demandes', async () => {
  const { fm, rest, rta } = setup([])
  await fm.start()
  assert.equal(rta.subscribed, 'https://social.xboxlive.com/users/xuid(42)/friends')
  assert.equal(rest.calls, 1)
  rta.emit('event', { data: { NotificationType: 'IncomingFriendRequestCountChanged' } })
  rta.emit('event', { data: { NotificationType: 'Autre' } })
  await fm.running
  assert.equal(rest.calls, 2)
  await fm.stop()
})

test('les vérifications simultanées sont regroupées', async () => {
  const { fm, rest } = setup([])
  await Promise.all([fm.check(), fm.check(), fm.check()])
  assert.equal(rest.calls, 1)
})
