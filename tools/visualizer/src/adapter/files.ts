// Matching a host's file names to the AST's.
//
// twf spells a definition's `sourceFile` and a diagnostic's `file` the way its
// input named the file (D9): `designs/agent/v1/agent.twf`, or an absolute path.
// A host names files its own way — the focused editor file, its own loader
// errors — and older twf versions sent base names. A host file therefore
// matches a source file exactly, else by a suffix on `/` boundaries in either
// direction, after mapping `\` to `/` and dropping leading `./` and `../`.

import type { Diagnostic, FileError } from '../types/ast'

function normalize(file: string): string {
  let s = file.replace(/\\/g, '/')
  for (;;) {
    if (s.startsWith('./')) s = s.slice(2)
    else if (s.startsWith('../')) s = s.slice(3)
    else return s
  }
}

function suffixMatch(a: string, b: string): boolean {
  return a === b || a.endsWith('/' + b) || b.endsWith('/' + a)
}

/** Every source file a host's file name refers to: the exact one, else every suffix match. */
export function hostFileMatches(hostFile: string, sourceFiles: Iterable<string>): string[] {
  const files = [...sourceFiles]
  if (files.includes(hostFile)) return [hostFile]
  const host = normalize(hostFile)
  if (host === '') return []
  return files.filter(f => suffixMatch(normalize(f), host))
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
 * finding is shown when its file refers to a selected source file. File-less
 * diagnostics surface in the shown group so a missing path can't accidentally
 * hide them.
 */
export function partitionByFile(errors: FileError[], diagnostics: Diagnostic[], selectedFiles: ReadonlySet<string>): Partitioned {
  if (selectedFiles.size === 0) {
    return { shownFileErrors: errors, hiddenFileErrors: [], shownDiagnostics: diagnostics, hiddenDiagnostics: [] }
  }
  const shown = (file: string) => hostFileMatches(file, selectedFiles).length > 0
  const shownFileErrors: FileError[] = []
  const hiddenFileErrors: FileError[] = []
  for (const e of errors) {
    if (shown(e.file)) shownFileErrors.push(e)
    else hiddenFileErrors.push(e)
  }
  const shownDiagnostics: Diagnostic[] = []
  const hiddenDiagnostics: Diagnostic[] = []
  for (const d of diagnostics) {
    if (!d.file || shown(d.file)) shownDiagnostics.push(d)
    else hiddenDiagnostics.push(d)
  }
  return { shownFileErrors, hiddenFileErrors, shownDiagnostics, hiddenDiagnostics }
}
