/**
 * Mode « amis seulement » (BDS) : accepte les demandes d'amis du compte bot
 * sans publier de session. Le transfert est fait par le behavior pack bds-pack/.
 */

import { createRuntime, VERSION } from '../core/runtime.js'
import { describe } from '../core/logger.js'
import { createAuthflow, fetchProfile } from '../core/auth.js'
import { banner } from '../core/ui.js'
import { FriendManager } from './FriendManager.js'

export async function runFriends(config) {
  const { log, stats, stop, onStop } = createRuntime(config)
  banner(log, config, VERSION)

  const authflow = createAuthflow(config, log)
  const manager  = new FriendManager(authflow, config.friendPollInterval, log)
  manager.on('accepted', (person) => {
    stats.inc('friendsAccepted')
    log.info('friend', `Nouvel ami : ${person.gamertag}`)
  })

  log.info('system', `Connexion du compte « ${config.auth.username} »...`)
  try {
    await manager.start()
  } catch (err) {
    log.error('system', `Échec du démarrage : ${describe(err)}`, err)
    return stop('échec du démarrage', 1)
  }
  onStop(() => manager.stop())

  const { gamertag } = await fetchProfile(authflow).catch(() => ({}))
  stats.meta.gamertag = gamertag
  stats.setState('online')
  log.info('xbox', `Connecté en tant que ${gamertag ?? config.auth.username}`)
  log.info('friend', 'En écoute des demandes d\'amis')
}
