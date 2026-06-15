package decompose

import (
	"sort"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// This file defines the internal definition-keyed working graph: the model
// Decompose reasons over, how it is built from a resolved graph, and the small
// ID/collection helpers used throughout the package. The public output model it
// is exported into lives in result.go.

// workNode is a node in the internal definition-keyed working graph: one
// authorable definition with its retained deployment attributes and complexity.
type workNode struct {
	key        string
	kind       string
	name       string
	workers    map[string]bool
	namespaces map[string]bool
	langs      map[string]bool
	complexity int
}

// workGraph is the definition-keyed graph Decompose reasons over. Edges are
// deduped adjacency sets classified by call semantics; the Tarjan condensation
// (scc / sccOf) is populated by condense().
type workGraph struct {
	nodes map[string]*workNode

	binding  edgeSet // call structure: activityCall, workflowCall, asyncBacking
	soft     edgeSet // signalSend
	contract edgeSet // nexusCall (contract cut)

	// asyncBackTo records the target node of every asyncBacking edge — an
	// external entry point, hence a heuristic root despite carrying an in-edge.
	asyncBackTo map[string]bool

	// SCC condensation over the binding subgraph, set by condense().
	scc   [][]string     // SCCs in reverse-topological order, members sorted
	sccOf map[string]int // node key → SCC index
}

// edgeSet is a deduped from→to adjacency set.
type edgeSet map[string]map[string]bool

func (e edgeSet) add(from, to string) {
	if from == to {
		return
	}
	if e[from] == nil {
		e[from] = map[string]bool{}
	}
	e[from][to] = true
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

// buildWorkGraph constructs the working graph from the resolved graph: nodes are
// the distinct authorable definitions appearing in the graph
// (graph.Node.Definition collapses deployment-duplicates), edges are graph edges
// collapsed to their definition key. Complexity is seeded to the base weight and
// later refined from the AST when one is available.
func buildWorkGraph(g *graph.Graph) *workGraph {
	wg := &workGraph{
		nodes:       map[string]*workNode{},
		binding:     edgeSet{},
		soft:        edgeSet{},
		contract:    edgeSet{},
		asyncBackTo: map[string]bool{},
	}

	// Nodes: every authorable definition in the graph — only workflow,
	// activity, and nexus operation definitions carry call structure. Workers,
	// namespaces, nexus services, and endpoints are deployment context, not
	// decomposition nodes. Deployment attributes (hosting worker / namespace)
	// are read off each instance's composite ID and retained for the deferred
	// language-boundary split and grouping lens.
	for _, n := range g.Nodes {
		kind := kindOf(n.Definition)
		if !isAuthorableKind(kind) {
			continue
		}
		wg.ensureNode(n.Definition, kind, defNameOf(n.Definition))
		wn := wg.nodes[n.Definition]
		worker, namespace := deploymentOf(n.ID)
		if worker != "" {
			wn.workers[worker] = true
		}
		if namespace != "" {
			wn.namespaces[namespace] = true
		}
	}

	// Edges: collapse each graph edge's endpoints to their definition key and
	// classify by kind. Endpoints whose definitions are not decomposition
	// nodes (e.g. containment into a worker) are skipped.
	for _, e := range g.Edges {
		from := defKeyOf(e.From)
		to := defKeyOf(e.To)
		if wg.nodes[from] == nil || wg.nodes[to] == nil {
			continue
		}
		switch e.Kind {
		case graph.EdgeActivityCall, graph.EdgeWorkflowCall, graph.EdgeAsyncBacking:
			wg.binding.add(from, to)
			if e.Kind == graph.EdgeAsyncBacking {
				wg.asyncBackTo[to] = true
			}
		case graph.EdgeSignalSend:
			wg.soft.add(from, to)
		case graph.EdgeNexusCall:
			wg.contract.add(from, to)
		}
		// containment / nexusRoute: not call structure, ignored.
	}

	return wg
}

// ensureNode inserts a node for a definition key once, seeded to base
// complexity (refined later from the AST when present).
func (wg *workGraph) ensureNode(key, kind, name string) {
	if wg.nodes[key] != nil {
		return
	}
	wg.nodes[key] = &workNode{
		key:        key,
		kind:       kind,
		name:       name,
		workers:    map[string]bool{},
		namespaces: map[string]bool{},
		langs:      map[string]bool{},
		complexity: weightBase,
	}
}

// exportNodes renders the working nodes as the public Node slice, sorted by key.
func (wg *workGraph) exportNodes() []Node {
	out := make([]Node, 0, len(wg.nodes))
	for _, key := range wg.sortedKeys() {
		wn := wg.nodes[key]
		out = append(out, Node{
			Key:        wn.key,
			Kind:       wn.kind,
			Name:       wn.name,
			Workers:    sortedSet(wn.workers),
			Namespaces: sortedSet(wn.namespaces),
			Langs:      sortedSet(wn.langs),
			Complexity: wn.complexity,
		})
	}
	return out
}

// sortedKeys returns all node keys in stable sorted order.
func (wg *workGraph) sortedKeys() []string {
	keys := make([]string, 0, len(wg.nodes))
	for k := range wg.nodes {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// ---------------------------------------------------------------------------
// Definition-key helpers
// ---------------------------------------------------------------------------

// isAuthorableKind reports whether a definition kind is a decomposition node
// (carries call structure) rather than deployment context.
func isAuthorableKind(kind string) bool {
	switch kind {
	case graph.KindWorkflow, graph.KindActivity, graph.KindNexusOperation:
		return true
	default:
		return false
	}
}

// kindOf returns the kind prefix of a definition key ("workflow:Foo" → "workflow").
func kindOf(definition string) string {
	if i := strings.IndexByte(definition, ':'); i >= 0 {
		return definition[:i]
	}
	return definition
}

// defNameOf returns the name portion of a definition key
// ("workflow:Foo" → "Foo", "nexusOperation:Svc.Op" → "Svc.Op").
func defNameOf(definition string) string {
	if i := strings.IndexByte(definition, ':'); i >= 0 {
		return definition[i+1:]
	}
	return definition
}

// defKeyOf returns the definition key of a graph node ID — the leftmost
// kind:Name segment, before the first "/". This mirrors graph.Node.Definition.
func defKeyOf(nodeID string) string {
	if i := strings.IndexByte(nodeID, '/'); i >= 0 {
		return nodeID[:i]
	}
	return nodeID
}

// deploymentOf extracts the hosting worker definition key and namespace node ID
// from a composite graph node ID, e.g.
// "workflow:Order/worker:orders/namespace:ecommerce" → ("worker:orders",
// "namespace:ecommerce"). Orphan and bare IDs yield empty strings.
func deploymentOf(nodeID string) (worker, namespace string) {
	for _, seg := range strings.Split(nodeID, "/")[1:] {
		switch {
		case strings.HasPrefix(seg, graph.KindWorker+":"):
			worker = seg
		case strings.HasPrefix(seg, graph.KindNamespace+":"):
			namespace = seg
		}
	}
	return worker, namespace
}

// ---------------------------------------------------------------------------
// Set helpers
// ---------------------------------------------------------------------------

// setOf builds a presence set from a slice.
func setOf(keys []string) map[string]bool {
	m := make(map[string]bool, len(keys))
	for _, k := range keys {
		m[k] = true
	}
	return m
}

// sortedSet returns a set's members as a sorted slice, or nil when empty.
func sortedSet(m map[string]bool) []string {
	if len(m) == 0 {
		return nil
	}
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
