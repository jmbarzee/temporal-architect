package decompose

// This file defines the public output model — the wire contract emitted by
// Decompose and serialized by `twf graph chunks --json`. The internal working
// graph these are derived from lives in workgraph.go.

// Result is the full decomposition output.
type Result struct {
	Nodes      []Node      `json:"nodes"`
	Roots      []Root      `json:"roots"`
	Chunks     []Chunk     `json:"chunks"`
	ChunkEdges []ChunkEdge `json:"chunkEdges"`
	Floor      int         `json:"floor"`
	Ceiling    int         `json:"ceiling"`
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

// Root source values. Roots discovered by the heuristics carry "heuristic";
// "declared" is reserved for #7 (declared inbound roots), which slots in later
// as a higher-priority seed source without reshaping anything.
const (
	SourceHeuristic = "heuristic"
	SourceDeclared  = "declared"
)

// Root is a heuristic entry point into the call structure. Source is always
// "heuristic" this pass; Reasons records which heuristics fired so the output
// is auditable.
type Root struct {
	Key     string   `json:"key"`
	Source  string   `json:"source"`
	Reasons []string `json:"reasons"`
}

// Chunk is one element of the hard partition (the decide phase): a weakly-
// connected component of the binding+soft subgraph. Every definition lands in
// exactly one chunk.
type Chunk struct {
	ID         string      `json:"id"`
	Roots      []ChunkRoot `json:"roots"`
	Members    []string    `json:"members"`
	Overlap    []string    `json:"overlap,omitempty"`
	Complexity int         `json:"complexity"`
	// Cyclic is true when the chunk contains a workflow-call cycle (a
	// non-trivial SCC). Such chunks are exempt from the explore phase — loops
	// are never cut.
	Cyclic bool `json:"cyclic,omitempty"`
	// BelowFloor / MergeInto carry the floor recommendation (informational —
	// never auto-applied). MergeInto names the chunk that dispatches into this
	// one (over a nexusCall contract edge), when one exists.
	BelowFloor bool       `json:"belowFloor,omitempty"`
	MergeInto  string     `json:"mergeInto,omitempty"`
	Divisions  []Division `json:"divisions,omitempty"`
	// Advisories are informational design observations about the chunk —
	// never auto-applied. Today the only kind is a contract-promotion
	// suggestion for an in-process shared service (see Advisory).
	Advisories []Advisory `json:"advisories,omitempty"`
}

// Advisory kinds.
const (
	// AdvisorySuggestContract flags an in-process shared service — a hub with
	// high binding fan-in whose dominated closure, once removed, splits the
	// rest of the chunk into separate binding components (an articulation
	// point). Promoting it to a Nexus contract would give it an explicit,
	// independently-deployable boundary. Purely informational.
	AdvisorySuggestContract = "suggestContract"
)

// Advisory is an informational design observation about a chunk — a suggestion
// the harness MAY act on, never an imposed change. Subject is the definition the
// advisory is about; Members lists the affected closure when relevant.
type Advisory struct {
	Kind    string   `json:"kind"`
	Subject string   `json:"subject"`
	Members []string `json:"members,omitempty"`
	Detail  string   `json:"detail"`
}

// ChunkRoot is one root inside a chunk together with the SCC-collapsed set of
// member keys it reaches over binding edges (including itself). A member
// appearing in more than one root's Reaches is reported once in Chunk.Overlap.
type ChunkRoot struct {
	Key     string   `json:"key"`
	Reaches []string `json:"reaches"`
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
	// StrategyService extracts a shared service: the highest-fan-in hub node
	// plus its dominated closure (the private nodes reachable only through it),
	// then splits the remainder into its binding components so the parallel
	// width freed by the extraction is visible at the cut. It generalizes and
	// replaces the older single-node hub peel — on a graph where the hub is an
	// articulation point joining otherwise-separate subsystems, removing the
	// service disconnects them into independently-authorable units.
	StrategyService = "service"
	// StrategySubtree selectively peels the heaviest dominated child-workflow
	// subtrees into their own sections — workflow-call seams only, so activities
	// stay glued to their caller — until the trunk fits under the ceiling,
	// leaving light branches inline. It is the composition-tree counterpart to
	// the service (shared-hub) extraction.
	StrategySubtree = "subtree"
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

// Section is one proposed sub-unit of a divided chunk. Members and Complexity
// are always authoritative (they list every member and its rolled-up score).
// Divisions, when present, is the recursive refinement of a section that was
// still over the ceiling: a single, locally-best sub-division. A consumer that
// doesn't walk the tree can ignore it and treat the section as a flat leaf.
type Section struct {
	ID         string     `json:"id"`
	Members    []string   `json:"members"`
	Complexity int        `json:"complexity"`
	Divisions  []Division `json:"divisions,omitempty"`
}

// SectionEdge orders two sections within a division (From must be authored
// before / is depended on by To).
type SectionEdge struct {
	From string `json:"from"`
	To   string `json:"to"`
}
