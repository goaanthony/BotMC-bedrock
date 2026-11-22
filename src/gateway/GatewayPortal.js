/**
 * BedrockPortal avec les correctifs nécessaires pour tourner 24h/24 :
 *
 *  1. Transfert après apparition complète du joueur. bedrock-portal envoie le
 *     paquet `transfer` dès request_chunk_radius, alors que le jeu est encore en
 *     plein chargement : sur certaines plateformes (Windows 1.26.65, PS4/PS5) le
 *     jeu se ferme sans message. On amène d'abord le client dans un état
 *     « apparu » (chunk_radius_update, play_status player_spawn, creative_content)
 *     et on transfère quand il confirme (set_local_player_as_initialized).
 *     Même approche que LucienHH/bedrock-portal#30, plus un délai de secours.
 *  2. start() de bedrock-portal ajoute un listener 'connect' anonyme à chaque
 *     appel et ouvre un nouveau signaling sans fermer l'ancien : après un
 *     redémarrage, chaque connexion était traitée plusieurs fois. On garde un
 *     seul listener et on ferme l'ancien signaling.
 *  3. Les redémarrages concurrents sont regroupés et réessayés avec un délai
 *     croissant jusqu'à réussite.
 *  4. Les erreurs du WebSocket Xbox RTA sont capturées au lieu de faire planter
 *     le process (EventEmitter sans listener 'error').
 */

import { BedrockPortal } from 'bedrock-portal'
import startGame from 'bedrock-portal/dist/common/start_game.js'
import { describe } from '../core/logger.js'

const { sendStartGame } = startGame
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/** Événement émis sur le client quand le paquet transfer est envoyé ('spawned' | 'timeout') */
export const TRANSFER_EVENT = 'gateway:transfer'

export class GatewayPortal extends BedrockPortal {
  #listening   = false
  #restarting  = null
  #stopped     = false
  #libListener = null

  /**
   * @param {ConstructorParameters<typeof BedrockPortal>[0]} options
   * @param {import('../core/logger.js').Logger} log
   * @param {{ retryBaseMs?: number, spawnTimeoutMs?: number }} [opts]
   *   spawnTimeoutMs : délai max d'attente de l'apparition avant de transférer quand même
   */
  constructor(options, log, { retryBaseMs = 5_000, spawnTimeoutMs = 5_000 } = {}) {
    super(options)
    this.log = log
    this.retryBaseMs = retryBaseMs
    this.spawnTimeoutMs = spawnTimeoutMs
  }

  get restarting() { return this.#restarting !== null }

  async start() {
    this.#stopped = false
    if (this.#listening) {
      // (2) ferme l'ancien signaling avant que la lib en ouvre un nouveau
      await this.server.close('Redémarrage de la passerelle')
        .catch(err => this.log.warn('session', `Fermeture NetherNet : ${describe(err)}`))
      this.#listening = false
    }

    const before = new Set(this.server.listeners('connect'))
    this.#listening = true
    try {
      await super.start()
    } finally {
      // (2) la lib ajoute `(client) => this.onServerConnection(client)` à chaque start() :
      // on garde le premier (il appelle notre handler dynamiquement), on retire les suivants
      for (const fn of this.server.listeners('connect')) {
        if (before.has(fn)) continue
        if (!this.#libListener) this.#libListener = fn
        else this.server.removeListener('connect', fn)
      }
    }

    // (4) la lib gère la reconnexion RTA elle-même (Host#onSubscribe)
    this.host.rta?.on('error', (err) => this.log.warn('xbox', `Xbox RTA : ${describe(err)}`))
  }

  /**
   * (1) Remplace le handler de connexion de la lib (même vérification de nonce,
   * mêmes paquets de packs de ressources) avec un transfert après apparition.
   */
  onServerConnection = (client) => {
    const who = () => client.profile?.name ?? 'Joueur'
    let nonceValidated = false

    client.once('login', () => {
      const xuid = client.profile?.xuid
      const nonce = client.skinData?.Nonce
      const expected = xuid ? this.session.nonces[xuid] : undefined
      nonceValidated = typeof nonce === 'string' && nonce.length > 0 && nonce === expected
      if (!nonceValidated) {
        this.log.warn('player', `${who()} refusé : connexion hors de la session publiée (il doit relancer depuis l'onglet Amis)`)
        client.disconnect('Server authentication error')
      }
    })

    client.on('join', () => {
      if (!nonceValidated) return client.disconnect('Server authentication error')

      client.write('resource_packs_info', {
        must_accept: false,
        has_addons: false,
        has_scripts: false,
        disable_vibrant_visuals: false,
        world_template: { uuid: '', version: '' },
        texture_packs: [],
      })

      const onResourcePackResponse = (response) => {
        if (response.response_status === 'refused') {
          client.off('resource_pack_client_response', onResourcePackResponse)
          return client.disconnect('Resource packs refused')
        }
        if (response.response_status === 'send_packs' || response.response_status === 'have_all_packs') {
          return client.write('resource_pack_stack', {
            must_accept: false,
            resource_packs: [],
            game_version: '*',
            experiments: [],
            experiments_previously_used: false,
            has_editor_packs: false,
          })
        }
        if (response.response_status !== 'completed') return
        client.off('resource_pack_client_response', onResourcePackResponse)
        client.once('request_chunk_radius', (req) => this.spawnThenTransfer(client, req))
        sendStartGame(client)
      }
      client.on('resource_pack_client_response', onResourcePackResponse)
    })
  }

  /** Amène le client à l'état « apparu », puis le transfère */
  spawnThenTransfer(client, req) {
    client.write('chunk_radius_update', { chunk_radius: req?.chunk_radius ?? 12 })
    client.write('play_status', { status: 'player_spawn' })
    client.write('creative_content', { groups: [], items: [] })

    let done = false
    const transfer = (why) => {
      if (done) return
      done = true
      clearTimeout(timer)
      client.write('transfer', {
        server_address: this.options.ip,
        port: this.options.port,
        reload_world: false,
        gatherings_configuration: undefined,
      })
      client.emit(TRANSFER_EVENT, why)
    }
    // Filet de sécurité : si le client ne confirme jamais son apparition
    const timer = setTimeout(() => transfer('timeout'), this.spawnTimeoutMs)
    timer.unref?.()
    client.once('set_local_player_as_initialized', () => transfer('spawned'))
    client.once('close', () => { done = true; clearTimeout(timer) })
  }

  async end(resume = false) {
    if (resume) return this.restart()
    this.#stopped = true
    await super.end(false).catch(err => this.log.warn('session', `Fermeture de la session : ${describe(err)}`))
    await this.server.close('Passerelle arrêtée').catch(() => {})
    this.#listening = false
  }

  /** (3) Une seule recréation à la fois, réessayée jusqu'à réussite (ou arrêt). */
  restart(reason = 'Session Xbox perdue') {
    if (this.#restarting) return this.#restarting
    this.#restarting = (async () => {
      this.emit('restarting', reason)
      await super.end(false).catch(err => this.log.debug('session', `Abandon de l'ancienne session : ${describe(err)}`))

      for (let attempt = 1; !this.#stopped; attempt++) {
        try {
          await this.start()
          this.emit('restarted', reason)
          return
        } catch (err) {
          const delay = Math.min(60_000, this.retryBaseMs * attempt)
          this.log.error('session', `Recréation échouée (essai ${attempt}) : ${describe(err)} — nouvel essai dans ${Math.round(delay / 1000)}s`, err)
          await super.end(false).catch(() => {}) // nettoie un démarrage partiel
          await sleep(delay)
        }
      }
    })().finally(() => { this.#restarting = null })
    return this.#restarting
  }
}
