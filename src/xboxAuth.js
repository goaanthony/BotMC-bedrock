/**
 * xboxAuth.js
 * Gère l'authentification Xbox Live via prismarine-auth.
 * Au premier lancement, ouvre une URL pour que l'utilisateur se connecte.
 * Les tokens sont mis en cache pour les prochains lancements.
 */

import prismarineAuth from 'prismarine-auth'
import path from 'path'
import fs from 'fs'

const { Authflow, Titles } = prismarineAuth

/**
 * Crée et retourne un flux d'authentification Xbox Live.
 * @param {string} cacheDir - Répertoire où stocker les tokens en cache
 * @param {string} accountLabel - Label pour identifier le compte dans les logs
 * @returns {Authflow} Instance Authflow prête à l'emploi
 */
export function createAuthflow(cacheDir, accountLabel = 'gateway') {
  // S'assure que le répertoire de cache existe
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
    console.log(`[Auth] Répertoire de cache créé : ${cacheDir}`)
  }

  const authflow = new Authflow(
    accountLabel, // Identifiant unique pour ce compte dans le cache
    cacheDir,     // Répertoire de stockage des tokens
    {
      // prismarine-auth utilise le titre Nintendo Switch pour cette authentification Bedrock.
      // Cela affecte la plateforme affichée ; ce flux ne lance pas un client Minecraft.
      authTitle: Titles.MinecraftNintendoSwitch,
      deviceType: 'Nintendo',
      flow: 'live'  // Flow OAuth Device Code (ouverture URL dans le navigateur)
    },
    // Callback appelé quand l'utilisateur doit s'authentifier
    (response) => {
      console.log('\n' + '='.repeat(60))
      console.log('[Auth] 🔑 AUTHENTIFICATION XBOX LIVE REQUISE')
      console.log('='.repeat(60))
      console.log(`[Auth] 1. Ouvre cette URL dans ton navigateur :`)
      console.log(`[Auth]    ${response.verification_uri}`)
      console.log(`[Auth] 2. Entre ce code : ${response.user_code}`)
      console.log(`[Auth] 3. Connecte-toi avec le compte Xbox hôte`)
      console.log('='.repeat(60) + '\n')
    }
  )

  return authflow
}

/**
 * Obtient un token XSTS valide pour les appels à l'API Xbox Live.
 * @param {Authflow} authflow - Instance Authflow
 * @returns {Promise<{userHash: string, XSTSToken: string}>}
 */
export async function getXboxToken(authflow) {
  try {
    const xboxToken = await authflow.getXboxToken('http://xboxlive.com')
    return xboxToken
  } catch (err) {
    throw err
  }
}

/**
 * Construit le header d'autorisation Xbox Live.
 * @param {{userHash: string, XSTSToken: string}} xboxToken
 * @returns {string} Header Authorization formaté
 */
export function buildXboxAuthHeader(xboxToken) {
  return `XBL3.0 x=${xboxToken.userHash};${xboxToken.XSTSToken}`
}
