/**
 * Décrit l'appareil d'un joueur à partir des données de connexion Bedrock
 * (client data du paquet login : DeviceOS, CurrentInputMode, GameVersion…).
 */

/** DeviceOS → plateforme lisible (cf. BuildPlatform de Bedrock) */
const PLATFORMS = {
  1: 'Android',
  2: 'iOS',
  3: 'macOS',
  4: 'Fire OS',
  5: 'Gear VR',
  6: 'HoloLens',
  7: 'Windows',
  8: 'Windows',
  9: 'Serveur',
  10: 'Apple TV',
  11: 'PlayStation',
  12: 'Switch',
  13: 'Xbox',
  14: 'Windows Phone',
  15: 'Linux',
}

const INPUTS = {
  1: 'Clavier/souris',
  2: 'Tactile',
  3: 'Manette',
  4: 'Contrôleur VR',
}

/** Ex. « fr_FR » → « fr-FR » */
const normLang = (code) => (typeof code === 'string' && code ? code.replace('_', '-') : null)

/**
 * @param {object} [skinData] client data décodé (client.skinData)
 * @returns {{ platform: string, input: string, version: string, language: string|null, model: string|null }}
 */
export function describeClient(skinData = {}) {
  const s = skinData ?? {}
  return {
    platform: PLATFORMS[s.DeviceOS] ?? 'Inconnue',
    input:    INPUTS[s.CurrentInputMode] ?? 'Inconnu',
    version:  typeof s.GameVersion === 'string' && s.GameVersion ? s.GameVersion : 'Inconnue',
    language: normLang(s.LanguageCode),
    model:    typeof s.DeviceModel === 'string' && s.DeviceModel ? s.DeviceModel : null,
  }
}
