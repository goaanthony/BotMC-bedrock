/**
 * Acceptation automatique des demandes d'amis Xbox Live, sans session de jeu.
 * Même déclencheur que le module AutoFriendAccept de bedrock-portal (événement
 * RTA « IncomingFriendRequestCountChanged »), plus une vérification périodique
 * en filet de sécurité.
 */

import { EventEmitter } from 'node:events'
import Rest from 'bedrock-portal/dist/rest.js'
import xboxRta from 'xbox-rta'
import { describe } from '../core/logger.js'

const { XboxRTA } = xboxRta

export class FriendManager extends EventEmitter {
  /**
   * @param {import('prismarine-auth').Authflow} authflow
   * @param {number} pollIntervalMs
   * @param {import('../core/logger.js').Logger} log
   * @param {{ rest?: any, createRta?: (auth: any) => any }} [deps] injectables pour les tests
   */
  constructor(authflow, pollIntervalMs, log, deps = {}) {
    super()
    this.authflow  = authflow
    this.rest      = deps.rest ?? new Rest.default(authflow)
    this.createRta = deps.createRta ?? ((auth) => new XboxRTA(auth))
    this.interval  = pollIntervalMs
    this.log       = log
    this.rta       = null
    this.timer     = null
    this.running   = null
  }

  /** Accepte toutes les demandes en attente. Les appels concurrents sont regroupés. */
  check() {
    if (this.running) return this.running
    this.running = (async () => {
      const requests = await this.rest.getFriendRequestsReceived()
      if (!requests?.length) return
      const res      = await this.rest.acceptFriendRequests(requests.map(r => r.xuid))
      const accepted = new Set(res?.updatedPeople ?? [])
      for (const person of requests) {
        if (accepted.has(person.xuid)) this.emit('accepted', person)
        else this.log.warn('friend', `Demande de ${person.gamertag} refusée par Xbox`)
      }
    })()
      .catch(err => this.log.warn('friend', `Vérification des demandes d'amis : ${describe(err)}`))
      .finally(() => { this.running = null })
    return this.running
  }

  async start() {
    const token = await this.authflow.getXboxToken()

    this.rta = this.createRta(this.authflow)
    this.rta.on('error', (err) => this.log.warn('xbox', `Xbox RTA : ${describe(err)}`))
    this.rta.on('event', (event) => {
      if (event.data?.NotificationType === 'IncomingFriendRequestCountChanged') this.check()
    })
    await this.rta.connect()
    await this.rta.subscribe(`https://social.xboxlive.com/users/xuid(${token.userXUID})/friends`)

    await this.check()
    this.timer = setInterval(() => this.check(), this.interval)
    return token
  }

  async stop() {
    clearInterval(this.timer)
    this.timer = null
    await this.rta?.destroy().catch(() => {})
    this.rta = null
  }
}
