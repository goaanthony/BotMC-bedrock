import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeClient } from '../src/core/client-info.js'

test('traduit les données de connexion Bedrock', () => {
  assert.deepEqual(describeClient({ DeviceOS: 12, CurrentInputMode: 3, GameVersion: '1.21.120', LanguageCode: 'fr_FR', DeviceModel: 'Switch' }), {
    platform: 'Switch', input: 'Manette', version: '1.21.120', language: 'fr-FR', model: 'Switch',
  })
  assert.equal(describeClient({ DeviceOS: 7 }).platform, 'Windows')
  assert.equal(describeClient({ DeviceOS: 8 }).platform, 'Windows')
  assert.equal(describeClient({ DeviceOS: 11 }).platform, 'PlayStation')
})

test('valeurs inconnues ou absentes', () => {
  const d = describeClient(undefined)
  assert.equal(d.platform, 'Inconnue')
  assert.equal(d.input, 'Inconnu')
  assert.equal(d.language, null)
  assert.equal(describeClient({ DeviceOS: 99 }).platform, 'Inconnue')
})
