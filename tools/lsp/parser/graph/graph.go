// Package graph builds the resolved deployment graph from a parsed +
// resolved AST. Nodes are runtime instances (a definition × deployment
// context); edges are confirmed dispatches. The construction follows
// the contract in internal/changes/parser/REVISIONS_003.md.
//
// In-process consumers (validator, LSP server, future codegen) call
// Extract directly. The twf CLI's `graph` command wraps the result in
// the standard JSON envelope.
package graph

import (
	"fmt"
	"sort"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// Summary is the top-level count of the extracted graph. Mirrors the
// shape consumers expect at the head of the JSON output.
type Summary struct {
	Nodes          int `json:"nodes"`
	Edges          int `json:"edges"`
	CoarsenedEdges int `json:"coarsenedEdges"`
	Unresolved     int `json:"unresolved"`
	Diagnostics    int `json:"diagnostics"`
}

// Node is one deployment in the resolved graph. Identity is composite
// (definition × deployment context), encoded into ID. Definition is
// always present and points back to the AST entry that produced this
// node.
//
// Worker/namespace membership is expressed by containment edges — the
// single source of truth — and is NOT duplicated on worker /
// workflow / activity nodes. The nexus tier
// (nexusService / nexusOperation / nexusEndpoint) still carries these
// fields pending nexus normalization (tracked in the Reverse-History
// Backlog). Queue has no edge equivalent and is intrinsic to a
// deployment, so it is retained on worker and nexusEndpoint nodes (and
// the nexus tier).
type Node struct {
	ID         string `json:"id"`
	Definition string `json:"definition"`
	// Worker/Namespace are populated only on nexus-tier nodes (deferred
	// normalization); empty elsewhere — read the containment edges.
	Worker    string `json:"worker,omitempty"`
	Namespace string `json:"namespace,omitempty"`
	// Queue is the task queue name; intrinsic to worker / nexusEndpoint
	// deployments (and retained on the nexus tier).
	Queue  string `json:"queue,omitempty"`
	Orphan bool   `json:"orphan,omitempty"`
}

// Routing is the diagnostic cause of a dispatch edge. The effect (which
// deployment got the call) is encoded by the edge's To node and its
// queue field; Routing answers "why was this edge drawn".
//
// Only present on dispatch edges. Containment edges omit it entirely.
type Routing struct {
	Explicit      string `json:"explicit,omitempty"`
	NexusEndpoint string `json:"nexusEndpoint,omitempty"`
}

// isEmpty reports whether the routing block carries no information.
// An empty routing block is still serialized as `{}` for dispatch edges
// (per REVISIONS_003 — present-but-empty signals "implicit, no override"),
// while containment edges omit it entirely via the pointer being nil.
func (r Routing) isEmpty() bool {
	return r.Explicit == "" && r.NexusEndpoint == ""
}

// Edge kind constants. Values mirror the JSON enum in the spec.
const (
	EdgeContainment  = "containment"
	EdgeActivityCall = "activityCall"
	EdgeWorkflowCall = "workflowCall"
	EdgeNexusCall    = "nexusCall"
	EdgeAsyncBacking = "asyncBacking"
	EdgeSignalSend   = "signalSend"
)

// Edge is a single edge in the graph. Dispatch edges (activityCall /
// workflowCall / nexusCall / asyncBacking) carry Routing; containment
// edges omit it.
type Edge struct {
	From    string   `json:"from"`
	To      string   `json:"to"`
	Kind    string   `json:"kind"`
	Line    int      `json:"line"`
	Routing *Routing `json:"routing,omitempty"`
}

// Coarsening tiers.
const (
	TierWorker    = "worker"
	TierNamespace = "namespace"
)

// CoarsenedEdge is a dispatch edge projected to a higher containment
// tier (worker → worker, or namespace → namespace), aggregated by
// (from, to, tier).
type CoarsenedEdge struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Tier   string `json:"tier"`
	Weight int    `json:"weight"`
}

// Unresolved records a call site whose callee couldn't be resolved by
// the resolver (e.g. typo in activity name). No edge is emitted; the
// entry exists so consumers can surface broken references.
type Unresolved struct {
	From string `json:"from"`
	Name string `json:"name"`
	Kind string `json:"kind"`
	Line int    `json:"line"`
}

// Diagnostic codes emitted by the graph stage. They sit alongside
// parse/resolve/validate diagnostics in the CLI envelope.
const (
	DiagDispatchNoReachableDeployment = "DISPATCH_NO_REACHABLE_DEPLOYMENT"
)

// Diagnostic severities.
const (
	SeverityError   = "error"
	SeverityWarning = "warning"
)

// Diagnostic is a graph-stage diagnostic. Severity is "warning" for the
// resolved-but-undeployed cases; the CLI envelope is responsible for
// mapping these into its unified diagnostic shape if it wants to merge
// them with parser/resolver/validator diagnostics.
type Diagnostic struct {
	Severity string `json:"severity"`
	Code     string `json:"code"`
	Message  string `json:"message"`
	From     string `json:"from,omitempty"`
	Line     int    `json:"line"`
}

// Graph is the full extracted output. JSON arrays are always non-nil so
// the wire shape is `[]` rather than `null` on empty graphs.
type Graph struct {
	Summary        Summary         `json:"summary"`
	Nodes          []Node          `json:"nodes"`
	Edges          []Edge          `json:"edges"`
	CoarsenedEdges []CoarsenedEdge `json:"coarsenedEdges"`
	Unresolved     []Unresolved    `json:"unresolved"`
	Diagnostics    []Diagnostic    `json:"diagnostics"`
}

// ---------------------------------------------------------------------------
// Node ID construction
// ---------------------------------------------------------------------------
//
// IDs are composite path-style strings using `/` as separator. The
// leftmost segment is the definition key (`workflow:Foo`, `worker:bar`,
// …); subsequent segments are deployment context. Orphan nodes carry an
// explicit `/orphan` suffix so the orphan state is readable from the ID
// alone — useful when an ID appears in an error message or persisted
// reference without the surrounding Node struct.
//
// Definition keys (the AST anchors) are the leftmost segment alone, e.g.
// `workflow:OrderWorkflow`. They match the form already used internally
// by the visualizer's `definitionKey`.

const (
	kindNamespace      = "namespace"
	kindWorker         = "worker"
	kindWorkflow       = "workflow"
	kindActivity       = "activity"
	kindNexusService   = "nexusService"
	kindNexusOperation = "nexusOperation"
	kindNexusEndpoint  = "nexusEndpoint"
)

const orphanSuffix = "/orphan"

func defKey(kind, name string) string {
	return kind + ":" + name
}

func namespaceID(name string) string {
	return defKey(kindNamespace, name)
}

func workerID(name, namespace string) string {
	if namespace == "" {
		return defKey(kindWorker, name) + orphanSuffix
	}
	return defKey(kindWorker, name) + "/" + namespaceID(namespace)
}

func endpointID(name, namespace string) string {
	return defKey(kindNexusEndpoint, name) + "/" + namespaceID(namespace)
}

// hostedID builds the ID for a definition hosted on a specific worker
// deployment. orphan=true is used when the definition exists but isn't
// registered on any instantiated worker.
func hostedID(kind, name, worker, namespace string, orphan bool) string {
	base := defKey(kind, name)
	if orphan {
		return base + orphanSuffix
	}
	return base + "/" + defKey(kindWorker, worker) + "/" + namespaceID(namespace)
}

// nexusOpQualifiedName joins service and operation names into the
// definition-key suffix used for nexus operations
// (`nexusOperation:PaymentService.CheckPaymentStatus`).
func nexusOpQualifiedName(service, op string) string {
	return service + "." + op
}

// ---------------------------------------------------------------------------
// Extract
// ---------------------------------------------------------------------------

// Extract builds the resolved deployment graph from a parsed +
// resolved AST. The caller is expected to have already run
// resolver.Resolve; references on call sites are read through their
// `Resolved` fields, and endpoint→namespace bindings are read from the
// resolver-populated `NamespaceEndpoint.Namespace` field.
func Extract(file *ast.File) *Graph {
	g := newGraph()
	if file == nil {
		return g
	}

	idx := indexAST(file)

	// Order matters: nodes must exist before edges can reference them by
	// ID, and containment edges depend on the node set.
	g.enumerateNodes(idx)
	g.emitContainment(idx)
	g.emitDispatchEdges(idx)
	g.emitCoarsenedEdges()

	g.finalize()
	return g
}

func newGraph() *Graph {
	return &Graph{
		Nodes:          []Node{},
		Edges:          []Edge{},
		CoarsenedEdges: []CoarsenedEdge{},
		Unresolved:     []Unresolved{},
		Diagnostics:    []Diagnostic{},
	}
}

// finalize populates the summary and produces a stable ordering of all
// output slices so successive runs against the same AST produce
// byte-identical JSON.
func (g *Graph) finalize() {
	sort.SliceStable(g.Nodes, func(i, j int) bool { return g.Nodes[i].ID < g.Nodes[j].ID })
	sort.SliceStable(g.Edges, func(i, j int) bool {
		if g.Edges[i].From != g.Edges[j].From {
			return g.Edges[i].From < g.Edges[j].From
		}
		if g.Edges[i].To != g.Edges[j].To {
			return g.Edges[i].To < g.Edges[j].To
		}
		if g.Edges[i].Kind != g.Edges[j].Kind {
			return g.Edges[i].Kind < g.Edges[j].Kind
		}
		return g.Edges[i].Line < g.Edges[j].Line
	})
	sort.SliceStable(g.CoarsenedEdges, func(i, j int) bool {
		if g.CoarsenedEdges[i].Tier != g.CoarsenedEdges[j].Tier {
			return g.CoarsenedEdges[i].Tier < g.CoarsenedEdges[j].Tier
		}
		if g.CoarsenedEdges[i].From != g.CoarsenedEdges[j].From {
			return g.CoarsenedEdges[i].From < g.CoarsenedEdges[j].From
		}
		return g.CoarsenedEdges[i].To < g.CoarsenedEdges[j].To
	})
	sort.SliceStable(g.Unresolved, func(i, j int) bool {
		if g.Unresolved[i].From != g.Unresolved[j].From {
			return g.Unresolved[i].From < g.Unresolved[j].From
		}
		if g.Unresolved[i].Name != g.Unresolved[j].Name {
			return g.Unresolved[i].Name < g.Unresolved[j].Name
		}
		return g.Unresolved[i].Line < g.Unresolved[j].Line
	})
	sort.SliceStable(g.Diagnostics, func(i, j int) bool {
		if g.Diagnostics[i].From != g.Diagnostics[j].From {
			return g.Diagnostics[i].From < g.Diagnostics[j].From
		}
		if g.Diagnostics[i].Code != g.Diagnostics[j].Code {
			return g.Diagnostics[i].Code < g.Diagnostics[j].Code
		}
		return g.Diagnostics[i].Line < g.Diagnostics[j].Line
	})

	g.Summary = Summary{
		Nodes:          len(g.Nodes),
		Edges:          len(g.Edges),
		CoarsenedEdges: len(g.CoarsenedEdges),
		Unresolved:     len(g.Unresolved),
		Diagnostics:    len(g.Diagnostics),
	}
}

// addNode inserts a deployment node, suppressing duplicates by ID. The
// same definition appearing under two namespace instantiations
// legitimately produces two distinct IDs and is not a duplicate.
func (g *Graph) addNode(n Node) {
	if g.hasNode(n.ID) {
		return
	}
	g.Nodes = append(g.Nodes, n)
}

func (g *Graph) hasNode(id string) bool {
	for i := range g.Nodes {
		if g.Nodes[i].ID == id {
			return true
		}
	}
	return false
}

// addDiagnostic deduplicates by (code, from, line) — the same
// implicit-routing problem at one call site walked twice (once per
// caller-deployment copy) shouldn't surface twice.
func (g *Graph) addDiagnostic(d Diagnostic) {
	for _, existing := range g.Diagnostics {
		if existing.Code == d.Code && existing.From == d.From && existing.Line == d.Line {
			return
		}
	}
	g.Diagnostics = append(g.Diagnostics, d)
}

func warningDispatchNoReachable(from, calleeKind, calleeName, queue string, line int) Diagnostic {
	return Diagnostic{
		Severity: SeverityWarning,
		Code:     DiagDispatchNoReachableDeployment,
		Message:  fmt.Sprintf("%s call to %q routes to task_queue %q but no deployment polls it", calleeKind, calleeName, queue),
		From:     from,
		Line:     line,
	}
}
