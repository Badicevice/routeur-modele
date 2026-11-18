import type { Register } from 'claude-code'

type Tier = 'simple' | 'moyen' | 'complexe'
type Mode = 'auto' | 'off' | Tier

const TIERS: Record<Tier, { model: string; label: string }> = {
  simple: { model: 'haiku', label: 'Haiku' },
  moyen: { model: 'sonnet', label: 'Sonnet' },
  complexe: { model: 'opus', label: 'Opus' },
}

const ALIASES: { [name: string]: Mode | undefined } = {
  auto: 'auto',
  off: 'off',
  haiku: 'simple',
  simple: 'simple',
  sonnet: 'moyen',
  moyen: 'moyen',
  opus: 'complexe',
  complexe: 'complexe',
}

const MODE_KEY = 'mode'
const CLASSIFIER_MODEL = 'haiku'

const RUBRIC = `Tu classes la demande d'un utilisateur à un assistant de code (Claude Code) pour choisir le modèle le moins cher capable de bien y répondre.

Réponds par UN SEUL mot parmi : SIMPLE, MOYEN, COMPLEXE, SUITE.

SIMPLE : salutation, question factuelle courte, définition, traduction ou reformulation d'un petit texte, commande shell évidente, lire ou lister un fichier, petite correction d'une ligne, renommage.
MOYEN : écrire ou modifier du code dans un ou quelques fichiers, expliquer un bout de code, corriger un bug localisé, rédiger un document ou un e-mail, recherche web ordinaire, script de taille moyenne.
COMPLEXE : architecture ou conception, refactor sur plusieurs fichiers, bug difficile ou difficile à reproduire, raisonnement mathématique ou logique poussé, analyse approfondie, sécurité, performances, plan d'un projet entier, tâche longue en plusieurs étapes, ou si une erreur coûterait cher.
SUITE : simple réaction ou confirmation qui poursuit la tâche en cours sans en ajouter une nouvelle (« ok », « vas-y », « oui fais-le », « continue », « merci »).

En cas de doute entre deux niveaux, choisis le plus élevé.`

const toMode = (stored: unknown): Mode =>
  (typeof stored === 'string' ? ALIASES[stored] : undefined) ?? 'auto'

const parse = (text: string): Tier | 'suite' | undefined => {
  const word = text.trim().toUpperCase()
  if (word.startsWith('SUITE')) return 'suite'
  if (word.startsWith('COMPLEXE')) return 'complexe'
  if (word.startsWith('MOYEN')) return 'moyen'
  if (word.startsWith('SIMPLE')) return 'simple'
  return undefined
}

export const register: Register = on => {
  // Palier du tour en cours (et du précédent, pour les « SUITE »).
  let current: Tier | undefined
  const counts: Record<Tier, number> = { simple: 0, moyen: 0, complexe: 0 }

  const statusText = (mode: Mode, why?: string): string | undefined => {
    if (mode === 'off') return undefined
    if (current === undefined) return `Routeur : ${mode === 'auto' ? 'auto' : TIERS[mode].label}`
    const label = TIERS[current].label
    return mode === 'auto' ? `Routeur : ${label} (${why ?? current})` : `Routeur : ${label} (forcé)`
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'routeur',
      description: 'Routeur de modèle : /routeur [auto|haiku|sonnet|opus|off|stats]',
    })
    $.ui.status(statusText(toMode(await $.store.get(MODE_KEY))))
    return next(e)
  })

  on('command.run', { command: 'routeur' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const mode = toMode(await $.store.get(MODE_KEY))

    if (arg === '' || arg === 'stats' || arg === 'status') {
      const total = counts.simple + counts.moyen + counts.complexe
      return {
        text: [
          `Mode : ${mode === 'auto' ? 'auto (Haiku classe chaque demande)' : mode === 'off' ? 'désactivé (modèle de la session)' : `forcé sur ${TIERS[mode].label}`}`,
          `Cette session : ${total} demande(s) — Haiku ${counts.simple}, Sonnet ${counts.moyen}, Opus ${counts.complexe}`,
          'Changer : /routeur auto | haiku | sonnet | opus | off',
        ].join('\n'),
      }
    }

    const wanted = ALIASES[arg]
    if (wanted === undefined) {
      return { text: `Option inconnue « ${arg} ». Choix : auto, haiku, sonnet, opus, off, stats.` }
    }

    await $.store.set(MODE_KEY, wanted)
    if (wanted !== 'auto' && wanted !== 'off') current = wanted
    $.ui.status(statusText(wanted))
    return {
      text:
        wanted === 'auto'
          ? 'Routeur en mode auto : chaque demande est classée et envoyée au modèle adapté.'
          : wanted === 'off'
            ? 'Routeur désactivé : le modèle de la session est utilisé.'
            : `Routeur forcé sur ${TIERS[wanted].label} jusqu'à /routeur auto.`,
    }
  })

  // Une fois par demande de l'utilisateur, sur la boucle principale : on choisit le palier.
  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    const mode = toMode(await $.store.get(MODE_KEY))
    if (mode === 'off') return next(e)
    if (mode !== 'auto') {
      current = mode
      counts[mode] += 1
      $.ui.status(statusText(mode))
      return next(e)
    }

    const text = e.text.trim()
    if (text === '') return next(e) // continuation : on garde le palier en cours

    const prompt = text.length > 6000 ? `${text.slice(0, 3000)}\n[…]\n${text.slice(-3000)}` : text
    const r = await $.model
      .complete({
        model: CLASSIFIER_MODEL,
        system: RUBRIC,
        prompt: `Demande de l'utilisateur :\n<<<\n${prompt}\n>>>\n\nPalier du tour précédent : ${current ?? 'aucun'}.\nTon mot :`,
        maxTokens: 8,
        effort: 'low',
        timeoutMs: 8000,
      })
      .catch(() => undefined)

    const verdict = r?.isAnswered ? parse(r.text) : undefined
    if (verdict === undefined) {
      // Classement impossible : on garde le palier précédent, sinon Sonnet.
      current = current ?? 'moyen'
      counts[current] += 1
      $.ui.status(statusText(mode, 'classement indisponible'))
      return next(e)
    }

    if (verdict === 'suite') {
      current = current ?? 'moyen'
      counts[current] += 1
      $.ui.status(statusText(mode, 'suite'))
      return next(e)
    }

    current = verdict
    counts[verdict] += 1
    $.ui.status(statusText(mode))
    return next(e)
  })

  // Chaque requête au modèle de la boucle principale part vers le modèle choisi.
  // Les sous-agents gardent le leur.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined || current === undefined) return yield* next(e)
    return yield* next({ ...e, model: TIERS[current].model })
  })
}
