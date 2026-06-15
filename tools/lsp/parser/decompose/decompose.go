package decompose

import (
	"sort"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// Root source values. Roots discovered by the heuristics below carry
// "heuristic"; "declared" is reserved for #7 (declared inbound roots), which
// slots in later as a higher-priority seed source without reshaping anything.
const (
	SourceHeuristic = "heuristic"
	SourceDeclared  = "declared"
)

// DefaultFloor is the complexity floor below which a hard chunk is flagged as
// "too granular for its own subagent". It is a documented default, not a
// calibrated value — tune it from real designs. The ceiling has no default:
// #2 divisions are only computed when the caller instructs a ceiling.
const DefaultFloor = 2

// Options configures a Decompose run.
type Options struct {
	// Floor is the complexity threshold below which a hard chunk is flagged
	// too-granular and recommended for merge. Zero selects DefaultFloor; a
	// negative value disables the floor entirely.
	Floor int
	// Ceiling, when > 0, triggers #2 soft divisions for any chunk scoring
	// above it. Zero (the default) emits the hard partition only.
	Ceiling int
	// By biases / filters the division strategies emitted for over-ceiling
	// chunks. Empty means "all applicable strategies". Recognized values:
	// StrategyTree, StrategyNexus, StrategyWorker, StrategyNamespace.
	By []string
}

// effectiveFloor resolves the floor with DefaultFloor / disable semantics.
func (o Options) effectiveFloor() int {
	if o.Floor == 0 {
		return DefaultFloor
	}
	if o.Floor < 0 {
		return 0
	}
	return o.Floor
}

// Node is one authorable definition (a unique AST entry). Structure between
// nodes comes from graph edges collapsed to definition keys.
type Node struct {
	Key        string   `json:"key"`  // definition key, e.g. "workflow:OrderWorkflow"
	Kind       string   `json:"kind"` // graph.KindWorkflow / KindActivity / KindNexusOperation
	Name       string   `json:"name"`
	Workers    []string `json:"workers,omitempty"`    // hosting worker definition keys
	Namespaces []string `json:"namespaces,omitempty"` // hosting namespace node IDs
	Langs      []string `json:"langs,omitempty"`      // reserved for #1b (no @lang yet)
	Complexity int      `json:"complexity"`
}

// Root is a heuristic entry point into the call structure. Source is always
// "heuristic" this pass; Reasons records which heuristics fired so the output
// is auditable.
type Root struct {
	Key     string   `json:"key"`
	Source  string   `json:"source"`
	Reasons []string `json:"reasons"`
}

// ChunkRoot is one root inside a chunk together with the SCC-collapsed set of
// member keys it reaches over binding edges (including itself). A member
// appearing in more than one root's Reaches is reported once in Chunk.Overlap.
type ChunkRoot struct {
	Key     string   `json:"key"`
	Reaches []string `json:"reaches"`
}

// Chunk is one element of the #1 hard partition: a weakly-connected component
// of the binding+soft subgraph. Every definition lands in exactly one chunk.
type Chunk struct {
	ID         string      `json:"id"`
	Roots      []ChunkRoot `json:"roots"`
	Members    []string    `json:"members"`
	Overlap    []string    `json:"overlap,omitempty"`
	Complexity int         `json:"complexity"`
	// Cyclic is true when the chunk contains a workflow-call cycle (a
	// non-trivial SCC). Such chunks are exempt from #2 — loops are never cut.
	Cyclic bool `json:"cyclic,omitempty"`
	// BelowFloor / MergeInto carry the floor recommendation (informational —
	// never auto-applied). MergeInto names the chunk that dispatches into this
	// one (over a nexusCall contract edge), when one exists.
	BelowFloor bool       `json:"belowFloor,omitempty"`
	MergeInto  string     `json:"mergeInto,omitempty"`
	Divisions  []Division `json:"divisions,omitempty"`
}

// ChunkEdge is a contract-cut dependency between two hard chunks. Today the
// only inter-chunk edge is a nexusCall (Via == graph.EdgeNexusCall). Together
// these form the top-level dependency DAG the harness can order subagents by.
type ChunkEdge struct {
	From string `json:"from"`
	To   string `json:"to"`
	Via  string `json:"via"`
}

// Division strategy identifiers, selectable / biasable via Options.By.
const (
	StrategyTree      = "tree"
	StrategyNexus     = "nexus"
	StrategyWorker    = "worker"
	StrategyNamespace = "namespace"
)

// Division is one candidate way to cut an over-ceiling chunk into sections,
// plus a dependency DAG ordering those sections. Rank is 1-based; rank 1 is the
// most balanced candidate.
type Division struct {
	Strategy  string        `json:"strategy"`
	Rank      int           `json:"rank"`
	Sections  []Section     `json:"sections"`
	DAG       []SectionEdge `json:"dag"`
	Rationale string        `json:"rationale"`
}

// Section is one proposed sub-unit of a divided chunk.
type Section struct {
	ID         string   `json:"id"`
	Members    []string `json:"members"`
	Complexity int      `json:"complexity"`
}

// SectionEdge orders two sections within a division (From must be authored
// before / is depended on by To).
type SectionEdge struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// Result is the full decomposition output.
type Result struct {
	Nodes      []Node      `json:"nodes"`
	Roots      []Root      `json:"roots"`
	Chunks     []Chunk     `json:"chunks"`
	ChunkEdges []ChunkEdge `json:"chunkEdges"`
	Floor      int         `json:"floor"`
	Ceiling    int         `json:"ceiling"`
}

// Decompose computes the chunk decomposition for a resolved deployment graph.
//
// The node set and call structure come from the graph: distinct definitions
// (graph.Node.Definition already collapses deployment-duplicates back to one
// authorable unit) and edges mapped to those definition keys. The AST, when
// provided, enriches the result — it drives the complexity metric (body counts)
// and contributes handler-bearing roots. Passing a nil AST (e.g. a graph
// reconstructed from sampled history) still yields a structural decomposition
// with base complexity per node. A nil graph yields an empty Result.
func Decompose(file *ast.File, g *graph.Graph, opts Options) *Result {
	res := &Result{
		Nodes:      []Node{},
		Roots:      []Root{},
		Chunks:     []Chunk{},
		ChunkEdges: []ChunkEdge{},
		Floor:      opts.effectiveFloor(),
		Ceiling:    opts.Ceiling,
	}
	if g == nil {
		return res
	}

	wg := buildWorkGraph(g)
	computeComplexity(file, wg)

	wg.condense() // Tarjan SCC over the binding subgraph (roots read it)
	roots := wg.heuristicRoots(file)

	res.Nodes = wg.exportNodes()
	res.Roots = exportRoots(roots)
	res.Chunks, res.ChunkEdges = wg.partition(roots)

	applyFloor(res, opts.effectiveFloor())
	if opts.Ceiling > 0 {
		applyDivisions(wg, res, opts)
	}

	return res
}

// ---------------------------------------------------------------------------
// Working graph
// ---------------------------------------------------------------------------

// workNode is a node in the internal definition-keyed working graph.
type workNode struct {
	key        string
	kind       string
	name       string
	workers    map[string]bool
	namespaces map[string]bool
	langs      map[string]bool
	complexity int
}

// workGraph is the definition-keyed graph decompose reasons over. Edges are
// deduped adjacency sets, classified by call semantics. The Tarjan condensation
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
	scc   [][]string           // SCCs in reverse-topological order, members sorted
	sccOf map[string]int       // node key → SCC index
	cond  map[int]map[int]bool // condensation DAG adjacency (binding only)
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

// buildWorkGraph constructs the definition-keyed working graph from the resolved
// graph: nodes are the distinct authorable definitions appearing in the graph
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
	// are read off each instance's composite ID and retained for #1b and the
	// grouping lens.
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
		complexity: weightBase, // base score; refined from the AST when present
	}
}

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

func exportRoots(roots map[string]*Root) []Root {
	out := make([]Root, 0, len(roots))
	for _, r := range roots {
		out = append(out, *r)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out
}

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------

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
