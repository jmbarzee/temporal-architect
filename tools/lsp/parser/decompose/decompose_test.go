package decompose

import (
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// gnode builds a graph node whose ID is its bare definition key (no deployment
// suffix) — enough for the structural assertions that don't read attributes.
func gnode(def string) graph.Node { return graph.Node{ID: def, Definition: def} }

// gedge builds a dispatch edge between two bare-key node IDs.
func gedge(from, to, kind string) graph.Edge {
	return graph.Edge{From: from, To: to, Kind: kind}
}

// decomposeTWF parses + resolves + extracts an inline .twf source and runs the
// full AST-aware decomposition.
func decomposeTWF(t *testing.T, src string, opts Options) *Result {
	t.Helper()
	file, parseErrs := parser.ParseFileAll(src)
	for _, e := range parseErrs {
		t.Fatalf("parse: %v", e)
	}
	if errs := resolver.Resolve(file); len(errs) > 0 {
		for _, e := range errs {
			t.Fatalf("resolve: %v", e)
		}
	}
	g := graph.Extract(file)
	return Decompose(file, g, opts)
}

// chunkByID returns the chunk with the given ID, failing if absent.
func chunkByID(t *testing.T, res *Result, id string) Chunk {
	t.Helper()
	for _, c := range res.Chunks {
		if c.ID == id {
			return c
		}
	}
	t.Fatalf("chunk %q not found; have %v", id, chunkIDs(res))
	return Chunk{}
}

func chunkIDs(res *Result) []string {
	out := make([]string, 0, len(res.Chunks))
	for _, c := range res.Chunks {
		out = append(out, c.ID)
	}
	return out
}

func rootKeys(c Chunk) []string {
	out := make([]string, 0, len(c.Roots))
	for _, r := range c.Roots {
		out = append(out, r.Key)
	}
	return out
}

func contains(xs []string, want string) bool {
	for _, x := range xs {
		if x == want {
			return true
		}
	}
	return false
}

func rootReason(res *Result, key, reason string) bool {
	for _, r := range res.Roots {
		if r.Key == key {
			return contains(r.Reasons, reason)
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// 1. Definition-collapse: one workflow on two workers → one chunk node
// ---------------------------------------------------------------------------

func TestDefinitionCollapse(t *testing.T) {
	wf := graph.DefKey(graph.KindWorkflow, "W")
	act := graph.DefKey(graph.KindActivity, "A")
	g := &graph.Graph{
		Nodes: []graph.Node{
			{ID: graph.HostedID(graph.KindWorkflow, "W", "w1", "ns", false), Definition: wf},
			{ID: graph.HostedID(graph.KindWorkflow, "W", "w2", "ns", false), Definition: wf},
			{ID: graph.HostedID(graph.KindActivity, "A", "w1", "ns", false), Definition: act},
			{ID: graph.HostedID(graph.KindActivity, "A", "w2", "ns", false), Definition: act},
		},
		Edges: []graph.Edge{
			gedge(graph.HostedID(graph.KindWorkflow, "W", "w1", "ns", false), graph.HostedID(graph.KindActivity, "A", "w1", "ns", false), graph.EdgeActivityCall),
			gedge(graph.HostedID(graph.KindWorkflow, "W", "w2", "ns", false), graph.HostedID(graph.KindActivity, "A", "w2", "ns", false), graph.EdgeActivityCall),
		},
	}

	res := Decompose(nil, g, Options{})

	if len(res.Nodes) != 2 {
		t.Fatalf("nodes = %d, want 2 (deployment-duplicates collapsed); got %+v", len(res.Nodes), res.Nodes)
	}
	if len(res.Chunks) != 1 {
		t.Fatalf("chunks = %d, want 1; got %v", len(res.Chunks), chunkIDs(res))
	}
	c := res.Chunks[0]
	if !contains(c.Members, wf) || !contains(c.Members, act) {
		t.Fatalf("chunk members = %v, want both %s and %s", c.Members, wf, act)
	}
	// The collapsed W node retains both hosting workers as attributes.
	for _, n := range res.Nodes {
		if n.Key == wf {
			if len(n.Workers) != 2 {
				t.Errorf("W workers = %v, want 2 (w1, w2)", n.Workers)
			}
		}
	}
}

// ---------------------------------------------------------------------------
// 2a. asyncBacking target is a root (despite an in-edge)
// ---------------------------------------------------------------------------

func TestAsyncBackingTargetIsRoot(t *testing.T) {
	op := graph.DefKey(graph.KindNexusOperation, "S.Op")
	bw := graph.DefKey(graph.KindWorkflow, "BW")
	rec := graph.DefKey(graph.KindActivity, "Rec")
	g := &graph.Graph{
		Nodes: []graph.Node{gnode(op), gnode(bw), gnode(rec)},
		Edges: []graph.Edge{
			gedge(op, bw, graph.EdgeAsyncBacking),
			gedge(bw, rec, graph.EdgeActivityCall),
		},
	}

	res := Decompose(nil, g, Options{})

	if len(res.Chunks) != 1 {
		t.Fatalf("chunks = %d, want 1; got %v", len(res.Chunks), chunkIDs(res))
	}
	if !rootReason(res, bw, reasonAsyncTarget) {
		t.Errorf("BW should be a root with reason %q; roots = %+v", reasonAsyncTarget, res.Roots)
	}
	// The operation (no binding in-edge) is also a root.
	if !rootReason(res, op, reasonNoInEdge) {
		t.Errorf("S.Op should be a root with reason %q; roots = %+v", reasonNoInEdge, res.Roots)
	}
}

// ---------------------------------------------------------------------------
// 2b. Handler-bearing workflow is a root (AST path)
// ---------------------------------------------------------------------------

func TestHandlerBearingIsRoot(t *testing.T) {
	src := `
workflow Parent():
    workflow Child()
    close complete

workflow Child():
    signal Ping():
        return
    activity Work()
    close complete

activity Work():
    return

worker w:
    workflow Parent
    workflow Child
    activity Work

namespace ns:
    worker w
        options:
            task_queue: "q"
`
	res := decomposeTWF(t, src, Options{})

	child := graph.DefKey(graph.KindWorkflow, "Child")
	parent := graph.DefKey(graph.KindWorkflow, "Parent")
	if !rootReason(res, child, reasonHandler) {
		t.Errorf("Child should be a root with reason %q; roots = %+v", reasonHandler, res.Roots)
	}
	if !rootReason(res, parent, reasonNoInEdge) {
		t.Errorf("Parent should be a root with reason %q; roots = %+v", reasonNoInEdge, res.Roots)
	}
	// Parent → Child is a binding (workflowCall) edge, so they share one chunk.
	if len(res.Chunks) != 1 {
		t.Fatalf("chunks = %d, want 1; got %v", len(res.Chunks), chunkIDs(res))
	}
}

// ---------------------------------------------------------------------------
// 3. signalSend keeps a blob but yields two separate roots
// ---------------------------------------------------------------------------

func TestSignalSendSoftEdge(t *testing.T) {
	sender := graph.DefKey(graph.KindWorkflow, "Sender")
	receiver := graph.DefKey(graph.KindWorkflow, "Receiver")
	g := &graph.Graph{
		Nodes: []graph.Node{gnode(sender), gnode(receiver)},
		// Only a signalSend connects them: a soft edge, not a binding call.
		Edges: []graph.Edge{gedge(sender, receiver, graph.EdgeSignalSend)},
	}

	res := Decompose(nil, g, Options{})

	// One blob (the soft edge keeps them in the same weakly-connected chunk).
	if len(res.Chunks) != 1 {
		t.Fatalf("chunks = %d, want 1 (soft edge keeps a blob); got %v", len(res.Chunks), chunkIDs(res))
	}
	c := res.Chunks[0]
	if !contains(c.Members, sender) || !contains(c.Members, receiver) {
		t.Fatalf("chunk members = %v, want both %s and %s", c.Members, sender, receiver)
	}
	// Two separate roots: the soft edge is not a binding in-edge, so neither
	// reaches the other — both are in-degree-0 roots.
	if got := rootKeys(c); len(got) != 2 {
		t.Fatalf("chunk roots = %v, want 2 (sender + receiver)", got)
	}
}

// ---------------------------------------------------------------------------
// 4. Overlap node reported once under two roots
// ---------------------------------------------------------------------------

func TestOverlapReportedOnce(t *testing.T) {
	a := graph.DefKey(graph.KindWorkflow, "A")
	b := graph.DefKey(graph.KindWorkflow, "B")
	x := graph.DefKey(graph.KindActivity, "X")
	g := &graph.Graph{
		Nodes: []graph.Node{gnode(a), gnode(b), gnode(x)},
		Edges: []graph.Edge{
			gedge(a, x, graph.EdgeActivityCall),
			gedge(b, x, graph.EdgeActivityCall),
		},
	}

	res := Decompose(nil, g, Options{})

	if len(res.Chunks) != 1 {
		t.Fatalf("chunks = %d, want 1 (shared X connects A and B); got %v", len(res.Chunks), chunkIDs(res))
	}
	c := res.Chunks[0]
	if len(c.Overlap) != 1 || c.Overlap[0] != x {
		t.Fatalf("overlap = %v, want exactly [%s]", c.Overlap, x)
	}
	// X is referenced by each of the two roots' reach sets.
	refs := 0
	for _, r := range c.Roots {
		if contains(r.Reaches, x) {
			refs++
		}
	}
	if refs != 2 {
		t.Errorf("X referenced by %d roots' reach sets, want 2", refs)
	}
}

// ---------------------------------------------------------------------------
// 5. SCC collapse of a workflow-call cycle into one chunk
// ---------------------------------------------------------------------------

func TestCycleCollapsedToOneChunk(t *testing.T) {
	a := graph.DefKey(graph.KindWorkflow, "A")
	b := graph.DefKey(graph.KindWorkflow, "B")
	g := &graph.Graph{
		Nodes: []graph.Node{gnode(a), gnode(b)},
		Edges: []graph.Edge{
			gedge(a, b, graph.EdgeWorkflowCall),
			gedge(b, a, graph.EdgeWorkflowCall),
		},
	}

	res := Decompose(nil, g, Options{})

	if len(res.Chunks) != 1 {
		t.Fatalf("chunks = %d, want 1 (the cycle is one chunk); got %v", len(res.Chunks), chunkIDs(res))
	}
	c := res.Chunks[0]
	if !c.Cyclic {
		t.Errorf("chunk should be marked cyclic")
	}
	if !contains(c.Members, a) || !contains(c.Members, b) {
		t.Fatalf("chunk members = %v, want both %s and %s", c.Members, a, b)
	}
}

// ---------------------------------------------------------------------------
// 6. Floor-merge of a trivial chunk
// ---------------------------------------------------------------------------

func TestFloorMergeIntoDispatchingChunk(t *testing.T) {
	caller := graph.DefKey(graph.KindWorkflow, "Caller")
	op := graph.DefKey(graph.KindNexusOperation, "S.Op")
	bw := graph.DefKey(graph.KindWorkflow, "BW")
	g := &graph.Graph{
		Nodes: []graph.Node{gnode(caller), gnode(op), gnode(bw)},
		Edges: []graph.Edge{
			gedge(caller, op, graph.EdgeNexusCall), // contract cut → separate chunks
			gedge(op, bw, graph.EdgeAsyncBacking),  // binding → op+bw share a chunk
		},
	}

	// Floor 3: base complexity is 1/node, so the {op, bw} chunk (2) and the
	// {Caller} chunk (1) both fall below the floor.
	res := Decompose(nil, g, Options{Floor: 3})

	callerChunk := chunkID(nil, []string{caller}) // {Caller}
	nexusChunk := "chunk:" + op                   // {S.Op, BW} — smallest root is the op
	cc := chunkByID(t, res, callerChunk)
	nc := chunkByID(t, res, nexusChunk)

	if !nc.BelowFloor {
		t.Errorf("nexus chunk should be below floor")
	}
	if nc.MergeInto != callerChunk {
		t.Errorf("nexus chunk mergeInto = %q, want %q (the dispatching chunk)", nc.MergeInto, callerChunk)
	}
	// The caller chunk is below floor too, but nothing dispatches into it.
	if !cc.BelowFloor || cc.MergeInto != "" {
		t.Errorf("caller chunk: belowFloor=%v mergeInto=%q, want true and empty", cc.BelowFloor, cc.MergeInto)
	}
	// The contract dependency is recorded as an inter-chunk edge.
	if len(res.ChunkEdges) != 1 || res.ChunkEdges[0].From != callerChunk || res.ChunkEdges[0].To != nexusChunk {
		t.Errorf("chunkEdges = %+v, want one %s -> %s", res.ChunkEdges, callerChunk, nexusChunk)
	}
}

// ---------------------------------------------------------------------------
// 7. Ceiling-triggered division with a correct dependency DAG (AST path)
// ---------------------------------------------------------------------------

func TestCeilingDivisionTree(t *testing.T) {
	src := `
workflow Big():
    activity A()
    activity B()
    activity C()
    activity D()
    close complete

activity A():
    return
activity B():
    return
activity C():
    return
activity D():
    return

worker w:
    workflow Big
    activity A
    activity B
    activity C
    activity D

namespace ns:
    worker w
        options:
            task_queue: "q"
`
	// Disable the floor so the trivial leaf sections aren't gated out, and set
	// a low ceiling so the single fat chunk triggers #2.
	res := decomposeTWF(t, src, Options{Ceiling: 5, Floor: -1})

	big := graph.DefKey(graph.KindWorkflow, "Big")
	c := chunkByID(t, res, "chunk:"+big)
	if c.Complexity <= res.Ceiling {
		t.Fatalf("chunk complexity %d should exceed ceiling %d", c.Complexity, res.Ceiling)
	}
	if len(c.Divisions) == 0 {
		t.Fatalf("expected at least one division for the over-ceiling chunk")
	}
	// Only the tree strategy applies (single worker/namespace, no nexus).
	div := c.Divisions[0]
	if div.Strategy != StrategyTree {
		t.Fatalf("top-ranked division strategy = %q, want %q", div.Strategy, StrategyTree)
	}
	if div.Rank != 1 {
		t.Errorf("top division rank = %d, want 1", div.Rank)
	}
	// Root section + one section per leaf activity = 5 sections.
	if len(div.Sections) != 5 {
		t.Errorf("division sections = %d, want 5; got %+v", len(div.Sections), div.Sections)
	}
	// The DAG orders the root section before each leaf (root depends on leaves).
	rootSection := c.ID + "/root:" + big
	deps := map[string]bool{}
	for _, e := range div.DAG {
		if e.From == rootSection {
			deps[e.To] = true
		}
	}
	for _, name := range []string{"A", "B", "C", "D"} {
		want := c.ID + "/subtree:" + graph.DefKey(graph.KindActivity, name)
		if !deps[want] {
			t.Errorf("DAG missing %s -> %s; got %+v", rootSection, want, div.DAG)
		}
	}
}

// ---------------------------------------------------------------------------
// 8. Loop chunk exempt from cutting even when over the ceiling
// ---------------------------------------------------------------------------

func TestLoopChunkExemptFromCutting(t *testing.T) {
	a := graph.DefKey(graph.KindWorkflow, "A")
	b := graph.DefKey(graph.KindWorkflow, "B")
	g := &graph.Graph{
		Nodes: []graph.Node{gnode(a), gnode(b)},
		Edges: []graph.Edge{
			gedge(a, b, graph.EdgeWorkflowCall),
			gedge(b, a, graph.EdgeWorkflowCall),
		},
	}

	// Ceiling 1: the chunk's complexity (2 base) exceeds it, so #2 would fire —
	// but the chunk is one SCC (a loop), which is never cut.
	res := Decompose(nil, g, Options{Ceiling: 1, Floor: -1})

	if len(res.Chunks) != 1 {
		t.Fatalf("chunks = %d, want 1; got %v", len(res.Chunks), chunkIDs(res))
	}
	c := res.Chunks[0]
	if !c.Cyclic {
		t.Fatalf("chunk should be cyclic")
	}
	if c.Complexity <= res.Ceiling {
		t.Fatalf("chunk complexity %d should exceed ceiling %d (so the exemption is meaningful)", c.Complexity, res.Ceiling)
	}
	if len(c.Divisions) != 0 {
		t.Errorf("loop chunk must be exempt from #2; got divisions %+v", c.Divisions)
	}
}

// ---------------------------------------------------------------------------
// Complexity metric: a fatter body scores higher than a trivial one (AST path)
// ---------------------------------------------------------------------------

func TestComplexityIncreasesWithBody(t *testing.T) {
	src := `
workflow Fat():
    activity A()
    if (x):
        activity B()
    else:
        activity C()
    close complete

workflow Thin():
    close complete

activity A():
    return
activity B():
    return
activity C():
    return

worker w:
    workflow Fat
    workflow Thin
    activity A
    activity B
    activity C

namespace ns:
    worker w
        options:
            task_queue: "q"
`
	res := decomposeTWF(t, src, Options{})

	var fat, thin int
	for _, n := range res.Nodes {
		switch n.Key {
		case graph.DefKey(graph.KindWorkflow, "Fat"):
			fat = n.Complexity
		case graph.DefKey(graph.KindWorkflow, "Thin"):
			thin = n.Complexity
		}
	}
	if fat <= thin {
		t.Errorf("Fat complexity (%d) should exceed Thin complexity (%d)", fat, thin)
	}
	if thin < 1 {
		t.Errorf("every node should carry at least the base weight; Thin = %d", thin)
	}
}

// Decompose must tolerate nil inputs (e.g. a catastrophically failed parse).
func TestDecomposeNilGraph(t *testing.T) {
	res := Decompose(nil, nil, Options{})
	if res == nil {
		t.Fatal("Decompose returned nil")
	}
	if len(res.Chunks) != 0 || len(res.Nodes) != 0 {
		t.Errorf("nil graph should yield an empty result; got %+v", res)
	}
	// Slices must be non-nil for a stable JSON wire shape.
	if res.Chunks == nil || res.Nodes == nil || res.Roots == nil || res.ChunkEdges == nil {
		t.Errorf("result slices must be non-nil")
	}
}
