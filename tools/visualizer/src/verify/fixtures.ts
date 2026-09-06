// The committed fixtures, loaded the way the app loads them.
//
// Deliberately routed through `normalizePayload` rather than destructured by
// hand: that function is where an envelope missing its AST half silently
// becomes an empty AST, and a harness that bypassed it would golden a payload
// the app could never receive. Regenerate the files with `npm run fixtures`.

import { normalizePayload } from '../types/payload'
import type { TWFFile } from '../types/ast'
import type { ParserGraph } from '../types/parser-graph'
import decompositionSample from '../../public/fixtures/decomposition-sample.json'
import nexusSample from '../../public/fixtures/nexus-sample.json'
import taskqueuesSample from '../../public/fixtures/taskqueues-sample.json'
import stressSample from '../../public/fixtures/stress-sample.json'
import multifileSample from '../../public/fixtures/multifile-sample.json'

export interface Fixture {
  /** Also the golden's filename stem: `kickoff/goldens/<name>.golden.json`. */
  name: string
  ast: TWFFile
  parserGraph: ParserGraph
}

function load(name: string, raw: unknown): Fixture {
  const payload = normalizePayload(raw)
  if (!payload) throw new Error(`fixture ${name}: unrecognized payload shape`)
  if (!payload.parserGraph) throw new Error(`fixture ${name}: no parserGraph`)
  if ((payload.ast.definitions ?? []).length === 0) {
    // The exact silent failure the composite-envelope recipe exists to prevent:
    // an AST-less envelope normalizes to `{ definitions: [] }`, which empties
    // the file dimension without erroring anywhere.
    throw new Error(`fixture ${name}: empty AST half`)
  }
  return { name, ast: payload.ast, parserGraph: payload.parserGraph }
}

export const FIXTURES: Fixture[] = [
  load('decomposition-sample', decompositionSample),
  load('nexus-sample', nexusSample),
  load('taskqueues-sample', taskqueuesSample),
  load('stress-sample', stressSample),
  load('multifile-sample', multifileSample),
]
