// Matching a host's file names to the AST's.
//
// twf spells a site's `file` the way its input named the file (D9):
// `designs/agent/v1/agent.twf`, or an absolute path. A host names files its own
// way — the focused editor file, its own loader errors — and older twf versions
// sent base names. A host file therefore matches a source file exactly, else by
// a suffix on `/` boundaries in either direction, after mapping `\` to `/` and
// dropping leading `./` and `../`.

import type { Diagnostic, FileError } from '../types/ast'

function normalize(file: string): string {
  let s = file.replace(/\\/g, '/')
  for (;;) {
    if (s.startsWith('./')) s = s.slice(2)
    else if (s.startsWith('../')) s = s.slice(3)
    else return s
  }
}

// sharedTail counts the trailing path elements a and b share.
function sharedTail(a: string, b: string): number {
  const x = a.split('/')
  const y = b.split('/')
  let n = 0
  while (n < x.length && n < y.length && x[x.length - 1 - n] === y[y.length - 1 - n]) n++
  return n
}

function suffixMatch(a: string, b: string): boolean {
  return a === b || a.endsWith('/' + b) || b.endsWith('/' + a)
}

/**
 * Every source file a host's file name refers to: the exact one, else the
 * suffix matches sharing the most trailing path elements with it — so a host's
 * `/ws/sub/a.twf` picks `sub/a.twf` over `a.twf`, and a base name picks every
 * file of that name.
 */
export function hostFileMatches(hostFile: string, sourceFiles: Iterable<string>): string[] {
  const files = [...sourceFiles]
  if (files.includes(hostFile)) return [hostFile]
  const host = normalize(hostFile)
  if (host === '') return []
  const matches = files.filter(f => suffixMatch(normalize(f), host))
  const best = Math.max(0, ...matches.map(f => sharedTail(normalize(f), host)))
  return matches.filter(f => sharedTail(normalize(f), host) === best)
}

/** The source files a host's focused file selects (empty when none is focused). */
export function focusedFiles(focusedFile: string | undefined, sourceFiles: Iterable<string>): Set<string> {
  return new Set(focusedFile ? hostFileMatches(focusedFile, sourceFiles) : [])
}

export interface Partitioned {
  shownFileErrors: FileError[]
  hiddenFileErrors: FileError[]
  shownDiagnostics: Diagnostic[]
  hiddenDiagnostics: Diagnostic[]
}

/**
 * Split findings into "shown files" vs "hidden files" by the file filter. A
 * finding is shown when a source file its file refers to is selected; a file
 * that refers to no source file is shown, as are file-less diagnostics, so a
 * missing or foreign path can't accidentally hide them.
 */
export function partitionByFile(errors: FileError[], diagnostics: Diagnostic[], selectedFiles: ReadonlySet<string>, sourceFiles: Iterable<string>): Partitioned {
  if (selectedFiles.size === 0) {
    return { shownFileErrors: errors, hiddenFileErrors: [], shownDiagnostics: diagnostics, hiddenDiagnostics: [] }
  }
  const sources = [...sourceFiles]
  const shown = (file: string) => {
    const matches = hostFileMatches(file, sources)
    return matches.length === 0 || matches.some(f => selectedFiles.has(f))
  }
  const shownFileErrors: FileError[] = []
  const hiddenFileErrors: FileError[] = []
  for (const e of errors) {
    if (shown(e.file)) shownFileErrors.push(e)
    else hiddenFileErrors.push(e)
  }
  const shownDiagnostics: Diagnostic[] = []
  const hiddenDiagnostics: Diagnostic[] = []
  for (const d of diagnostics) {
    if (!d.site.file || shown(d.site.file)) shownDiagnostics.push(d)
    else hiddenDiagnostics.push(d)
  }
  return { shownFileErrors, hiddenFileErrors, shownDiagnostics, hiddenDiagnostics }
}
