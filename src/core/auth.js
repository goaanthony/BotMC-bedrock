/**
 * Authentification Xbox Live du compte bot (cache partagé entre tous les modes).
 */

import fs from 'node:fs'
import prismarineAuth from 'prismarine-auth'
import Rest from 'bedrock-portal/dist/rest.js'
import { authBox } from './ui.js'

const { Authflow } = prismarineAuth

/** Options `host` pour BedrockPortal, avec l'affichage du code de connexion */
export function portalHostOptions(config, log) {
  fs.mkdirSync(config.auth.cache, { recursive: true, mode: 0o700 })
  return {
    ...config.auth,
    onMsaCode: (res) => authBox(log, res.verification_uri, res.user_code),
  }
}

export function createAuthflow(config, log) {
  const { username, cache, options, onMsaCode } = portalHostOptions(config, log)
  return new Authflow(username, cache, options, onMsaCode)
}

/** Récupère le profil Xbox (gamertag, xuid) du compte connecté */
export async function fetchProfile(authflow) {
  const token = await authflow.getXboxToken()
  const profile = await new Rest.default(authflow).getProfile(token.userXUID).catch(() => null)
  return { xuid: token.userXUID, gamertag: profile?.gamertag ?? token.userXUID }
}
