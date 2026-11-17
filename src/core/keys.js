/**
 * Raccourcis clavier dans un terminal interactif (sans effet sous systemd,
 * où l'entrée standard n'est pas un terminal).
 */

import readline from 'node:readline'

/**
 * @param {Record<string, () => void>} handlers  touche (minuscule) → action
 * @param {() => void} onInterrupt               Ctrl+C (le mode brut intercepte SIGINT)
 * @returns {() => void} fonction de détachement
 */
export function attachKeys(handlers, onInterrupt, stdin = process.stdin) {
  if (!stdin.isTTY) return () => {}
  readline.emitKeypressEvents(stdin)
  stdin.setRawMode(true)
  stdin.resume()

  const onKey = (str, key = {}) => {
    if (key.ctrl && (key.name === 'c' || key.name === 'd')) return onInterrupt()
    const name = (key.name ?? str ?? '').toLowerCase()
    const fn = handlers[name]
    if (!fn) return
    try { fn() } catch (err) { process.stderr.write(`${err.stack ?? err}\n`) }
  }
  const restore = () => { try { stdin.setRawMode(false) } catch { /* terminal fermé */ } }

  stdin.on('keypress', onKey)
  process.once('exit', restore)
  return () => {
    stdin.off('keypress', onKey)
    restore()
    stdin.pause()
  }
}
