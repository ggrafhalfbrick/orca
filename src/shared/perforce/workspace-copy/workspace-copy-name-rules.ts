// Pure (no Node imports): the renderer validates and suggests copy names with these too.

export const COPY_NAME_PATTERN = /^[A-Za-z0-9-]{1,24}$/

/** First free `<base>-<n>`, for one-click creation. */
export function suggestCopyName(taken: Iterable<string>, base = 'copy'): string {
  const used = new Set([...taken].map((name) => name.toLowerCase()))
  for (let n = 1; ; n += 1) {
    const candidate = `${base}-${n}`
    if (!used.has(candidate.toLowerCase())) {
      return candidate
    }
  }
}
