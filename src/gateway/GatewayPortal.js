/**
 * BedrockPortal avec les correctifs nécessaires pour tourner 24h/24 :
 *
 *  1. start() de bedrock-portal ouvre un nouveau signaling NetherNet et ré-attache
 *     son handler 'connect' à chaque appel sans fermer l'ancien : après un
 *     redémarrage, chaque connexion était traitée plusieurs fois et le transfert
 *     cassait. On ferme proprement avant de redémarrer.
 *  2. Les redémarrages concurrents sont regroupés et réessayés avec un délai
 *     croissant jusqu'à réussite.
 *  3. Les erreurs du WebSocket Xbox RTA sont capturées au lieu de faire planter
 *     le process (EventEmitter sans listener 'error').
 */

import { BedrockPortal } from 'bedrock-portal'
import { describe } from '../core/logger.js'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export class GatewayPortal extends BedrockPortal {
  #listening  = false
  #restarting = null
  #stopped    = false

  /**
   * @param {ConstructorParameters<typeof BedrockPortal>[0]} options
   * @param {import('../core/logger.js').Logger} log
   * @param {{ retryBaseMs?: number }} [opts]
   */
  constructor(options, log, { retryBaseMs = 5_000 } = {}) {
    super(options)
    this.log = log
    this.retryBaseMs = retryBaseMs
  }

  get restarting() { return this.#restarting !== null }

  async start() {
    this.#stopped = false
    // (1) retire le handler de la lib avant qu'elle le ré-attache, ferme l'ancien signaling
    this.server.removeListener('connect', this.onServerConnection)
    if (this.#listening) {
      await this.server.close('Redémarrage de la passerelle')
        .catch(err => this.log.warn('session', `Fermeture NetherNet : ${describe(err)}`))
      this.#listening = false
    }

    this.#listening = true
    await super.start()

    // (3) la lib gère la reconnexion RTA elle-même (Host#onSubscribe)
    this.host.rta?.on('error', (err) => this.log.warn('xbox', `Xbox RTA : ${describe(err)}`))
  }

  async end(resume = false) {
    if (resume) return this.restart()
    this.#stopped = true
    await super.end(false).catch(err => this.log.warn('session', `Fermeture de la session : ${describe(err)}`))
    await this.server.close('Passerelle arrêtée').catch(() => {})
    this.#listening = false
  }

  /** (2) Une seule recréation à la fois, réessayée jusqu'à réussite (ou arrêt). */
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
