// Owner names from an optional people file: any markdown table with an Email column and a name
// column ("Name", "Full name" or "Canonical"), plus optional "Aliases"/"Known variants".

const NAME_COLUMNS = ['name', 'full name', 'canonical']
const ALIAS_COLUMNS = ['aliases', 'known variants', 'variants']

/** @typedef {{ name: string, email: string }} Person */

/**
 * Keys are lower-cased emails, their local parts, names and aliases, so an owner written any of
 * those ways resolves to one person.
 * @param {string} text
 * @returns {Map<string, Person>}
 */
export function parsePeople(text) {
  /** @type {Map<string, Person>} */
  const people = new Map()
  /** @type {string[] | null} */
  let header = null
  for (const line of text.split(/\r?\n/)) {
    const cells = tableCells(line)
    if (!cells) {
      header = null
      continue
    }
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      continue
    }
    if (!header) {
      header = cells.map((cell) => cell.toLowerCase())
      continue
    }
    /** @param {string[]} names */
    const column = (names) => {
      const index = header?.findIndex((cell) => names.includes(cell)) ?? -1
      return index === -1 ? '' : stripMarkdown(cells[index] ?? '')
    }
    const email = column(['email', 'e-mail'])
    if (!email.includes('@')) {
      continue
    }
    const person = { name: column(NAME_COLUMNS) || email, email: email.toLowerCase() }
    const spellings = [
      email,
      email.slice(0, email.indexOf('@')),
      ...NAME_COLUMNS.map((name) => column([name])),
      ...column(ALIAS_COLUMNS).split(',')
    ]
    for (const spelling of spellings) {
      const key = spelling.trim().toLowerCase()
      if (key && key !== '—' && key !== '-' && !people.has(key)) {
        people.set(key, person)
      }
    }
  }
  return people
}

/** @param {string} line */
function tableCells(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|') || trimmed.length < 2) {
    return null
  }
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim())
}

/** @param {string} cell */
function stripMarkdown(cell) {
  return cell.replace(/`/g, '').replace(/\*\*/g, '').trim()
}

/** "Name (email)" when the people file knows the owner, else the owner as written. */
export function describeOwner(owner, person) {
  if (!owner) {
    return 'the note owner'
  }
  return person && person.name.toLowerCase() !== owner.toLowerCase()
    ? `${person.name} (${person.email})`
    : owner
}
