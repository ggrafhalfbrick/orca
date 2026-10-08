// A note's status: the first status field it sets, named by the user's word list.

/** @typedef {'open' | 'active' | 'blocked' | 'review' | 'done' | 'closed'} StatusTone */

/** @type {StatusTone[]} */
export const TONE_ORDER = ['open', 'active', 'blocked', 'review', 'done', 'closed']

export const DEFAULT_STATUS_TONES = [
  'open: open, todo, to do, ready, draft, new',
  'active: active, in progress, doing, started',
  'blocked: blocked, waiting',
  'review: review, in review, waiting review, submitted',
  'done: done, complete, completed, shipped, executed, closed',
  'closed: cancelled, canceled, superseded, parked, dropped'
].join('\n')

/** "In-Progress", "in_progress" and "in progress" all become "in progress". */
export function normalizeStatusKey(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
}

/**
 * Lines of `tone: word, word` into word → tone; unknown tones and blank lines are skipped.
 * @param {string} text
 * @returns {Map<string, StatusTone>}
 */
export function parseStatusTones(text) {
  /** @type {Map<string, StatusTone>} */
  const tones = new Map()
  for (const line of text.split(/\r?\n/)) {
    const colon = line.indexOf(':')
    const tone = /** @type {StatusTone} */ (line.slice(0, colon).trim().toLowerCase())
    if (colon < 1 || !TONE_ORDER.includes(tone)) {
      continue
    }
    for (const word of line.slice(colon + 1).split(',')) {
      const key = normalizeStatusKey(word)
      if (key && !tones.has(key)) {
        tones.set(key, tone)
      }
    }
  }
  return tones
}

/**
 * The whole value when it is a known word or short; otherwise its leading known phrase (up to three
 * words), else its first word. Long text stays available as the note's status text.
 * @param {string} text the first status field the note sets
 * @param {Map<string, StatusTone>} tones
 * @returns {{ key: string, label: string, tone: StatusTone }}
 */
export function resolveStatus(text, tones) {
  const whole = normalizeStatusKey(text.replace(/^[\s*_"'`>#[(]+/, ''))
  const words = whole.split(/[^a-z0-9]+/).filter(Boolean)
  if (words.length === 0) {
    return { key: 'none', label: 'No status', tone: 'open' }
  }
  if (tones.has(whole)) {
    return status(whole, tones)
  }
  for (const length of [3, 2, 1]) {
    const phrase = words.slice(0, length).join(' ')
    if (words.length >= length && tones.has(phrase)) {
      return status(phrase, tones)
    }
  }
  return status(words.length <= 2 && whole.length <= 24 ? words.join(' ') : words[0], tones)
}

/** @param {string} key @param {Map<string, StatusTone>} tones */
function status(key, tones) {
  return { key, label: key[0].toUpperCase() + key.slice(1), tone: tones.get(key) ?? 'open' }
}

/** @param {StatusTone} tone */
export function isOpenWorkTone(tone) {
  return tone !== 'done' && tone !== 'closed'
}
