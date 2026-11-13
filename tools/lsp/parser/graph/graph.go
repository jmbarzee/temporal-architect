// Package graph builds the resolved deployment graph from a parsed +
// resolved AST. Nodes are runtime instances (a definition × deployment
// context); edges are confirmed dispatches. The construction follows
// the contract in README.md.
//
// In-process consumers (validator, LSP server, future codegen) call
// Extract directly. The twf CLI's `graph` command wraps the result in
// the standard JSON envelope.
package graph

import (
	"fmt"
	"sort"
	"strings"

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
// single source of truth — and is NOT duplicated on worker / workflow /
// activity nodes. The endpoint↔operation routing relationship is
// likewise expressed by an edge (the nexusRoute edge), not by matching
// node fields downstream. Consequently nexusEndpoint and nexusOperation
// nodes no longer carry Namespace (it's the containment parent).
//
// nexusService still carries Worker/Namespace (it is not part of this
// normalization step). Queue has no edge equivalent and is intrinsic to
// a deployment, so it is retained on worker and on the nexus tier
// (endpoint / service / operation) — but purely as display metadata;
// nothing downstream derives structure from it.
type Node struct {
	ID         string `json:"id"`
	Definition string `json:"definition"`
	// Name is the definition's bare name: "Setup"; "PaymentService.Charge" for
	// an operation; a worker's, namespace's or endpoint's own name.
	Name string `json:"name"`
	// PackageID is the definition's package identity, a key into the graph's
	// packages table. Absent for the default package and for worker, namespace
	// and endpoint nodes.
	PackageID string `json:"packageId,omitempty"`
	// Worker is populated on nexusService / nexusOperation nodes;
	// Namespace only on nexusService. Both empty elsewhere — read the
	// containment edges for membership.
	Worker    string `json:"worker,omitempty"`
	Namespace string `json:"namespace,omitempty"`
	// Queue is the task queue name; intrinsic to worker and nexus-tier
	// deployments. Display metadata only — not a structural input.
	Queue string `json:"queue,omitempty"`
	// TemplateParams is populated on a parameterized family's node: on a
	// namespace or nexusEndpoint node, the {param} template parameters in its
	// deploy_name (e.g. `fabric-shard-{org}` → ["org"]); on a worker node, the
	// instance parameters in its task_queue (`"sandbox-{sandboxId}"` →
	// ["sandboxId"]), unioned over its instantiations in the namespace. Distinct,
	// in order of first appearance. Empty/omitted for a static node, so a graph
	// with no templated families is byte-identical. A consumer reads it to
	// collapse a parameterized family into one representative node plus a
	// cardinality badge.
	TemplateParams []string `json:"templateParams,omitempty"`
	// SDKs are the implementations of the worker a node deploys on, from its
	// `@sdk` annotations: set on a worker node and on each node it hosts.
	// Omitted when the worker has none, and on an orphan definition.
	SDKs   []ast.SDKJSON `json:"sdks,omitempty"`
	Orphan bool          `json:"orphan,omitempty"`
}

// Routing is the diagnostic cause of a dispatch edge. The effect (which
// deployment got the call) is encoded by the edge's To node and its
// queue field; Routing answers "why was this edge drawn".
//
// Only present on dispatch edges. Containment edges omit it entirely.
type Routing struct {
	// Explicit is the task_queue literal the user wrote for the call: on the
	// call site, else on the target's default_options. Empty when implicit.
	Explicit      string `json:"explicit,omitempty"`
	NexusEndpoint string `json:"nexusEndpoint,omitempty"`
}

// isEmpty reports whether the routing block carries no information.
// An empty routing block is still serialized as `{}` for dispatch edges
// (per README.md § "Edge field semantics" — present-but-empty signals
// "implicit, no override"), while containment edges omit it entirely via
// the pointer being nil.
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
	// EdgeNexusRoute is the structural composition edge from a nexus
	// operation deployment to each endpoint deployment that fronts it
	// (matched on namespace + queue). It is topology, not an observed
	// dispatch, so it carries no Routing and is excluded from
	// coarsening.
	EdgeNexusRoute = "nexusRoute"
)

// Edge is a single edge in the graph. Dispatch edges (activityCall /
// workflowCall / nexusCall / asyncBacking) carry Routing; containment
// and nexusRoute edges omit it.
type Edge struct {
	From    string   `json:"from"`
	To      string   `json:"to"`
	Kind    string   `json:"kind"`
	Site    ast.Site `json:"site,omitzero"`
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
// entry exists so consumers can surface broken references. Reason is
// empty for a broken reference and UnresolvedExternal for one carried
// unchecked through an import of a package absent from the tree.
type Unresolved struct {
	From   string   `json:"from"`
	Name   string   `json:"name"`
	Kind   string   `json:"kind"`
	Site   ast.Site `json:"site,omitzero"`
	Reason string   `json:"reason,omitempty"`
}

// Unresolved reasons.
const (
	UnresolvedExternal = "external"
)

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
	Severity string   `json:"severity"`
	Code     string   `json:"code"`
	Message  string   `json:"message"`
	From     string   `json:"from,omitempty"`
	Site     ast.Site `json:"site,omitzero"`
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
	// Packages maps each kept package's identity to its declared name; absent
	// for an unpackaged design.
	Packages map[string]ast.PackageRef `json:"packages,omitempty"`

	// addedEdges and addedUnres are what addEdge and addUnresolved have added.
	addedEdges map[edgeKey]bool
	addedUnres map[Unresolved]bool
}

// edgeKey is an Edge by value, its Routing dereferenced.
type edgeKey struct {
	From, To, Kind string
	Site           ast.Site
	Routing        Routing
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

// Node kind constants. Values mirror the definition-key prefixes in the
// wire format. Exported so external builders (e.g. the history importer)
// can produce byte-identical node IDs without duplicating these strings.
const (
	KindNamespace      = "namespace"
	KindWorker         = "worker"
	KindWorkflow       = "workflow"
	KindActivity       = "activity"
	KindNexusService   = "nexusService"
	KindNexusOperation = "nexusOperation"
	KindNexusEndpoint  = "nexusEndpoint"
)

const orphanSuffix = "/orphan"

// DefKey returns the definition key for a node kind and name,
// e.g. DefKey("workflow", "OrderWorkflow") → "workflow:OrderWorkflow".
func DefKey(kind, name string) string {
	return kind + ":" + name
}

// NamespaceID returns the canonical node ID for a namespace deployment.
func NamespaceID(name string) string {
	return DefKey(KindNamespace, name)
}

// WorkerID returns the canonical node ID for a worker deployment.
// An empty namespace produces an orphan ID.
func WorkerID(name, namespace string) string {
	if namespace == "" {
		return DefKey(KindWorker, name) + orphanSuffix
	}
	return DefKey(KindWorker, name) + "/" + NamespaceID(namespace)
}

// EndpointID returns the canonical node ID for a nexus endpoint deployment.
func EndpointID(name, namespace string) string {
	return DefKey(KindNexusEndpoint, name) + "/" + NamespaceID(namespace)
}

// HostedID builds the ID for a definition hosted on a specific worker
// deployment. orphan=true is used when the definition exists but isn't
// registered on any instantiated worker.
func HostedID(kind, name, worker, namespace string, orphan bool) string {
	base := DefKey(kind, name)
	if orphan {
		return base + orphanSuffix
	}
	return base + "/" + DefKey(KindWorker, worker) + "/" + NamespaceID(namespace)
}

// NexusOpQualifiedName joins service and operation names into the
// definition-key suffix used for nexus operations
// (`nexusOperation:PaymentService.CheckPaymentStatus`).
func NexusOpQualifiedName(service, op string) string {
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
	g.Packages = ast.PackageRefs(file)

	// Order matters: nodes must exist before edges can reference them by
	// ID, and containment edges depend on the node set.
	g.enumerateNodes(idx)
	g.emitContainment(idx)
	g.emitDispatchEdges(idx)
	g.emitNexusRoutes(idx)
	g.emitCoarsenedEdges()

	g.finalize()
	sortDiagnostics(g.Diagnostics, file)
	return g
}

// sortDiagnostics orders diagnostics by their file's position in the merged
// definitions, then site, code and message, so the order does not follow map
// iteration.
func sortDiagnostics(diags []Diagnostic, file *ast.File) {
	pos := map[string]int{}
	for _, def := range file.Definitions {
		if f := ast.SourceFileOf(def); f != "" {
			if _, ok := pos[f]; !ok {
				pos[f] = len(pos)
			}
		}
	}
	sort.SliceStable(diags, func(i, j int) bool {
		a, b := diags[i], diags[j]
		if pa, pb := pos[a.Site.File], pos[b.Site.File]; pa != pb {
			return pa < pb
		}
		if c := a.Site.Compare(b.Site); c != 0 {
			return c < 0
		}
		if a.Code != b.Code {
			return a.Code < b.Code
		}
		return a.Message < b.Message
	})
}

func newGraph() *Graph {
	return &Graph{
		Nodes:          []Node{},
		Edges:          []Edge{},
		CoarsenedEdges: []CoarsenedEdge{},
		Unresolved:     []Unresolved{},
		Diagnostics:    []Diagnostic{},
		addedEdges:     map[edgeKey]bool{},
		addedUnres:     map[Unresolved]bool{},
	}
}

// Finalize runs coarsening and stabilizes the graph for serialization.
// Called by external builders (e.g. the history importer) that construct
// a Graph directly without going through Extract.
func Finalize(g *Graph) {
	g.emitCoarsenedEdges()
	g.finalize()
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
		return g.Edges[i].Site.Compare(g.Edges[j].Site) < 0
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
		return g.Unresolved[i].Site.Compare(g.Unresolved[j].Site) < 0
	})
	sort.SliceStable(g.Diagnostics, func(i, j int) bool {
		if g.Diagnostics[i].From != g.Diagnostics[j].From {
			return g.Diagnostics[i].From < g.Diagnostics[j].From
		}
		if g.Diagnostics[i].Code != g.Diagnostics[j].Code {
			return g.Diagnostics[i].Code < g.Diagnostics[j].Code
		}
		return g.Diagnostics[i].Site.Compare(g.Diagnostics[j].Site) < 0
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

func (g *Graph) hasNode(id string) bool { return g.node(id) != nil }

// node returns the node with the given ID, or nil.
func (g *Graph) node(id string) *Node {
	for i := range g.Nodes {
		if g.Nodes[i].ID == id {
			return &g.Nodes[i]
		}
	}
	return nil
}

// addEdge adds a dispatch or nexusRoute edge once. Those walks run once per
// worker deployment, and a worker instantiated twice in one namespace is one
// node, so both instantiations reaching one callee by one call is one edge.
func (g *Graph) addEdge(e Edge) {
	k := edgeKey{From: e.From, To: e.To, Kind: e.Kind, Site: e.Site}
	if e.Routing != nil {
		k.Routing = *e.Routing
	}
	if g.addedEdges[k] {
		return
	}
	g.addedEdges[k] = true
	g.Edges = append(g.Edges, e)
}

// addUnresolved adds an unresolved entry once, as addEdge adds an edge.
func (g *Graph) addUnresolved(u Unresolved) {
	if g.addedUnres[u] {
		return
	}
	g.addedUnres[u] = true
	g.Unresolved = append(g.Unresolved, u)
}

// addDiagnostic deduplicates by (code, from, site) — the same
// implicit-routing problem at one call site walked twice (once per
// caller-deployment copy) shouldn't surface twice.
func (g *Graph) addDiagnostic(d Diagnostic) {
	for _, existing := range g.Diagnostics {
		if existing.Code == d.Code && existing.From == d.From && existing.Site == d.Site {
			return
		}
	}
	g.Diagnostics = append(g.Diagnostics, d)
}

// calleeLabel names a dispatch target in a message by its label (ast.Label),
// never by its qualified name, which carries the package identity.
func (g *Graph) calleeLabel(idx *astIndex, kind, qname string) string {
	switch kind {
	case KindWorkflow:
		if d := idx.workflows[qname]; d != nil {
			return ast.Label(g.Packages, ast.PackageIDOf(d, idx.file), d.Name)
		}
	case KindActivity:
		if d := idx.activities[qname]; d != nil {
			return ast.Label(g.Packages, ast.PackageIDOf(d, idx.file), d.Name)
		}
	case KindNexusOperation:
		// The operation's service is the longest qualified name qname extends at
		// a separator: `p.S.Op` belongs to `p.S`, not to a service `p`.
		var svc *ast.NexusServiceDef
		var op string
		for svcQName, s := range idx.nexusServices {
			if rest, ok := strings.CutPrefix(qname, svcQName+"."); ok && (svc == nil || len(rest) < len(op)) {
				svc, op = s, rest
			}
		}
		if svc != nil {
			return ast.Label(g.Packages, ast.PackageIDOf(svc, idx.file), NexusOpQualifiedName(svc.Name, op))
		}
	}
	return qname
}

func warningDispatchNoReachable(from, calleeKind, calleeName, namespace, queue string, site ast.Site) Diagnostic {
	return Diagnostic{
		Severity: SeverityWarning,
		Code:     DiagDispatchNoReachableDeployment,
		Message:  fmt.Sprintf("%s call to %q routes to task_queue %q in namespace %s but no deployment polls it there", calleeKind, calleeName, queue, namespace),
		From:     from,
		Site:     site,
	}
}
