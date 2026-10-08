// Dependency-free reader for the YAML subset note frontmatter typically uses:
// scalars (plain, quoted across lines, block | >), inline [a, b] lists and
// block "- item" lists. Nested maps are skipped. Values stay strings.

const KEY_LINE = /^([A-Za-z_][\w-]*):(?:[ \t]+(.*))?$/
const LIST_ITEM = /^([ \t]*)-(?:[ \t]+(.*))?$/
const BLOCK_SCALAR = /^[|>][+-]?\d*[ \t]*(?:#.*)?$/
const CLOSING_FENCE = /\n---[ \t]*(?:\n|$)/g

/**
 * @param {string} text
 * @returns {{ data: Record<string, string | string[] | null>, body: string, hasFrontmatter: boolean }}
 */
export function parseFrontmatter(text) {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  if (!/^---[ \t]*\n/.test(normalized)) {
    return { data: {}, body: normalized, hasFrontmatter: false }
  }
  const openEnd = normalized.indexOf('\n') + 1
  CLOSING_FENCE.lastIndex = openEnd - 1
  const close = CLOSING_FENCE.exec(normalized)
  if (!close) {
    return { data: {}, body: normalized, hasFrontmatter: false }
  }
  const yaml = normalized.slice(openEnd, Math.max(openEnd, close.index))
  return {
    data: parseYamlMapping(yaml),
    body: normalized.slice(close.index + close[0].length),
    hasFrontmatter: true
  }
}

/** @param {string} yaml */
export function parseYamlMapping(yaml) {
  const lines = yaml.split('\n')
  /** @type {Map<string, string | string[] | null>} */
  const entries = new Map()
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const match = isTopLevelLine(line) ? KEY_LINE.exec(line) : null
    if (!match) {
      index++
      continue
    }
    const { value, next } = readValue(lines, index, (match[2] ?? '').trim())
    entries.set(match[1], value)
    index = next
  }
  // Why: fromEntries defines own properties, so a "__proto__" key stays data.
  return Object.fromEntries(entries)
}

/** @param {string} line */
function isTopLevelLine(line) {
  return line.length > 0 && !/^[ \t#]/.test(line)
}

/**
 * @param {string[]} lines
 * @param {number} index line holding the key
 * @param {string} rest text after "key:"
 * @returns {{ value: string | string[] | null, next: number }}
 */
function readValue(lines, index, rest) {
  if (rest === '' || rest.startsWith('#')) {
    return readBlock(lines, index + 1)
  }
  if (BLOCK_SCALAR.test(rest)) {
    return readBlockScalar(lines, index + 1, rest[0] === '|')
  }
  if (rest.startsWith('"') || rest.startsWith("'")) {
    const quoted = readQuoted(lines, index, rest)
    return { value: quoted.value, next: quoted.next }
  }
  if (rest.startsWith('[')) {
    return readFlowSequence(lines, index, rest)
  }
  return readPlain(lines, index, rest)
}

/** Indented (or compact "- ") lines after an empty value: a list, or a nested map we skip. */
function readBlock(lines, start) {
  let next = start
  /** @type {string[] | null} */
  let items = null
  let sawContent = false
  while (next < lines.length) {
    const line = lines[next]
    if (line.trim() === '') {
      next++
      continue
    }
    const item = LIST_ITEM.exec(line)
    const indented = /^[ \t]/.test(line)
    if (!indented && !item) {
      break
    }
    if (item && (!sawContent || items)) {
      items ??= []
      const quoted = (item[2] ?? '').trim()
      if (quoted.startsWith('"') || quoted.startsWith("'")) {
        const read = readQuoted(lines, next, quoted)
        items.push(read.value)
        next = read.next
      } else {
        items.push(stripPlainComment(quoted))
        next++
      }
      sawContent = true
      continue
    }
    sawContent = true
    next++
  }
  if (items) {
    return { value: items.filter((entry) => entry !== ''), next }
  }
  return { value: sawContent ? null : '', next }
}

function readBlockScalar(lines, start, literal) {
  let next = start
  /** @type {string[]} */
  const collected = []
  let indent = -1
  while (next < lines.length) {
    const line = lines[next]
    if (line.trim() === '') {
      collected.push('')
      next++
      continue
    }
    const leading = /^[ \t]*/.exec(line)[0].length
    if (leading === 0) {
      break
    }
    if (indent < 0) {
      indent = leading
    }
    collected.push(line.slice(Math.min(indent, leading)))
    next++
  }
  while (collected.length > 0 && collected.at(-1) === '') {
    collected.pop()
  }
  return { value: literal ? collected.join('\n') : foldLines(collected), next }
}

function readPlain(lines, index, rest) {
  /** @type {string[]} */
  const parts = [stripPlainComment(rest)]
  let next = index + 1
  // Why: an indented continuation folds into the scalar, as YAML plain scalars do.
  while (next < lines.length) {
    const line = lines[next]
    if (!/^[ \t]+\S/.test(line) || LIST_ITEM.test(line)) {
      break
    }
    parts.push(stripPlainComment(line.trim()))
    next++
  }
  return { value: parts.join(' ').trim(), next }
}

function readFlowSequence(lines, index, rest) {
  let text = rest
  let next = index + 1
  while (!isFlowSequenceClosed(text) && next < lines.length && /^[ \t]/.test(lines[next])) {
    text += ` ${lines[next].trim()}`
    next++
  }
  return { value: parseFlowSequence(text), next }
}

/** @param {string} text */
function isFlowSequenceClosed(text) {
  let depth = 0
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quote) {
      if (char === '\\' && quote === '"') {
        i++
      } else if (char === quote) {
        quote = ''
      }
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '[') {
      depth++
    } else if (char === ']') {
      depth--
      if (depth === 0) {
        return true
      }
    }
  }
  return false
}

/**
 * "[a, 'b, c', "d"]" → ["a", "b, c", "d"]. A comma outside quotes always
 * splits, the way loose one-line lists are usually meant.
 * @param {string} text
 */
export function parseFlowSequence(text) {
  const open = text.indexOf('[')
  const inner = text.slice(open + 1)
  /** @type {string[]} */
  const items = []
  let current = ''
  let quote = ''
  let index = 0
  for (; index < inner.length; index++) {
    const char = inner[index]
    if (quote) {
      current += char
      if (char === '\\' && quote === '"' && index + 1 < inner.length) {
        current += inner[++index]
      } else if (char === quote) {
        if (quote === "'" && inner[index + 1] === "'") {
          current += inner[++index]
        } else {
          quote = ''
        }
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
    } else if (char === ',') {
      items.push(current)
      current = ''
    } else if (char === ']') {
      break
    } else {
      current += char
    }
  }
  items.push(current)
  return items.map((item) => unquoteInline(item.trim())).filter((item) => item !== '')
}

/** @param {string} item */
function unquoteInline(item) {
  if (item.length >= 2 && (item[0] === '"' || item[0] === "'") && item.endsWith(item[0])) {
    return readQuoted([item], 0, item).value
  }
  return item
}

/**
 * Reads a quoted scalar starting on lines[index] (text = the part from the
 * opening quote), following it across lines until the closing quote.
 * @param {string[]} lines
 * @param {number} index
 * @param {string} text
 */
function readQuoted(lines, index, text) {
  const quote = text[0]
  /** @type {string[]} */
  const parts = []
  let buffer = text.slice(1)
  let row = index
  for (;;) {
    const close = findClosingQuote(buffer, quote)
    if (close >= 0) {
      parts.push(buffer.slice(0, close))
      break
    }
    parts.push(buffer)
    row++
    if (row >= lines.length) {
      break
    }
    buffer = lines[row]
  }
  const folded = foldQuotedParts(parts)
  return {
    value: quote === '"' ? unescapeDoubleQuoted(folded) : folded.replace(/''/g, "'"),
    next: row + 1
  }
}

/** @param {string} text @param {string} quote */
function findClosingQuote(text, quote) {
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quote === '"' && char === '\\') {
      i++
      continue
    }
    if (char === quote) {
      if (quote === "'" && text[i + 1] === "'") {
        i++
        continue
      }
      return i
    }
  }
  return -1
}

/** YAML flow folding: a single line break is a space, each blank line a newline. */
function foldQuotedParts(parts) {
  const last = parts.length - 1
  const trimmed = parts.map((part, i) =>
    i === 0 ? part.trimEnd() : i === last ? part.trimStart() : part.trim()
  )
  return foldLines(trimmed)
}

/** @param {string[]} lines */
function foldLines(lines) {
  let result = lines[0] ?? ''
  let blank = 0
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '' && i < lines.length - 1) {
      blank++
      continue
    }
    result += (blank > 0 ? '\n'.repeat(blank) : ' ') + lines[i]
    blank = 0
  }
  return result
}

const DOUBLE_QUOTE_ESCAPES = {
  n: '\n',
  t: '\t',
  r: '\r',
  0: '\0',
  '"': '"',
  '\\': '\\',
  '/': '/',
  ' ': ' ',
  _: ' '
}

/** @param {string} value */
function unescapeDoubleQuoted(value) {
  return value.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_match, code) => {
    if (code.length > 1) {
      return String.fromCharCode(Number.parseInt(code.slice(1), 16))
    }
    return DOUBLE_QUOTE_ESCAPES[code] ?? code
  })
}

/** @param {string} text */
function stripPlainComment(text) {
  const hash = text.search(/[ \t]#/)
  return (hash >= 0 ? text.slice(0, hash) : text).trim()
}
