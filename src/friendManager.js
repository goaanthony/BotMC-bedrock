/**
 * friendManager.js
 * Acceptation automatique des demandes d'amis Xbox Live, sans session de jeu.
 * Réutilise le client REST de bedrock-portal et le même déclencheur que son
 * module AutoFriendAccept (événement RTA « IncomingFriendRequestCountChanged »),
 * avec une vérification périodique en filet de sécurité.
 */

import Rest from 'bedrock-portal/dist/rest.js'
import xboxRta from 'xbox-rta'

const { XboxRTA } = xboxRta

export class FriendManager {
  /**
   * @param {import('prismarine-auth').Authflow} authflow
   * @param {number} pollIntervalMs
   * @param {import('./dashboard.js').Dashboard} dashboard
   */
  constructor(authflow, pollIntervalMs, dashboard) {
    this.authflow  = authflow
    this.rest      = new Rest.default(authflow)
    this.interval  = pollIntervalMs
    this.dashboard = dashboard
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
        if (accepted.has(person.xuid)) this.dashboard.friendAccepted(person.gamertag, person.xuid)
        else this.dashboard.warn(`Demande de ${person.gamertag} non acceptée par Xbox`)
      }
    })()
      .catch(err => this.dashboard.warn(`Vérification des amis : ${err.message}`))
      .finally(() => { this.running = null })
    return this.running
  }

  async start() {
    const token = await this.authflow.getXboxToken()
    const xuid  = token.userXUID

    this.rta = new XboxRTA(this.authflow)
    this.rta.on('error', (err) => this.dashboard.warn(`Xbox RTA : ${err.message}`))
    this.rta.on('event', (event) => {
      if (event.data?.NotificationType === 'IncomingFriendRequestCountChanged') this.check()
    })
    await this.rta.connect()
    await this.rta.subscribe(`https://social.xboxlive.com/users/xuid(${xuid})/friends`)

    await this.check()
    this.timer = setInterval(() => this.check(), this.interval)
  }

  async stop() {
    clearInterval(this.timer)
    this.timer = null
    await this.rta?.destroy().catch(() => {})
    this.rta = null
  }
}
