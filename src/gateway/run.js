/**
 * Mode passerelle (par défaut).
 *
 * Flux (cf. documentation bedrock-portal) :
 *   1. Le compte bot se connecte à Xbox Live et publie une session NetherNet.
 *   2. Ses amis voient le monde dans l'onglet Amis et cliquent « Rejoindre ».
 *   3. bedrock-portal vérifie le joueur (nonce de session), envoie un faux
 *      start_game puis un paquet `transfer` vers TARGET_HOST:TARGET_PORT.
 *   4. Les demandes d'amis sont acceptées instantanément (Xbox RTA) et les
 *      followers sont ajoutés en retour.
 *   5. Après chaque transfert, une session neuve est publiée (SessionRefresher).
 */

import { Modules } from 'bedrock-portal'
import { describe, ANSI as A } from '../core/logger.js'
import { formatMs } from '../core/stats.js'
import { createRuntime, VERSION } from '../core/runtime.js'
import { portalHostOptions } from '../core/auth.js'
import { banner } from '../core/ui.js'
import { GatewayPortal } from './GatewayPortal.js'
import { SessionRefresher } from './SessionRefresher.js'
import { describeClient } from '../core/client-info.js'

const gamertagOf = (player) => player?.profile?.gamertag ?? player?.profile?.xuid ?? 'Joueur'

export async function runGateway(config) {
  const { log, stats, stop, interactive, onStop } = createRuntime(config)
  banner(log, config, VERSION)

  const portal = new GatewayPortal({
    ip:          config.targetHost,
    port:        config.targetPort,
    joinability: config.joinability,
    host:        portalHostOptions(config, log),
    world:       config.world,
  }, log)

  // Accepte les demandes d'amis et invite directement la personne
  portal.use(Modules.AutoFriendAccept, { inviteOnAdd: true })
  // Ajoute les followers en ami (et retire ceux qui ne suivent plus : comportement de la lib)
  if (config.autoFriendAdd) portal.use(Modules.AutoFriendAdd, { inviteOnAdd: true })

  const refresher = new SessionRefresher({
    isBusy:       () => portal.server.clientCount > 0,
    isRestarting: () => portal.restarting,
    refresh:      () => portal.restart('Joueur transféré'),
  }, config.refreshDelayMs)

  // ── Session ────────────────────────────────────────────────────────────
  portal.on('sessionCreated', (s) => log.debug('session', `Session publiée : ${s?.name ?? portal.session.name}`))
  portal.on('restarting', (reason) => {
    stats.setState('refreshing')
    log.info('session', `${reason} — publication d'une session neuve...`)
  })
  portal.on('restarted', () => {
    stats.inc('sessionRefreshes')
    stats.setState('online')
    log.info('session', 'Session prête, le monde est de nouveau visible dans l\'onglet Amis')
  })

  // ── Amis ───────────────────────────────────────────────────────────────
  portal.on('friendAdded', (p) => {
    stats.inc('friendsAccepted')
    log.info('friend', `Nouvel ami : ${gamertagOf(p)}`)
  })
  portal.on('friendRemoved', (p) => {
    stats.inc('friendsRemoved')
    log.info('friend', `Ami retiré (ne suit plus le bot) : ${gamertagOf(p)}`)
  })

  // ── Joueurs (session Xbox) ─────────────────────────────────────────────
  // Heure du clic « Rejoindre » par XUID, pour mesurer le temps total jusqu'au serveur
  const joinedAt = new Map()
  portal.on('playerJoin', (p) => {
    stats.inc('joins')
    refresher.noteJoin()
    if (p?.profile?.xuid) joinedAt.set(String(p.profile.xuid), Date.now())
    log.info('player', `${gamertagOf(p)} a cliqué « Rejoindre »`)
  })
  portal.on('playerLeave', (p) => {
    // garde l'entrée quelques secondes : le départ de session peut précéder le transfert
    const xuid = p?.profile?.xuid && String(p.profile.xuid)
    if (xuid) setTimeout(() => joinedAt.delete(xuid), 30_000).unref()
    log.debug('player', `${gamertagOf(p)} a quitté la session Xbox`)
  })

  // ── Connexions NetherNet : suivi réel du transfert ─────────────────────
  // Attaché une seule fois : `portal.server` survit aux redémarrages.
  portal.server.on('connect', (client) => {
    const who = () => client.profile?.name ?? 'Joueur'
    const t0 = Date.now()
    let info = null
    let transferred = false

    client.once('login', () => {
      info = describeClient(client.skinData)
      stats.connection({ gamertag: who(), xuid: client.profile?.xuid, ...info })
      log.info('player', `${who()} se connecte  ${A.dim}${info.platform} · ${info.input} · ${info.version}${A.reset}`)
    })
    // bedrock-portal envoie le paquet `transfer` à la réception de request_chunk_radius
    client.once('request_chunk_radius', () => {
      transferred = true
      setImmediate(() => {
        const ms = Date.now() - t0
        const xuid = String(client.profile?.xuid ?? '')
        const clickedAt = joinedAt.get(xuid)
        joinedAt.delete(xuid)
        const totalMs = clickedAt ? Date.now() - clickedAt : null
        stats.transfer(who(), { ms, totalMs, platform: info?.platform })
        const timing = totalMs ? `${formatMs(ms)}, ${formatMs(totalMs)} depuis le clic` : formatMs(ms)
        log.info('transfer', `${who()} → ${config.targetHost}:${config.targetPort}  ${A.dim}(${timing})${A.reset}`)
      })
    })
    client.once('close', () => {
      if (transferred) return refresher.request()
      stats.failure()
      log.warn('player', `${who()} s'est déconnecté avant le transfert`)
    })
  })

  // ── Démarrage ──────────────────────────────────────────────────────────
  log.info('system', 'Connexion à Xbox Live et publication de la session...')
  try {
    await portal.start()
  } catch (err) {
    log.error('system', `Échec du démarrage : ${describe(err)}`, err)
    log.info('system', 'Vérifie la connexion du compte avec « botmc login » puis relance.')
    return stop('échec du démarrage', 1)
  }

  const gamertag = portal.host.profile?.gamertag
  stats.meta.gamertag = gamertag
  stats.setState('online')
  log.info('xbox', `Connecté en tant que ${gamertag ?? config.auth.username}`)
  log.info('session', 'Passerelle active — tes amis peuvent rejoindre depuis l\'onglet Amis')

  onStop(() => refresher.stop())
  onStop(() => portal.end())

  // Recréation manuelle : touche R, ou « botmc console » (signal SIGUSR2)
  const manualRefresh = () => {
    if (portal.restarting) return log.info('session', 'Une recréation est déjà en cours')
    portal.restart('Demande manuelle')
  }
  process.on('SIGUSR2', manualRefresh)
  interactive({ r: manualRefresh })
}
