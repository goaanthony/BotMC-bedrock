/**
 * Publie une session Xbox neuve après chaque transfert.
 *
 * Un joueur déjà transféré ne peut pas rejoindre une deuxième fois la même
 * session : on la recrée, mais seulement quand personne n'est en train de se
 * connecter (sinon on couperait sa connexion).
 */

export class SessionRefresher {
  /**
   * @param {object} deps
   * @param {() => boolean} deps.isBusy       une connexion NetherNet est-elle en cours ?
   * @param {() => boolean} deps.isRestarting une recréation est-elle déjà en cours ?
   * @param {() => Promise<void>} deps.refresh
   * @param {number} delayMs
   */
  constructor({ isBusy, isRestarting, refresh }, delayMs = 3000) {
    this.isBusy = isBusy
    this.isRestarting = isRestarting
    this.refresh = refresh
    this.delayMs = delayMs
    this.pending = false
    this.lastJoinAt = 0
    this.timer = null
  }

  /** Un joueur vient de cliquer « Rejoindre » : on repousse la recréation */
  noteJoin(now = Date.now()) {
    this.lastJoinAt = now
    if (this.pending) this.#arm()
  }

  /** Un transfert a eu lieu : une recréation est nécessaire */
  request() {
    this.pending = true
    this.#arm()
  }

  #arm() {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.#tick(), this.delayMs)
    this.timer.unref?.()
  }

  #tick() {
    this.timer = null
    if (!this.pending) return
    const recentJoin = Date.now() - this.lastJoinAt < this.delayMs
    if (this.isRestarting() || this.isBusy() || recentJoin) return this.#arm()
    this.pending = false
    Promise.resolve(this.refresh()).catch(() => {})
  }

  stop() {
    clearTimeout(this.timer)
    this.timer = null
    this.pending = false
  }
}
