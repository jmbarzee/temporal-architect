// Checks for adapter/files: host file names against D9 source files.

import { focusedFiles, hostFileMatches, partitionByFile } from '../adapter/files'
import type { Diagnostic } from '../types/ast'
import { check, equal } from './check'

const SOURCES = ['designs/agent/v1/agent.twf', 'designs/deploy.twf', 'lib/kube/v1/kube.twf', 'other/agent.twf']

export function filesChecks(): void {
  check('exact match wins', () => {
    equal(hostFileMatches('designs/deploy.twf', SOURCES), ['designs/deploy.twf'])
  })
  check('base name selects every suffix match', () => {
    equal(hostFileMatches('agent.twf', SOURCES), ['designs/agent/v1/agent.twf', 'other/agent.twf'])
  })
  check('an absolute host path matches a relative source file', () => {
    equal(hostFileMatches('/home/u/repo/designs/deploy.twf', SOURCES), ['designs/deploy.twf'])
  })
  check('a relative host path matches an absolute source file', () => {
    equal(hostFileMatches('deploy.twf', ['/home/u/repo/designs/deploy.twf']), ['/home/u/repo/designs/deploy.twf'])
  })
  check('backslashes and leading ./ and ../ are normalized', () => {
    equal(hostFileMatches('..\\kube\\v1\\kube.twf', SOURCES), ['lib/kube/v1/kube.twf'])
    equal(hostFileMatches('./designs/deploy.twf', SOURCES), ['designs/deploy.twf'])
  })
  check('matches only on / boundaries', () => {
    equal(hostFileMatches('ploy.twf', SOURCES), [])
  })
  check('no focused file selects nothing', () => {
    equal([...focusedFiles(undefined, SOURCES)], [])
    equal([...focusedFiles('kube.twf', SOURCES)], ['lib/kube/v1/kube.twf'])
  })
  check('a longer host path picks the closest source, not every shorter one', () => {
    equal(hostFileMatches('/ws/sub/a.twf', ['a.twf', 'sub/a.twf']), ['sub/a.twf'])
    equal(hostFileMatches('/ws/x/a.twf', ['a.twf', 'sub/a.twf']), ['a.twf'])
  })
  check('a source file never matches another source by suffix', () => {
    const diag: Diagnostic = {
      severity: 'error', kind: 'resolve', code: 'X', message: '', file: 'sub/a.twf',
      start: { line: 1, column: 1 }, end: { line: 1, column: 1 },
    }
    const p = partitionByFile([], [diag], new Set(['a.twf']), ['a.twf', 'sub/a.twf'])
    equal(p.hiddenDiagnostics.length, 1)
  })
  check('findings partition by suffix match against the selection', () => {
    const diag = (file?: string): Diagnostic => ({
      severity: 'error', kind: 'resolve', code: 'X', message: file ?? '', file,
      start: { line: 1, column: 1 }, end: { line: 1, column: 1 },
    })
    const p = partitionByFile(
      [{ file: 'kube.twf', error: 'm' }],
      [diag('deploy.twf'), diag('kube.twf'), diag()],
      new Set(['designs/deploy.twf']),
      SOURCES,
    )
    equal(p.shownDiagnostics.map(d => d.file ?? ''), ['deploy.twf', ''])
    equal(p.hiddenDiagnostics.map(d => d.file), ['kube.twf'])
    equal(p.hiddenFileErrors.length, 1)
    // A file that names no source file is never hidden.
    equal(partitionByFile([{ file: 'gone.twf', error: 'm' }], [], new Set(['designs/deploy.twf']), SOURCES).shownFileErrors.length, 1)
  })
}
