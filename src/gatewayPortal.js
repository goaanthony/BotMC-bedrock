/**
 * gatewayPortal.js
 * BedrockPortal avec trois correctifs pour un fonctionnement 24h/24 :
 *
 *  1. start() de bedrock-portal ouvre un nouveau signaling NetherNet et ré-attache
 *     son handler 'connect' à chaque appel, sans fermer l'ancien. Après un
 *     redémarrage (end(true)), chaque connexion était traitée plusieurs fois,
 *     ce qui cassait le transfert. On ferme proprement avant de redémarrer.
 *  2. Les redémarrages concurrents (déclenchés par la lib quand la connexion
 *     RTA change) sont regroupés et réessayés avec un délai croissant.
 *  3. Les erreurs du WebSocket Xbox RTA sont capturées au lieu de faire
 *     planter le process (EventEmitter sans listener 'error').
 */

import { BedrockPortal } from 'bedrock-portal'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export class GatewayPortal extends BedrockPortal {
  #listening  = false
  #restarting = null
  #stopped    = false

  /** @param {(level: 'info'|'warn'|'error', msg: string) => void} log */
  constructor(options, log = () => {}) {
    super(options)
    this.log = log
  }

  async start() {
    this.#stopped = false
    // (1) Retire le handler de la lib avant qu'elle le ré-attache, et ferme l'ancien signaling
    this.server.removeListener('connect', this.onServerConnection)
    if (this.#listening) {
      await this.server.close('Redémarrage de la passerelle')
        .catch(err => this.log('warn', `Fermeture NetherNet : ${err.message}`))
      this.#listening = false
    }

    this.#listening = true
    await super.start()

    // (3) Erreurs RTA : on logge, la lib gère la reconnexion via onSubscribe
    this.host.rta?.on('error', (err) => this.log('warn', `Xbox RTA : ${err.message}`))
  }

  async end(resume = false) {
    if (!resume) {
      this.#stopped = true
      await super.end(false).catch(err => this.log('warn', `Fermeture session : ${err.message}`))
      await this.server.close('Passerelle arrêtée').catch(() => {})
      this.#listening = false
      return
    }
    return this.restart()
  }

  get restarting() { return this.#restarting !== null }

  /** (2) Redémarre la session une seule fois à la fois, en réessayant jusqu'à réussite. */
  restart(reason = 'Session Xbox perdue') {
    if (this.#restarting) return this.#restarting
    this.#restarting = (async () => {
      this.log('info', `${reason} — recréation de la session...`)
      await super.end(false).catch(err => this.log('warn', `Abandon de l'ancienne session : ${err.message}`))

      for (let attempt = 1; !this.#stopped; attempt++) {
        try {
          await this.start()
          this.log('info', 'Session recréée')
          return
        } catch (err) {
          const delay = Math.min(60_000, 5_000 * attempt)
          this.log('error', `Recréation échouée (essai ${attempt}) : ${err.message} — nouvel essai dans ${delay / 1000}s`)
          await super.end(false).catch(() => {})  // nettoie un démarrage partiel
          await sleep(delay)
        }
      }
    })().finally(() => { this.#restarting = null })
    return this.#restarting
  }
}
