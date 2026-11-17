/**
 * friend-only.js
 * Mode "BDS Gateway" : accepte automatiquement les demandes d'amis Xbox Live.
 * Le BDS (bedrock_server.exe) héberge le monde. Ce script gère uniquement les amis.
 *
 * Usage : npm run friends
 */

import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import { createAuthflow } from './xboxAuth.js'
import { FriendManager } from './friendManager.js'
import { Dashboard } from './dashboard.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const CONFIG = {
  friendPollInterval: parseInt(process.env.FRIEND_POLL_INTERVAL_MS || '30000', 10),
  authCacheDir:       path.resolve(__dirname, '..', process.env.AUTH_CACHE_DIR || './auth_cache'),
  accountLabel:       process.env.HOST_ACCOUNT_LABEL || 'gateway-host',
  targetHost:         process.env.TARGET_HOST || '72.61.198.158',
  targetPort:         parseInt(process.env.TARGET_PORT || '19132', 10),
  worldName:          'Bot Auto-Amis Xbox Live',
  mode:               'friends'
}

const dashboard = new Dashboard(CONFIG)

async function main() {
  dashboard.renderHeader()
  dashboard.log('>', 'DEMARRAGE', `Connexion au compte Xbox "${CONFIG.accountLabel}"...`, '\x1b[33m')

  const authflow     = createAuthflow(CONFIG.authCacheDir, CONFIG.accountLabel)
  const friendManager = new FriendManager(authflow, CONFIG.friendPollInterval, dashboard)

  process.on('SIGINT',  () => { friendManager.stop(); process.exit(0) })
  process.on('SIGTERM', () => { friendManager.stop(); process.exit(0) })

  await friendManager.start()
  dashboard.log('>', 'PRET', `En ecoute — verifie les amis toutes les ${CONFIG.friendPollInterval / 1000}s`, '\x1b[32m')
}

main().catch(err => {
  dashboard.error(`Erreur fatale : ${err.message}`)
  console.error(err)
  process.exit(1)
})
