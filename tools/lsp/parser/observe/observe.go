// Package observe defines the "observed graph" — the wire contract the sampler
// emits from live Temporal history. It is the resolved-deployment graph.Graph
// shape (reused verbatim: nodes, coarsened edges, unresolved, diagnostics) with
// two additions: a Window describing a time axis, and a per-edge occurrence
// time series (ObservedEdge.Buckets).
//
// It is deliberately Temporal-free: the sampler owns the go.temporal.io
// dependency and the history→graph extraction, then produces this shape. The
// parser only defines the contract (so the wire-types projection can generate
// it) and the pure transforms over it — Merge (fold parallel samples) and
// ToGraph (project onto graph.Graph for any graph.Graph consumer).
package observe

import (
	"sort"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// Window is the time axis the per-edge occurrence buckets are laid out on.
// Since is the epoch (bucket 0's left edge); the [Since, Until) span is divided
// into Buckets equal-width slices. Buckets is always >= 1; a single bucket is a
// plain total with no time resolution.
//
// The boundaries are absolute — anchored on Since/Until, not on any one
// sample's observed event range — so two ObservedGraphs built with the same
// Window have index-aligned Buckets slices and Merge is a plain element-wise
// sum. This is what lets sampling be sharded and the shards folded after the
// fact.
type Window struct {
	Since   string `json:"since,omitempty"` // RFC3339; bucket epoch
	Until   string `json:"until,omitempty"` // RFC3339; window end
	Buckets int    `json:"buckets"`         // >= 1
}

// ObservedEdge is a graph.Edge observed in workflow history, extended with an
// occurrence time series. Buckets has length Window.Buckets; Buckets[i] counts
// the dispatches observed in time bucket i. Structural (containment) edges carry
// an all-zero series — they are topology, not an observed dispatch.
//
// The embedded graph.Edge is the "wrap": an observed edge IS a graph edge plus
// a time series. graph.Edge.Line has no meaning here (history has no source
// line) and is left 0.
type ObservedEdge struct {
	graph.Edge
	Buckets []int `json:"buckets"`
}

// ObservedGraph is a deployment graph reconstructed from observed history. It
// mirrors graph.Graph — reusing graph.Node / graph.CoarsenedEdge /
// graph.Unresolved / graph.Diagnostic unchanged — but its Edges carry the
// occurrence time series and it adds the Window. Summary / CoarsenedEdges /
// Diagnostics are derived (populated by Finalize) so the payload is a lossless
// superset of a graph.Graph envelope and consumers need no extra computation.
type ObservedGraph struct {
	Window         Window                `json:"window"`
	Summary        graph.Summary         `json:"summary"`
	Nodes          []graph.Node          `json:"nodes"`
	Edges          []ObservedEdge        `json:"edges"`
	CoarsenedEdges []graph.CoarsenedEdge `json:"coarsenedEdges"`
	Unresolved     []graph.Unresolved    `json:"unresolved"`
	Diagnostics    []graph.Diagnostic    `json:"diagnostics"`
}

// New returns an ObservedGraph with non-nil slices so the wire shape is `[]`
// rather than `null` on empty graphs, matching graph.Graph.
func New() *ObservedGraph {
	return &ObservedGraph{
		Nodes:          []graph.Node{},
		Edges:          []ObservedEdge{},
		CoarsenedEdges: []graph.CoarsenedEdge{},
		Unresolved:     []graph.Unresolved{},
		Diagnostics:    []graph.Diagnostic{},
	}
}

// ToGraph projects the observed graph onto the resolved-deployment graph.Graph
// shape, discarding the occurrence time series. The result is finalized
// (coarsened + sorted) and byte-compatible with `twf graph` output, so any
// graph.Graph consumer (decompose, the visualizer's existing pipeline) can read
// a sample without knowing it came from history.
func ToGraph(o *ObservedGraph) *graph.Graph {
	g := &graph.Graph{
		Nodes:          append([]graph.Node(nil), o.Nodes...),
		Edges:          make([]graph.Edge, 0, len(o.Edges)),
		CoarsenedEdges: []graph.CoarsenedEdge{},
		Unresolved:     append([]graph.Unresolved(nil), o.Unresolved...),
		Diagnostics:    append([]graph.Diagnostic(nil), o.Diagnostics...),
	}
	for _, e := range o.Edges {
		g.Edges = append(g.Edges, e.Edge)
	}
	graph.Finalize(g)
	return g
}

// Finalize sorts the observed graph deterministically and populates the derived
// fields (CoarsenedEdges via graph.Finalize, then Summary). Builders that
// assemble an ObservedGraph directly (the sampler) and Merge both call it.
func Finalize(o *ObservedGraph) {
	sort.SliceStable(o.Nodes, func(i, j int) bool { return o.Nodes[i].ID < o.Nodes[j].ID })
	sort.SliceStable(o.Edges, func(i, j int) bool { return lessEdge(o.Edges[i].Edge, o.Edges[j].Edge) })
	sort.SliceStable(o.Unresolved, func(i, j int) bool { return lessUnresolved(o.Unresolved[i], o.Unresolved[j]) })

	// Coarsening + graph-stage sorting/summary come from the canonical
	// graph.Finalize over the projected edges, keeping a single source of truth.
	g := ToGraph(o)
	o.CoarsenedEdges = g.CoarsenedEdges
	o.Diagnostics = g.Diagnostics
	o.Summary = graph.Summary{
		Nodes:          len(o.Nodes),
		Edges:          len(o.Edges),
		CoarsenedEdges: len(o.CoarsenedEdges),
		Unresolved:     len(o.Unresolved),
		Diagnostics:    len(o.Diagnostics),
	}
}

// Merge folds two observed graphs sampled over the same Window into one: nodes
// and edges are unioned by identity and their occurrence buckets summed
// element-wise; unresolved entries are unioned. This is the associative fold
// that lets sampling be sharded (per namespace, per worker, in parallel) and
// the shards combined afterward. The Window is taken from a; callers are
// responsible for using a consistent Window across shards.
func Merge(a, b *ObservedGraph) *ObservedGraph {
	out := New()
	out.Window = a.Window

	seenNode := map[string]struct{}{}
	addNodes := func(ns []graph.Node) {
		for _, n := range ns {
			if _, ok := seenNode[n.ID]; ok {
				continue
			}
			seenNode[n.ID] = struct{}{}
			out.Nodes = append(out.Nodes, n)
		}
	}
	addNodes(a.Nodes)
	addNodes(b.Nodes)

	edgeIdx := map[edgeKey]int{}
	addEdges := func(es []ObservedEdge) {
		for _, e := range es {
			k := keyOf(e.Edge)
			if i, ok := edgeIdx[k]; ok {
				out.Edges[i].Buckets = sumBuckets(out.Edges[i].Buckets, e.Buckets)
				continue
			}
			edgeIdx[k] = len(out.Edges)
			cp := e
			cp.Buckets = append([]int(nil), e.Buckets...)
			out.Edges = append(out.Edges, cp)
		}
	}
	addEdges(a.Edges)
	addEdges(b.Edges)

	seenUnres := map[graph.Unresolved]struct{}{}
	addUnres := func(us []graph.Unresolved) {
		for _, u := range us {
			if _, ok := seenUnres[u]; ok {
				continue
			}
			seenUnres[u] = struct{}{}
			out.Unresolved = append(out.Unresolved, u)
		}
	}
	addUnres(a.Unresolved)
	addUnres(b.Unresolved)

	Finalize(out)
	return out
}

type edgeKey struct{ from, to, kind string }

func keyOf(e graph.Edge) edgeKey { return edgeKey{from: e.From, to: e.To, kind: e.Kind} }

// sumBuckets adds two occurrence series element-wise, tolerating differing
// lengths (the longer wins; the shorter is treated as zero-padded). Equal-length
// series are the normal case when both were built with the same Window.
func sumBuckets(a, b []int) []int {
	n := len(a)
	if len(b) > n {
		n = len(b)
	}
	out := make([]int, n)
	for i, v := range a {
		out[i] += v
	}
	for i, v := range b {
		out[i] += v
	}
	return out
}

// lessEdge / lessUnresolved mirror the comparators in graph.finalize so the
// observed edges/unresolved sort identically to their projection.
func lessEdge(a, b graph.Edge) bool {
	if a.From != b.From {
		return a.From < b.From
	}
	if a.To != b.To {
		return a.To < b.To
	}
	if a.Kind != b.Kind {
		return a.Kind < b.Kind
	}
	return a.Line < b.Line
}

func lessUnresolved(a, b graph.Unresolved) bool {
	if a.From != b.From {
		return a.From < b.From
	}
	if a.Name != b.Name {
		return a.Name < b.Name
	}
	return a.Line < b.Line
}
