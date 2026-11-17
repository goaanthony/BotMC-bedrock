/**
 * friend-only.js — Mode BDS
 * Accepte automatiquement les demandes d'amis du compte bot, sans publier de
 * session. À utiliser quand le monde est hébergé par un Bedrock Dedicated
 * Server (avec le behavior pack de bds-pack/ pour le transfert).
 *
 * Usage : npm run friends
 */

import prismarineAuth from 'prismarine-auth'
import { loadConfig } from './config.js'
import { FriendManager } from './friendManager.js'
import { Dashboard } from './dashboard.js'

const { Authflow } = prismarineAuth

let config
try {
  config = loadConfig({ requireTarget: false })
} catch (err) {
  console.error(`\n  Configuration invalide : ${err.message}\n`)
  process.exit(1)
}

const dashboard = new Dashboard({
  mode:       'friends',
  account:    config.auth.username,
  targetHost: config.targetHost,
  targetPort: config.targetPort,
  friendPollInterval: config.friendPollInterval,
})

async function main() {
  // Même compte, même cache et mêmes options que le mode passerelle
  const { username, cache, options } = config.auth
  const authflow = new Authflow(username, cache, options,
    (res) => dashboard.authRequired(res.verification_uri, res.user_code))

  const manager = new FriendManager(authflow, config.friendPollInterval, dashboard)

  const shutdown = async () => { await manager.stop(); process.exit(0) }
  process.on('SIGINT',  shutdown)
  process.on('SIGTERM', shutdown)

  dashboard.log('…', 'DEMARRAGE', `Connexion du compte « ${username} »...`)
  await manager.start()
  dashboard.renderHeader()
  dashboard.log('▶', 'PRET', 'En écoute des demandes d\'amis', '\x1b[32m')
}

process.on('unhandledRejection', (err) => dashboard.warn(`Erreur non gérée : ${err?.message ?? err}`))

main().catch(err => {
  dashboard.error(`Erreur fatale : ${err.message}`)
  console.error(err)
  process.exit(1)
})
