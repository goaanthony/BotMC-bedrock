import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseConfig, ConfigError } from '../src/core/config.js'

test('valeurs par défaut en mode passerelle', () => {
  const c = parseConfig({ TARGET_HOST: 'play.exemple.fr' })
  assert.equal(c.mode, 'gateway')
  assert.equal(c.targetPort, 19132)
  assert.equal(c.joinabilityLabel, 'friends_of_friends')
  assert.equal(c.autoFriendAdd, true)
  assert.equal(c.log.level, 'info')
  assert.equal(c.auth.options.flow, 'sisu')
})

test('TARGET_HOST obligatoire en mode passerelle seulement', () => {
  assert.throws(() => parseConfig({}), ConfigError)
  assert.doesNotThrow(() => parseConfig({ BOT_MODE: 'friends' }))
})

test('rejette les valeurs invalides', () => {
  const base = { TARGET_HOST: 'x' }
  assert.throws(() => parseConfig({ ...base, TARGET_PORT: '70000' }), /TARGET_PORT/)
  assert.throws(() => parseConfig({ ...base, TARGET_PORT: 'abc' }), /TARGET_PORT/)
  assert.throws(() => parseConfig({ ...base, JOINABILITY: 'public' }), /JOINABILITY/)
  assert.throws(() => parseConfig({ ...base, AUTO_FRIEND_ADD: 'peut-être' }), /AUTO_FRIEND_ADD/)
  assert.throws(() => parseConfig({ ...base, BOT_MODE: 'realm' }), /BOT_MODE/)
  assert.throws(() => parseConfig({ ...base, FRIEND_POLL_INTERVAL_MS: '100' }), /FRIEND_POLL/)
})

test('booléens en français et en anglais', () => {
  assert.equal(parseConfig({ TARGET_HOST: 'x', AUTO_FRIEND_ADD: 'non' }).autoFriendAdd, false)
  assert.equal(parseConfig({ TARGET_HOST: 'x', AUTO_FRIEND_ADD: 'TRUE' }).autoFriendAdd, true)
  assert.equal(parseConfig({ TARGET_HOST: 'x', LOG_TO_FILE: 'false' }).log.dir, null)
})

test('DEBUG active le niveau debug par défaut', () => {
  assert.equal(parseConfig({ TARGET_HOST: 'x', DEBUG: 'bedrock-portal*' }).log.level, 'debug')
  assert.equal(parseConfig({ TARGET_HOST: 'x', DEBUG: '1', LOG_LEVEL: 'warn' }).log.level, 'warn')
})
