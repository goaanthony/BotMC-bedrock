/**
 * portal.js
 * Passerelle Minecraft Bedrock via Xbox Live & NetherNet (WebRTC).
 *
 * Flux :
 *   1. Le bot s'authentifie sur Xbox Live et publie une session MPSD.
 *   2. Les amis voient le monde dans l'onglet Amis et cliquent "Rejoindre".
 *   3. bedrock-portal gère le transfer automatiquement vers ip:port.
 *   4. Les demandes d'amis sont acceptées instantanément via Xbox RTA.
 *   5. Après chaque départ, la session est entièrement recréée pour
 *      accepter de nouvelles connexions NetherNet.
 */

import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import { BedrockPortal, Joinability, Modules } from 'bedrock-portal'
import prismarineAuth from 'prismarine-auth'
import { Dashboard } from './dashboard.js'

const { Titles } = prismarineAuth
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const CONFIG = {
  targetHost:   process.env.TARGET_HOST        || '72.61.198.158',
  targetPort:   parseInt(process.env.TARGET_PORT   || '19132', 10),
  worldName:    process.env.WORLD_NAME         || 'Mon Serveur Minecraft',
  motd:         process.env.GATEWAY_MOTD       || 'Rejoins le serveur !',
  maxPlayers:   parseInt(process.env.MAX_PLAYERS   || '20', 10),
  authCacheDir: path.resolve(__dirname, '..', process.env.AUTH_CACHE_DIR || './auth_cache'),
  accountLabel: process.env.HOST_ACCOUNT_LABEL || 'gateway-host',
}

const dashboard = new Dashboard(CONFIG)

// ── Création du portail ───────────────────────────────────────────────────────

function buildPortal() {
  const portal = new BedrockPortal({
    ip:          CONFIG.targetHost,
    port:        CONFIG.targetPort,
    joinability: Joinability.FriendsOfFriends,
    host: {
      username: CONFIG.accountLabel,
      cache:    CONFIG.authCacheDir,
      options: {
        authTitle:  Titles.MinecraftNintendoSwitch,
        deviceType: 'Nintendo',
        flow:       'live',
      },
      onMsaCode: (res) => {
        dashboard.authRequired(res.verification_uri, res.user_code)
      },
    },
    world: {
      hostName:       CONFIG.worldName,
      name:           CONFIG.motd,
      version:        '1.26.60',
      memberCount:    1,
      maxMemberCount: CONFIG.maxPlayers,
    },
  })

  portal.use(Modules.AutoFriendAccept, { inviteOnAdd: true })
  portal.use(Modules.AutoFriendAdd,    { inviteOnAdd: true })

  return portal
}

// ── Attache les événements ────────────────────────────────────────────────────

function attachEvents(portal) {
  portal.on('friendAdded', (player) => {
    const gamertag = player?.profile?.gamertag ?? player?.gamertag ?? 'Inconnu'
    const xuid     = player?.profile?.xuid     ?? player?.xuid     ?? '???'
    dashboard.friendAccepted(gamertag, xuid)
  })

  portal.on('playerJoin', (player) => {
    const gamertag = player?.profile?.gamertag ?? player?.gamertag ?? 'Joueur'
    dashboard.playerConnecting(gamertag)
    dashboard.playerRedirected(gamertag)
  })

  portal.on('playerLeave', async (player) => {
    const gamertag = player?.profile?.gamertag ?? player?.gamertag ?? 'Joueur'
    dashboard.playerDisconnected(gamertag)

    // Petit délai pour laisser le temps à Xbox Live de propager le départ
    await new Promise(r => setTimeout(r, 1500))

    // Recrée une session MPSD + un nouveau listener NetherNet
    // Sans ça, la prochaine tentative de connexion WebRTC est rejetée
    dashboard.log('⟳', 'SESSION', 'Recréation de la session en cours...', '\x1b[36m')
    try {
      await portal.end(true)   // end() + start() → nouvelle session, même auth
      dashboard.log('✓', 'SESSION', 'Session recréée — prêt pour la prochaine connexion', '\x1b[32m')
    } catch (err) {
      dashboard.warn(`Recréation de session échouée : ${err.message}`)
    }
  })
}

// ── Démarrage ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  ⏳ Initialisation de la passerelle Minecraft...\n')

  const portal = buildPortal()
  attachEvents(portal)

  try {
    await portal.start()
    dashboard.renderHeader()
    dashboard.log('▶', 'PRÊT', `Passerelle active — les amis peuvent rejoindre !`, '\x1b[32m')
  } catch (err) {
    dashboard.error(`Échec du démarrage : ${err.message}`)
    console.error(err)
    process.exit(1)
  }

  // ── Arrêt propre ──────────────────────────────────────────────────────────

  const shutdown = async (signal) => {
    console.log(`\n  Signal ${signal} reçu — fermeture en cours...`)
    await portal.end()
    console.log('  ✅ Passerelle fermée.\n')
    process.exit(0)
  }

  process.on('SIGINT',  () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('\n❌ Erreur inattendue :', err)
  process.exit(1)
})
