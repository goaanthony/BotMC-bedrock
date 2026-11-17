#!/usr/bin/env node
/**
 * Point d'entrée unique.
 *
 *   node src/cli.js [commande]
 *
 *   start     lance le mode défini par BOT_MODE (gateway par défaut)
 *   gateway   passerelle : session Xbox + transfert vers TARGET_HOST
 *   friends   acceptation des amis seulement (BDS)
 *   login     connecte (ou reconnecte avec --force) le compte Xbox du bot
 *   status    affiche l'état du bot en cours d'exécution
 *   check     vérifie la configuration (.env)
 */

import fs from 'node:fs'
import path from 'node:path'
import { loadConfig, ConfigError } from './core/config.js'
import { Logger, ANSI as A, describe } from './core/logger.js'
import { renderStatus } from './core/ui.js'

const USAGE = `
${A.bold}BotMC${A.reset} — passerelle Minecraft Bedrock via Xbox Live

${A.bold}Usage :${A.reset} node src/cli.js <commande> [options]

  ${A.cyan}start${A.reset}            lance le mode défini par BOT_MODE (défaut : gateway)
  ${A.cyan}gateway${A.reset}          passerelle : onglet Amis → transfert vers TARGET_HOST
  ${A.cyan}friends${A.reset}          acceptation des demandes d'amis seulement (BDS)
  ${A.cyan}login${A.reset} [--force]  connecte le compte Xbox du bot (--force : reconnecte)
  ${A.cyan}status${A.reset}           état du bot en cours d'exécution
  ${A.cyan}check${A.reset}            vérifie la configuration
  ${A.cyan}help${A.reset}             affiche cette aide
`

// Sortie coupée (ex. « botmc status | head ») : on quitte sans bruit
process.stdout.on('error', (err) => { if (err.code === 'EPIPE') process.exit(0); throw err })

const console$ = new Logger({ level: 'info' })

function fail(message, hint) {
  console$.error('system', message)
  if (hint) console$.raw(`  ${A.dim}${hint}${A.reset}`)
  process.exit(1)
}

function config(opts) {
  try {
    return loadConfig(opts)
  } catch (err) {
    if (err instanceof ConfigError) fail(`Configuration invalide : ${describe(err)}`, 'Corrige le fichier .env (voir .env.example), ou lance « botmc config ».')
    throw err
  }
}

async function login(force) {
  const cfg = config({ requireTarget: false })
  const { createAuthflow, fetchProfile } = await import('./core/auth.js')
  if (force) {
    fs.rmSync(cfg.auth.cache, { recursive: true, force: true })
    console$.info('xbox', 'Ancienne connexion supprimée')
  }
  console$.info('xbox', `Connexion du compte « ${cfg.auth.username} »...`)
  const { gamertag, xuid } = await fetchProfile(createAuthflow(cfg, console$))
  console$.info('xbox', `${A.green}Connecté :${A.reset} ${A.bold}${gamertag}${A.reset} ${A.dim}(XUID ${xuid})${A.reset}`)
  console$.raw(`  ${A.dim}Jetons enregistrés dans ${cfg.auth.cache}${A.reset}`)
}

function status() {
  const cfg = config({ requireTarget: false })
  const file = path.join(cfg.dataDir, 'status.json')
  let s
  try {
    s = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    fail('Aucun état disponible : le bot n\'a encore jamais tourné.', `Fichier attendu : ${file}`)
  }
  let alive = s.state !== 'offline'
  if (alive) {
    try { process.kill(s.pid, 0) } catch (err) { alive = err.code === 'EPERM' }
  }
  renderStatus(console$, s, { alive })
}

function check() {
  const cfg = config({ requireTarget: undefined })
  const ok = (k, v) => console$.raw(`  ${A.green}✔${A.reset} ${k.padEnd(16)} ${v}`)
  console$.raw()
  ok('Mode', cfg.mode)
  ok('Serveur cible', cfg.targetHost ? `${cfg.targetHost}:${cfg.targetPort}` : '(non utilisé)')
  ok('Monde', `${cfg.world.hostName} · ${cfg.world.name}`)
  ok('Compte bot', cfg.auth.username)
  ok('Cache auth', cfg.auth.cache)
  ok('Logs', cfg.log.dir ? `${cfg.log.dir} (${cfg.log.level}, ${cfg.log.retentionDays} j)` : `console (${cfg.log.level})`)
  console$.raw(`\n  ${A.green}Configuration valide.${A.reset}\n`)
}

async function main(argv) {
  const [cmd = 'start', ...args] = argv
  switch (cmd) {
    case 'start': {
      const cfg = config()
      const run = cfg.mode === 'friends'
        ? (await import('./friends/run.js')).runFriends
        : (await import('./gateway/run.js')).runGateway
      return run(cfg)
    }
    case 'gateway': {
      process.env.BOT_MODE = 'gateway'
      return (await import('./gateway/run.js')).runGateway(config())
    }
    case 'friends': {
      process.env.BOT_MODE = 'friends'
      return (await import('./friends/run.js')).runFriends(config())
    }
    case 'login':   return login(args.includes('--force'))
    case 'status':  return status()
    case 'check':   return check()
    case 'help': case '--help': case '-h':
      return console$.raw(USAGE)
    default:
      console$.raw(USAGE)
      fail(`Commande inconnue : ${cmd}`)
  }
}

main(process.argv.slice(2)).catch((err) => fail(describe(err)))
