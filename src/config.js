/**
 * config.js
 * Configuration unique, lue depuis .env et validée au démarrage.
 */

import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import prismarineAuth from 'prismarine-auth'
import { Joinability } from 'bedrock-portal'

const { Titles } = prismarineAuth

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function int(name, def, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return def
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} invalide : "${raw}" (entier entre ${min} et ${max} attendu)`)
  }
  return n
}

function bool(name, def) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return def
  return ['1', 'true', 'yes', 'oui', 'on'].includes(raw.toLowerCase())
}

const JOINABILITY = {
  friends_of_friends: Joinability.FriendsOfFriends,
  friends_only:       Joinability.FriendsOnly,
  invite_only:        Joinability.InviteOnly,
}

export function loadConfig({ requireTarget = true } = {}) {
  const targetHost = (process.env.TARGET_HOST || '').trim()
  if (requireTarget && !targetHost) {
    throw new Error('TARGET_HOST manquant dans .env (IP ou domaine du serveur Bedrock cible)')
  }

  const joinKey = (process.env.JOINABILITY || 'friends_of_friends').toLowerCase()
  if (!JOINABILITY[joinKey]) {
    throw new Error(`JOINABILITY invalide : "${joinKey}" (${Object.keys(JOINABILITY).join(', ')})`)
  }

  return {
    targetHost,
    targetPort:  int('TARGET_PORT', 19132, { max: 65535 }),
    joinability: JOINABILITY[joinKey],
    joinabilityLabel: joinKey,

    world: {
      hostName:       process.env.WORLD_NAME    || 'Mon Serveur Minecraft',
      name:           process.env.GATEWAY_MOTD  || 'Rejoins le serveur !',
      // Purement affiché sur la carte de session, n'a pas besoin d'être une vraie version
      version:        process.env.WORLD_VERSION || 'Passerelle',
      memberCount:    1,
      maxMemberCount: int('MAX_PLAYERS', 20),
    },

    autoFriendAdd:      bool('AUTO_FRIEND_ADD', true),
    friendPollInterval: int('FRIEND_POLL_INTERVAL_MS', 30000, { min: 5000 }),

    auth: {
      username: process.env.HOST_ACCOUNT_LABEL || 'gateway-host',
      cache:    path.resolve(ROOT, process.env.AUTH_CACHE_DIR || './auth_cache'),
      // Options par défaut recommandées par bedrock-portal
      options: {
        authTitle:  Titles.MinecraftIOS,
        deviceType: 'iOS',
        flow:       'sisu',
      },
    },
  }
}
