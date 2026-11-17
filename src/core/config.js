/**
 * Configuration unique, lue depuis le fichier .env du projet et validée.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import prismarineAuth from 'prismarine-auth'
import { Joinability } from 'bedrock-portal'

const { Titles } = prismarineAuth

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export class ConfigError extends Error {}

const JOINABILITY = {
  friends_of_friends: Joinability.FriendsOfFriends,
  friends_only:       Joinability.FriendsOnly,
  invite_only:        Joinability.InviteOnly,
}
const MODES       = ['gateway', 'friends']
const LOG_LEVELS  = ['debug', 'info', 'warn', 'error']
const LOG_FORMATS = ['auto', 'pretty', 'plain', 'json']

/** Charge .env (sans écraser les variables déjà définies dans l'environnement) */
export function loadEnvFile(file = process.env.BOTMC_ENV_FILE || path.join(ROOT, '.env')) {
  dotenv.config({ path: file, quiet: true })
  return file
}

/**
 * @param {Record<string, string|undefined>} env
 * @param {{ requireTarget?: boolean }} [opts]
 */
export function parseConfig(env, { requireTarget } = {}) {
  const str = (name, def) => {
    const v = env[name]?.trim()
    return v ? v : def
  }
  const int = (name, def, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
    const raw = str(name)
    if (raw === undefined) return def
    const n = Number(raw)
    if (!Number.isInteger(n) || n < min || n > max) {
      throw new ConfigError(`${name} invalide : « ${raw} » (entier entre ${min} et ${max} attendu)`)
    }
    return n
  }
  const bool = (name, def) => {
    const raw = str(name)
    if (raw === undefined) return def
    if (/^(1|true|yes|oui|on)$/i.test(raw)) return true
    if (/^(0|false|no|non|off)$/i.test(raw)) return false
    throw new ConfigError(`${name} invalide : « ${raw} » (true ou false attendu)`)
  }
  const oneOf = (name, def, values) => {
    const v = str(name, def).toLowerCase()
    if (!values.includes(v)) throw new ConfigError(`${name} invalide : « ${v} » (${values.join(', ')})`)
    return v
  }
  const dir = (name, def) => path.resolve(ROOT, str(name, def))

  const mode = oneOf('BOT_MODE', 'gateway', MODES)
  const targetHost = str('TARGET_HOST', '')
  if ((requireTarget ?? mode === 'gateway') && !targetHost) {
    throw new ConfigError('TARGET_HOST manquant (IP ou domaine du serveur Bedrock cible)')
  }
  const joinabilityLabel = oneOf('JOINABILITY', 'friends_of_friends', Object.keys(JOINABILITY))

  return {
    mode,
    targetHost,
    targetPort: int('TARGET_PORT', 19132, { max: 65535 }),
    joinability: JOINABILITY[joinabilityLabel],
    joinabilityLabel,

    world: {
      hostName:       str('WORLD_NAME', 'Mon Serveur Minecraft'),
      name:           str('GATEWAY_MOTD', 'Rejoins le serveur !'),
      version:        str('WORLD_VERSION', 'Passerelle'), // affichage seulement
      memberCount:    1,
      maxMemberCount: int('MAX_PLAYERS', 20),
    },

    autoFriendAdd:      bool('AUTO_FRIEND_ADD', true),
    friendPollInterval: int('FRIEND_POLL_INTERVAL_MS', 30_000, { min: 5_000 }),
    refreshDelayMs:     int('SESSION_REFRESH_DELAY_MS', 3_000, { min: 1_000, max: 60_000 }),

    log: {
      level:         oneOf('LOG_LEVEL', env.DEBUG ? 'debug' : 'info', LOG_LEVELS),
      format:        oneOf('LOG_FORMAT', 'auto', LOG_FORMATS),
      dir:           bool('LOG_TO_FILE', true) ? dir('LOG_DIR', './logs') : null,
      retentionDays: int('LOG_RETENTION_DAYS', 14, { min: 0 }),
      statsEveryMin: int('STATS_INTERVAL_MIN', 60, { min: 0 }),
    },

    dataDir: dir('DATA_DIR', './data'),

    auth: {
      username: str('HOST_ACCOUNT_LABEL', 'gateway-host'),
      cache:    dir('AUTH_CACHE_DIR', './auth_cache'),
      // Options par défaut recommandées par bedrock-portal
      options: {
        authTitle:  Titles.MinecraftIOS,
        deviceType: 'iOS',
        flow:       'sisu',
      },
    },
  }
}

export function loadConfig(opts) {
  loadEnvFile()
  return parseConfig(process.env, opts)
}
