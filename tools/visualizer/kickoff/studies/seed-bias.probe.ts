import { readFileSync } from 'node:fs'
import { buildGraph } from '<visualizer>/src/adapter/build'
import { DEFAULT_ONTOLOGY, ALL_NODE_TYPES, NODE_TYPE_REGISTRY } from '<visualizer>/src/adapter/node-types'
import { Simulation, defaultParamsFor } from '<visualizer>/src/graph/simulation'
import { bandFor, bandCenters, medianBandCenter, resolvePhysics } from '<visualizer>/src/graph/forces'
import { mulberry32 } from '<visualizer>/src/verify/rng'
import { computeVisibleGraph } from '<visualizer>/src/components/graph-view/visibleGraph'
import { filterOfSets } from '<visualizer>/src/filter/types'

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = s.length; return m ? (m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2) : 0 }
type Strategy = 'centred' | 'unshifted' | 'uniform' | 'centredFull' | 'lower'
function run(fixture: string, strategy: Strategy, seed: number): number {
  const fx = JSON.parse(readFileSync('<visualizer>/public/fixtures/' + fixture + '.json', 'utf8'))
  const graph = buildGraph(fx.parserGraph ?? fx.graph, fx.ast ?? fx)
  const params = defaultParamsFor(DEFAULT_ONTOLOGY)
  const sim = new Simulation(graph, params, mulberry32(seed), DEFAULT_ONTOLOGY)
  const resolved = resolvePhysics(sim.params, DEFAULT_ONTOLOGY)
  const rng = mulberry32(seed ^ 0x9e37)
  const shiftX = medianBandCenter(sim.nodes, resolved.bandX), shiftY = medianBandCenter(sim.nodes, resolved.bandY)
  for (const n of sim.nodes) {
    const bx = bandFor(resolved.bandX, n), by = bandFor(resolved.bandY, n)
    const h = by.max - by.min, cyS = (by.min + by.max) / 2 - shiftY, cxS = (bx.min + bx.max) / 2 - shiftX
    const xJ = Math.max(40, (bx.max - bx.min) * 0.7)
    n.x = cxS + (rng() - 0.5) * xJ
    if (strategy === 'centred') n.y = cyS + (rng() - 0.5) * Math.max(20, h / 2)
    else if (strategy === 'unshifted') n.y = cyS + shiftY + (rng() - 0.5) * Math.max(20, h / 2)
    else if (strategy === 'uniform') n.y = (by.min - shiftY) + rng() * h
    else if (strategy === 'centredFull') n.y = cyS + (rng() - 0.5) * h
    else if (strategy === 'lower') n.y = cyS + h * 0.35 + (rng() - 0.5) * Math.max(20, h / 2)
    n.vx = 0; n.vy = 0
  }
  for (const n of sim.nodes) if (n.parentId) { const p = sim.nodes.find(q => q.id === n.parentId); if (p) n.x = p.x + (rng() - 0.5) * 20 }
  const vg = computeVisibleGraph(sim, filterOfSets(new Set(ALL_NODE_TYPES.map(t => NODE_TYPE_REGISTRY[t].defType)), new Set()), DEFAULT_ONTOLOGY)
  for (let i = 0; i < 400; i++) sim.tick(undefined, vg.downstreamScores)
  const shift = median(bandCenters(sim.nodes, resolved.bandY))
  let outside = 0
  for (const n of sim.nodes) { const b = bandFor(resolved.bandY, n); const slack = (b.max - b.min) * 0.05; if (!(n.y >= b.min - shift - slack && n.y <= b.max - shift + slack)) outside++ }
  return outside
}
const seeds = [0x5eed, ...Array.from({ length: 23 }, (_, i) => 0x1001 + i)]
for (const fixture of ['stress-sample', 'decomposition-sample', 'multifile-sample']) {
  for (const strategy of ['centred', 'unshifted', 'uniform', 'centredFull', 'lower'] as Strategy[]) {
    const r = seeds.map(s => run(fixture, strategy, s))
    const mean = r.reduce((a, b) => a + b, 0) / r.length
    console.log(fixture.padEnd(22), strategy.padEnd(12), 'mean', mean.toFixed(1).padStart(5), 'max', Math.max(...r), 'seeds>10:', r.filter(x => x > 10).length + '/' + r.length)
  }
}
