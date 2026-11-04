// Host file names against D9 source files.

import { describe, expect, it } from 'vitest'
import { focusedFiles, hostFileMatches, partitionByFile } from './files'
import type { Diagnostic } from '../types/ast'

const SOURCES = ['designs/agent/v1/agent.twf', 'designs/deploy.twf', 'lib/kube/v1/kube.twf', 'other/agent.twf']

const diag = (file?: string): Diagnostic => ({
  severity: 'error', kind: 'resolve', code: 'X', message: file ?? '', file,
  start: { line: 1, column: 1 }, end: { line: 1, column: 1 },
})

describe('hostFileMatches', () => {
  it('exact match wins', () => {
    expect(hostFileMatches('designs/deploy.twf', SOURCES)).toEqual(['designs/deploy.twf'])
  })
  it('base name selects every suffix match', () => {
    expect(hostFileMatches('agent.twf', SOURCES)).toEqual(['designs/agent/v1/agent.twf', 'other/agent.twf'])
  })
  it('an absolute host path matches a relative source file', () => {
    expect(hostFileMatches('/home/u/repo/designs/deploy.twf', SOURCES)).toEqual(['designs/deploy.twf'])
  })
  it('a relative host path matches an absolute source file', () => {
    expect(hostFileMatches('deploy.twf', ['/home/u/repo/designs/deploy.twf'])).toEqual(['/home/u/repo/designs/deploy.twf'])
  })
  it('backslashes and leading ./ and ../ are normalized', () => {
    expect(hostFileMatches('..\\kube\\v1\\kube.twf', SOURCES)).toEqual(['lib/kube/v1/kube.twf'])
    expect(hostFileMatches('./designs/deploy.twf', SOURCES)).toEqual(['designs/deploy.twf'])
  })
  it('matches only on / boundaries', () => {
    expect(hostFileMatches('ploy.twf', SOURCES)).toEqual([])
  })
  it('a longer host path picks the closest source, not every shorter one', () => {
    expect(hostFileMatches('/ws/sub/a.twf', ['a.twf', 'sub/a.twf'])).toEqual(['sub/a.twf'])
    expect(hostFileMatches('/ws/x/a.twf', ['a.twf', 'sub/a.twf'])).toEqual(['a.twf'])
  })
})

describe('focusedFiles', () => {
  it('no focused file selects nothing', () => {
    expect([...focusedFiles(undefined, SOURCES)]).toEqual([])
    expect([...focusedFiles('kube.twf', SOURCES)]).toEqual(['lib/kube/v1/kube.twf'])
  })
})

describe('partitionByFile', () => {
  it('a source file never matches another source by suffix', () => {
    const p = partitionByFile([], [diag('sub/a.twf')], new Set(['a.twf']), ['a.twf', 'sub/a.twf'])
    expect(p.hiddenDiagnostics).toHaveLength(1)
  })
  it('findings partition by suffix match against the selection', () => {
    const p = partitionByFile(
      [{ file: 'kube.twf', error: 'm' }],
      [diag('deploy.twf'), diag('kube.twf'), diag()],
      new Set(['designs/deploy.twf']),
      SOURCES,
    )
    expect(p.shownDiagnostics.map(d => d.file ?? '')).toEqual(['deploy.twf', ''])
    expect(p.hiddenDiagnostics.map(d => d.file)).toEqual(['kube.twf'])
    expect(p.hiddenFileErrors).toHaveLength(1)
  })
  it('a file that names no source file is never hidden', () => {
    expect(partitionByFile([{ file: 'gone.twf', error: 'm' }], [], new Set(['designs/deploy.twf']), SOURCES).shownFileErrors).toHaveLength(1)
  })
})
