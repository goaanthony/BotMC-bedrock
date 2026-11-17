/**
 * friendManager.js
 * Acceptation automatique des demandes d'amis Xbox Live.
 * Compatible avec le nouveau système d'amis bidirectionnel Xbox (2024+).
 */

import { buildXboxAuthHeader, getXboxToken } from './xboxAuth.js'

const PEOPLEHUB_API = 'https://peoplehub.xboxlive.com'
const SOCIAL_API    = 'https://social.xboxlive.com'

async function getPendingFriendRequests(authHeader) {
  const people = await tryGetPeople(
    authHeader,
    `${PEOPLEHUB_API}/users/me/people/friendrequests(received)`,
    '7'
  )
  if (!people) return null
  return people
    .filter(p => p.xuid)
    .map(p => ({ xuid: p.xuid, gamertag: p.gamertag || 'Inconnu' }))
}

async function tryGetPeople(authHeader, url, contractVersion = '2') {
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization':          authHeader,
        'x-xbl-contract-version': contractVersion,
        'Accept':                 'application/json',
        'Accept-Language':        'en-GB'
      }
    })
    if (!res.ok) return null
    const text = await res.text()
    if (!text?.trim()) return []
    const data = JSON.parse(text)
    return Array.isArray(data?.people) ? data.people : null
  } catch {
    return null
  }
}

async function acceptFriendRequest(authHeader, xuid, gamertag, dashboard) {
  const url = `${SOCIAL_API}/users/me/people/friends/v2/xuid(${encodeURIComponent(xuid)})`
  try {
    const res  = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Accept':        'application/json',
        'Accept-Language': 'en-GB'
      }
    })
    const text = await res.text()
    if (!res.ok) {
      dashboard?.warn(`Acceptation echouee pour ${gamertag} (${res.status})`)
      return false
    }
    if (text.trim()) {
      const data = JSON.parse(text)
      if (data.isFriend !== true) {
        dashboard?.warn(`Xbox n'a pas confirme ${gamertag} comme ami`)
        return false
      }
    }
    dashboard?.friendAccepted(gamertag, xuid)
    return true
  } catch (err) {
    dashboard?.warn(`Erreur acceptation de ${gamertag} : ${err.message}`)
    return false
  }
}

export class FriendManager {
  /**
   * @param {import('prismarine-auth').Authflow} authflow
   * @param {number} pollIntervalMs
   * @param {import('./dashboard.js').Dashboard} [dashboard]
   */
  constructor(authflow, pollIntervalMs = 30000, dashboard = null) {
    this.authflow       = authflow
    this.pollIntervalMs = pollIntervalMs
    this.dashboard      = dashboard
    this._timer         = null
    this._authHeader    = null
    this._tokenExpiry   = 0
  }

  async _getAuthHeader() {
    const now = Date.now()
    if (!this._authHeader || now >= this._tokenExpiry - 5 * 60 * 1000) {
      const token       = await getXboxToken(this.authflow)
      this._authHeader  = buildXboxAuthHeader(token)
      this._tokenExpiry = now + 20 * 60 * 60 * 1000
    }
    return this._authHeader
  }

  async _processFriendRequests() {
    try {
      const authHeader = await this._getAuthHeader()
      const pending    = await getPendingFriendRequests(authHeader)
      if (!pending || pending.length === 0) return

      for (const { xuid, gamertag } of pending) {
        await acceptFriendRequest(authHeader, xuid, gamertag, this.dashboard)
        await new Promise(r => setTimeout(r, 500))
      }
    } catch (err) {
      this.dashboard?.error(`Erreur : ${err.message}`)
      if (err.message?.includes('401') || err.message?.includes('403')) {
        this._authHeader  = null
        this._tokenExpiry = 0
      }
    }
  }

  async start() {
    await this._processFriendRequests()
    this._timer = setInterval(() => this._processFriendRequests(), this.pollIntervalMs)
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  }
}
