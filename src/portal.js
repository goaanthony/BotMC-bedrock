/**
 * portal.js — Passerelle Minecraft Bedrock (mode principal)
 *
 * Flux (cf. documentation bedrock-portal) :
 *   1. Le compte bot se connecte à Xbox Live et publie une session NetherNet.
 *   2. Ses amis voient le monde dans l'onglet Amis et cliquent « Rejoindre ».
 *   3. bedrock-portal vérifie le joueur (nonce de session), envoie un faux
 *      start_game puis un paquet `transfer` vers TARGET_HOST:TARGET_PORT.
 *   4. Les demandes d'amis sont acceptées instantanément (Xbox RTA) et les
 *      followers sont ajoutés en retour.
 *
 * La session reste ouverte en permanence : plusieurs joueurs peuvent se
 * connecter et être transférés à la suite sans la recréer.
 */

import { Modules } from 'bedrock-portal'
import { loadConfig } from './config.js'
import { GatewayPortal } from './gatewayPortal.js'
import { Dashboard } from './dashboard.js'

let config
try {
  config = loadConfig()
} catch (err) {
  console.error(`\n  Configuration invalide : ${err.message}\n  Copie .env.example en .env et remplis-le.\n`)
  process.exit(1)
}

const dashboard = new Dashboard({
  mode:       'gateway',
  targetHost: config.targetHost,
  targetPort: config.targetPort,
  worldName:  config.world.hostName,
  joinability: config.joinabilityLabel,
  account:    config.auth.username,
  autoFriendAdd: config.autoFriendAdd,
})

const name = (player) => player?.profile?.gamertag ?? player?.profile?.xuid ?? 'Joueur'

function buildPortal() {
  const portal = new GatewayPortal({
    ip:          config.targetHost,
    port:        config.targetPort,
    joinability: config.joinability,
    host: {
      ...config.auth,
      onMsaCode: (res) => dashboard.authRequired(res.verification_uri, res.user_code),
    },
    world: config.world,
  }, (level, msg) => dashboard[level === 'info' ? 'session' : level](msg))

  // Accepte les demandes d'amis et invite directement la personne dans la session
  portal.use(Modules.AutoFriendAccept, { inviteOnAdd: true })

  // Ajoute en ami les comptes qui suivent le bot. Attention : retire aussi les amis
  // qui ne suivent plus le bot (comportement de la lib). Désactivable via AUTO_FRIEND_ADD=false
  if (config.autoFriendAdd) {
    portal.use(Modules.AutoFriendAdd, { inviteOnAdd: true })
  }

  // ── Événements Xbox Live ──────────────────────────────────────────────
  portal.on('friendAdded',   (p) => dashboard.friendAccepted(name(p), p?.profile?.xuid ?? '?'))
  portal.on('friendRemoved', (p) => dashboard.friendRemoved(name(p)))
  portal.on('playerJoin',    (p) => dashboard.playerJoined(name(p)))
  portal.on('playerLeave',   (p) => dashboard.playerLeft(name(p)))

  // ── Événements réseau (NetherNet) : suivi réel du transfert ───────────
  // Ce listener est attaché une seule fois : `portal.server` survit aux redémarrages.
  portal.server.on('connect', (client) => {
    client.once('login', () => dashboard.playerConnecting(client.profile?.name ?? 'Joueur'))
    // bedrock-portal envoie le paquet `transfer` à la réception de request_chunk_radius
    client.once('request_chunk_radius', () => {
      setImmediate(() => dashboard.playerTransferred(client.profile?.name ?? 'Joueur'))
    })
  })

  return portal
}

async function main() {
  dashboard.log('…', 'DEMARRAGE', 'Connexion à Xbox Live et publication de la session...')

  const portal = buildPortal()

  try {
    await portal.start()
  } catch (err) {
    dashboard.error(`Échec du démarrage : ${err.message}`)
    console.error(err)
    process.exit(1)
  }

  dashboard.renderHeader()
  dashboard.log('▶', 'PRET', 'Passerelle active — tes amis peuvent rejoindre depuis l\'onglet Amis', '\x1b[32m')

  let shuttingDown = false
  const shutdown = async (signal) => {
    if (shuttingDown) return
    shuttingDown = true
    dashboard.log('■', 'ARRET', `${signal} reçu — fermeture de la session...`)
    const force = setTimeout(() => process.exit(1), 10_000)
    await portal.end()
    clearTimeout(force)
    process.exit(0)
  }
  process.on('SIGINT',  () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

// Une erreur réseau isolée ne doit pas faire tomber la passerelle
process.on('unhandledRejection', (err) => dashboard.warn(`Erreur non gérée : ${err?.message ?? err}`))

main().catch((err) => {
  dashboard.error(`Erreur inattendue : ${err.message}`)
  console.error(err)
  process.exit(1)
})
