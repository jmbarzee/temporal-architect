// Package history builds an observe.ObservedGraph from Temporal workflow
// history, producing the deployment-graph shape without any .twf source or AST.
// It owns the go.temporal.io dependency for the toolchain: the parser is
// Temporal-free, and this history→graph extraction lives here in the sampler.
//
// The entry point is Build. LoadFile parses a single history JSON file (the
// `temporal workflow show -o json` shape) for tests and offline use.
package history

import (
	"cmp"
	"fmt"
	"maps"
	"os"
	"slices"
	"sort"
	"strings"
	"time"

	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	"go.temporal.io/api/temporalproto"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
	"github.com/jmbarzee/temporal-architect/tools/sampler/design"
)

const (
	// diagSignalTargetAmbiguous is the code for a signal whose target workflow ID
	// fits the id_schemes of several workflows, so it has no one type.
	diagSignalTargetAmbiguous = "SIGNAL_TARGET_AMBIGUOUS"
	// diagFamilyAmbiguous is the code for an observed namespace or task queue
	// that fits several of the design's families, so it has no one family.
	diagFamilyAmbiguous = "FAMILY_AMBIGUOUS"
	// diagFamilyMembers is the code, a hint, for a design family with observed
	// members: it counts them.
	diagFamilyMembers = "FAMILY_MEMBERS"
)

// History is one workflow run's event log. (WorkflowID, RunID) identifies the
// run: continue-as-new chains several runs under one WorkflowID, and each is its
// own History. Namespace, when non-empty, overrides Options.Namespace for this
// specific history; used to set the namespace from the sampled execution's
// origin.
type History struct {
	WorkflowID string
	RunID      string
	Namespace  string
	Events     []*historypb.HistoryEvent
}

// Options carries per-Build metadata shared across all histories. Namespace is
// the fallback used when a History's own Namespace is empty (the
// WORKFLOW_EXECUTION_STARTED event does not carry it). Window lays out the
// per-edge occurrence time series; a zero Window means a single bucket. Design,
// when set, joins each sampled definition to its package and each sampled
// namespace and task queue to the design's family it fits, so their node IDs are
// the design graph's; without one every name stays concrete and bare.
type Options struct {
	Namespace string
	Window    observe.Window
	Design    *design.Design
}

// LoadFile reads and parses a single Temporal history JSON file (the format
// produced by `temporal workflow show -o json`). workflowID and runID are the
// run's identity.
func LoadFile(path, workflowID, runID string) (History, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return History{}, err
	}
	var h historypb.History
	opts := temporalproto.CustomJSONUnmarshalOptions{DiscardUnknown: true}
	if err := opts.Unmarshal(data, &h); err != nil {
		return History{}, err
	}
	return History{WorkflowID: workflowID, RunID: runID, Events: h.Events}, nil
}

// Build folds a set of workflow histories into an observe.ObservedGraph using
// the same node-ID scheme as graph.Extract, so the output is compatible with
// the visualizer's Graph tab without any .twf source. Every run of a
// continue-as-new chain is folded into the same graph. Each observed dispatch
// increments the occurrence bucket its event time falls in.
//
// The algorithm is a deterministic multi-pass fold:
//  1. Pass 1 — index: extract workflow type, task queue, and namespace from each
//     run's WORKFLOW_EXECUTION_STARTED event; index them by (workflowID, runID)
//     for cross-history signal-target resolution.
//  2. Synthesize workers: one worker node per distinct (namespace, taskQueue)
//     pair, worker name = queue name.
//  3. Hosted nodes: emit workflow/activity nodes + containment edges.
//  4. Dispatch edges: activityCall, workflowCall, signalSend, bucketed by event
//     time.
//  5. Finalize: coarsen + sort for byte-identical output.
func Build(histories []History, opts Options) *observe.ObservedGraph {
	sorted := make([]History, len(histories))
	copy(sorted, histories)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].WorkflowID != sorted[j].WorkflowID {
			return sorted[i].WorkflowID < sorted[j].WorkflowID
		}
		return sorted[i].RunID < sorted[j].RunID
	})

	win := parseWindow(opts.Window)
	b := &builder{
		namespace: opts.Namespace,
		design:    opts.Design,
		win:       win,
		og:        observe.New(),
		nodesSeen: map[string]struct{}{},
		edgeIdx:   map[edgeKey]int{},
		nsNodes:   map[string]graph.Node{},
		places:    map[[2]string]placement{},
		families:  map[string]*family{},
	}
	b.og.Window = observe.Window{Since: opts.Window.Since, Until: opts.Window.Until, Buckets: win.n}
	if opts.Design != nil {
		b.og.Packages = opts.Design.Graph.Packages
	}

	b.index = buildIndex(sorted, opts.Namespace)
	for _, h := range sorted {
		b.processHistory(h)
	}
	b.reportFamilyMembers()

	observe.Finalize(b.og)
	return b.og
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type startInfo struct {
	workflowType string
	taskQueue    string
	namespace    string
	started      time.Time
}

type runKey struct {
	workflowID, runID string
}

// runIndex resolves a signal target. A signal names a workflow ID and, when the
// sender knew it, a run ID; without one it reaches the workflow's current run,
// approximated by the latest sampled run to have started.
type runIndex struct {
	byRun  map[runKey]startInfo
	latest map[string]startInfo
}

func (ix runIndex) resolve(workflowID, runID string) (startInfo, bool) {
	if runID != "" {
		if info, ok := ix.byRun[runKey{workflowID, runID}]; ok {
			return info, true
		}
	}
	info, ok := ix.latest[workflowID]
	return info, ok
}

type edgeKey struct {
	from, to, kind string
}

type builder struct {
	namespace string
	design    *design.Design
	win       pwindow
	og        *observe.ObservedGraph
	index     runIndex
	nodesSeen map[string]struct{}
	edgeIdx   map[edgeKey]int // edgeKey → index into og.Edges

	nsNodes  map[string]graph.Node   // observed namespace → the node it lands on
	places   map[[2]string]placement // observed (namespace, queue) → its nodes
	families map[string]*family      // design family node ID → its observed members
}

// family is a design family's label and the observed names that fit it.
type family struct {
	label   string
	members map[string]struct{}
}

// ---------------------------------------------------------------------------
// Time-bucketing
// ---------------------------------------------------------------------------

// pwindow is the parsed, ready-to-use form of observe.Window. n is always >= 1;
// timed is true only when n > 1 and Since/Until parsed to a positive span, in
// which case width is one bucket's duration.
type pwindow struct {
	n     int
	since time.Time
	width time.Duration
	timed bool
}

func parseWindow(w observe.Window) pwindow {
	n := w.Buckets
	if n < 1 {
		n = 1
	}
	pw := pwindow{n: n}
	if n <= 1 {
		return pw
	}
	since, err1 := time.Parse(time.RFC3339, w.Since)
	until, err2 := time.Parse(time.RFC3339, w.Until)
	if err1 == nil && err2 == nil && until.After(since) {
		pw.since = since
		pw.width = until.Sub(since) / time.Duration(n)
		pw.timed = pw.width > 0
	}
	return pw
}

// index maps an event time to its bucket. With a single bucket (or no valid
// time window) everything lands in bucket 0. Events before the epoch clamp to
// the first bucket; events at or after the end clamp to the last.
func (pw pwindow) index(t time.Time) int {
	if !pw.timed {
		return 0
	}
	if t.Before(pw.since) {
		return 0
	}
	i := int(t.Sub(pw.since) / pw.width)
	if i < 0 {
		return 0
	}
	if i >= pw.n {
		return pw.n - 1
	}
	return i
}

// ---------------------------------------------------------------------------
// Pass 1 — index
// ---------------------------------------------------------------------------

// startOf reads a run's identity from its WORKFLOW_EXECUTION_STARTED event.
// ok is false for a history without a usable one.
func startOf(h History, fallbackNS string) (info startInfo, ok bool) {
	for _, e := range h.Events {
		if e.EventType != enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED {
			continue
		}
		attr := e.GetWorkflowExecutionStartedEventAttributes()
		if attr == nil {
			return startInfo{}, false
		}
		ns := h.Namespace
		if ns == "" {
			ns = fallbackNS
		}
		info = startInfo{
			workflowType: attr.GetWorkflowType().GetName(),
			taskQueue:    attr.GetTaskQueue().GetName(),
			namespace:    ns,
			started:      eventTime(e),
		}
		return info, info.workflowType != "" && info.taskQueue != ""
	}
	return startInfo{}, false
}

func buildIndex(histories []History, fallbackNS string) runIndex {
	ix := runIndex{
		byRun:  make(map[runKey]startInfo, len(histories)),
		latest: make(map[string]startInfo, len(histories)),
	}
	for _, h := range histories {
		info, ok := startOf(h, fallbackNS)
		if !ok {
			continue
		}
		ix.byRun[runKey{h.WorkflowID, h.RunID}] = info
		if prev, seen := ix.latest[h.WorkflowID]; !seen || info.started.After(prev.started) {
			ix.latest[h.WorkflowID] = info
		}
	}
	return ix
}

// ---------------------------------------------------------------------------
// Per-history processing
// ---------------------------------------------------------------------------

func (b *builder) processHistory(h History) {
	root, ok := startOf(h, b.namespace)
	if !ok {
		return
	}

	b.ensureWorkerAndNamespace(root.namespace, root.taskQueue)
	rootNodeID := b.ensureHosted(graph.KindWorkflow, root.workflowType, root.namespace, root.taskQueue)

	for _, e := range h.Events {
		switch e.EventType {
		case enumspb.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED:
			b.handleActivityScheduled(e, rootNodeID, root)
		case enumspb.EVENT_TYPE_START_CHILD_WORKFLOW_EXECUTION_INITIATED:
			b.handleChildInitiated(e, rootNodeID, root)
		case enumspb.EVENT_TYPE_SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED:
			b.handleSignalInitiated(e, rootNodeID, root)
		}
	}
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

func (b *builder) handleActivityScheduled(e *historypb.HistoryEvent, callerID string, caller startInfo) {
	attr := e.GetActivityTaskScheduledEventAttributes()
	if attr == nil {
		return
	}
	actType := attr.GetActivityType().GetName()
	queue := attr.GetTaskQueue().GetName()
	if actType == "" || queue == "" {
		return
	}
	b.ensureWorkerAndNamespace(caller.namespace, queue)
	calleeID := b.ensureHosted(graph.KindActivity, actType, caller.namespace, queue)
	b.addDispatch(callerID, calleeID, graph.EdgeActivityCall, eventTime(e))
}

func (b *builder) handleChildInitiated(e *historypb.HistoryEvent, callerID string, caller startInfo) {
	attr := e.GetStartChildWorkflowExecutionInitiatedEventAttributes()
	if attr == nil {
		return
	}
	childType := attr.GetWorkflowType().GetName()
	queue := attr.GetTaskQueue().GetName()
	if childType == "" || queue == "" {
		return
	}
	childNS := attr.GetNamespace()
	if childNS == "" {
		childNS = caller.namespace
	}
	b.ensureWorkerAndNamespace(childNS, queue)
	calleeID := b.ensureHosted(graph.KindWorkflow, childType, childNS, queue)
	b.addDispatch(callerID, calleeID, graph.EdgeWorkflowCall, eventTime(e))
}

func (b *builder) handleSignalInitiated(e *historypb.HistoryEvent, callerID string, caller startInfo) {
	attr := e.GetSignalExternalWorkflowExecutionInitiatedEventAttributes()
	if attr == nil {
		return
	}
	target := attr.GetWorkflowExecution()
	targetWFID := target.GetWorkflowId()
	if targetWFID == "" {
		return
	}
	info, ok := b.index.resolve(targetWFID, target.GetRunId())
	if !ok {
		info, ok = b.schemeTarget(callerID, targetWFID, cmp.Or(attr.GetNamespace(), caller.namespace))
	}
	if !ok {
		b.og.Unresolved = append(b.og.Unresolved, graph.Unresolved{
			From: callerID,
			Name: targetWFID,
			Kind: graph.EdgeSignalSend,
		})
		return
	}
	b.ensureWorkerAndNamespace(info.namespace, info.taskQueue)
	calleeID := b.ensureHosted(graph.KindWorkflow, info.workflowType, info.namespace, info.taskQueue)
	b.addDispatch(callerID, calleeID, graph.EdgeSignalSend, eventTime(e))
}

// schemeTarget recovers the workflow an unsampled signal target is from the
// design's id_schemes: the one workflow whose scheme the ID fits. An ID that fits
// several resolves to none and is reported with them; one that fits none, or no
// design, resolves to none silently.
func (b *builder) schemeTarget(callerID, workflowID, namespace string) (startInfo, bool) {
	if b.design == nil {
		return startInfo{}, false
	}
	matches := b.design.MatchWorkflowID(workflowID, namespace)
	switch len(matches) {
	case 0:
		return startInfo{}, false
	case 1:
		m := matches[0]
		return startInfo{workflowType: m.Name, taskQueue: m.Queue, namespace: namespace}, true
	}
	labels := make([]string, len(matches))
	for i, m := range matches {
		labels[i] = ast.Label(b.design.Graph.Packages, m.Package, m.Name) + " on queue " + m.Queue
	}
	sort.Strings(labels)
	d := graph.Diagnostic{
		Severity: "warning",
		Code:     diagSignalTargetAmbiguous,
		Message:  fmt.Sprintf("workflow ID %q fits the id_schemes of %s", workflowID, strings.Join(labels, ", ")),
		From:     callerID,
	}
	if !slices.Contains(b.og.Diagnostics, d) { // one per sender and target ID, however many signals
		b.og.Diagnostics = append(b.og.Diagnostics, d)
	}
	return startInfo{}, false
}

func eventTime(e *historypb.HistoryEvent) time.Time {
	return e.GetEventTime().AsTime()
}

// ---------------------------------------------------------------------------
// Node / edge helpers
// ---------------------------------------------------------------------------

// placement is the namespace and worker nodes an observed namespace and task
// queue land on.
type placement struct {
	ns, worker graph.Node
}

// place returns the nodes an observed namespace and task queue land on. With a
// design, a name that fits one of its families lands on that family's node
// instead of a concrete one; a name that fits none stays concrete, and one that
// fits several stays concrete and is reported. A family's worker node is the
// design worker's, whose name cannot be its queue's.
func (b *builder) place(namespace, queue string) placement {
	key := [2]string{namespace, queue}
	if p, ok := b.places[key]; ok {
		return p
	}
	ns := b.namespaceNode(namespace)
	worker := graph.Node{ // worker name = queue name (1-worker-per-queue assumption)
		ID:         graph.WorkerID(queue, ns.Name),
		Definition: graph.DefKey(graph.KindWorker, queue),
		Name:       queue,
		Queue:      queue,
	}
	if b.design != nil {
		subject := fmt.Sprintf("task queue %q in namespace %q", queue, namespace)
		if f, ok := b.fit(worker, subject, b.design.MatchWorker(ns.Name, queue)); ok {
			member := queue
			if ns.Name != namespace { // the same queue name recurs across a namespace family
				member = namespace + "/" + queue
			}
			b.addMember(f, member)
			worker = f
		}
	}
	p := placement{ns, worker}
	b.places[key] = p
	return p
}

func (b *builder) namespaceNode(name string) graph.Node {
	if n, ok := b.nsNodes[name]; ok {
		return n
	}
	n := graph.Node{ID: graph.NamespaceID(name), Definition: graph.DefKey(graph.KindNamespace, name), Name: name}
	if b.design != nil {
		if f, ok := b.fit(n, fmt.Sprintf("namespace %q", name), b.design.MatchNamespace(name)); ok {
			b.addMember(f, name)
			n = f
		}
	}
	b.nsNodes[name] = n
	return n
}

// fit picks the one design family node an observed node fits, as the observed
// graph carries it (the design's SDKs are not observed). Several resolve to none
// and are reported with their labels, once per observed node.
func (b *builder) fit(observed graph.Node, subject string, fits []graph.Node) (graph.Node, bool) {
	switch len(fits) {
	case 0:
		return graph.Node{}, false
	case 1:
		f := fits[0]
		f.SDKs = nil
		return f, true
	}
	labels := make([]string, len(fits))
	for i, f := range fits {
		labels[i] = familyLabel(f)
	}
	sort.Strings(labels)
	b.og.Diagnostics = append(b.og.Diagnostics, graph.Diagnostic{
		Severity: "warning",
		Code:     diagFamilyAmbiguous,
		Message:  fmt.Sprintf("%s fits the families %s", subject, strings.Join(labels, ", ")),
		From:     observed.ID,
	})
	return graph.Node{}, false
}

func familyLabel(f graph.Node) string {
	if strings.HasPrefix(f.Definition, graph.KindWorker+":") {
		return fmt.Sprintf("worker %s on queue %s", f.Name, f.Queue)
	}
	return "namespace " + f.Name
}

func (b *builder) addMember(f graph.Node, member string) {
	fam := b.families[f.ID]
	if fam == nil {
		fam = &family{label: familyLabel(f), members: map[string]struct{}{}}
		b.families[f.ID] = fam
	}
	fam.members[member] = struct{}{}
}

// reportFamilyMembers counts each design family's observed members, as a hint
// on the family's node.
func (b *builder) reportFamilyMembers() {
	for _, id := range slices.Sorted(maps.Keys(b.families)) {
		fam := b.families[id]
		members := slices.Sorted(maps.Keys(fam.members))
		b.og.Diagnostics = append(b.og.Diagnostics, graph.Diagnostic{
			Severity: "hint",
			Code:     diagFamilyMembers,
			Message:  fmt.Sprintf("%s has %d observed members: %s", fam.label, len(members), strings.Join(members, ", ")),
			From:     id,
		})
	}
}

func (b *builder) ensureWorkerAndNamespace(namespace, queue string) {
	p := b.place(namespace, queue)
	if _, seen := b.nodesSeen[p.ns.ID]; !seen {
		b.og.Nodes = append(b.og.Nodes, p.ns)
		b.nodesSeen[p.ns.ID] = struct{}{}
	}
	if _, seen := b.nodesSeen[p.worker.ID]; !seen {
		b.og.Nodes = append(b.og.Nodes, p.worker)
		b.nodesSeen[p.worker.ID] = struct{}{}
		b.addContainment(p.worker.ID, p.ns.ID)
	}
}

// ensureHosted adds the node for a sampled definition. Its name is qualified by
// the design's package for it. With a design that has none (or several it cannot
// tell apart) the name stays bare, and the node is reported as unresolved.
func (b *builder) ensureHosted(kind, name, namespace, queue string) string {
	p := b.place(namespace, queue)
	pkg, known := "", true
	if b.design != nil {
		pkg, known = b.design.Package(kind, name, p.ns.Name, p.worker.Queue)
	}
	qname := ast.QualifiedName(pkg, name)
	nodeID := graph.HostedID(kind, qname, p.worker.Name, p.ns.Name, false)
	if _, seen := b.nodesSeen[nodeID]; !seen {
		b.og.Nodes = append(b.og.Nodes, graph.Node{
			ID:         nodeID,
			Definition: graph.DefKey(kind, qname),
			Name:       name,
			PackageID:  pkg,
		})
		b.nodesSeen[nodeID] = struct{}{}
		b.addContainment(nodeID, p.worker.ID)
		if !known {
			b.og.Unresolved = append(b.og.Unresolved, graph.Unresolved{From: nodeID, Name: name, Kind: kind})
		}
	}
	return nodeID
}

// addContainment records a structural child→parent edge with an all-zero
// occurrence series (containment is topology, not an observed dispatch).
func (b *builder) addContainment(from, to string) {
	k := edgeKey{from: from, to: to, kind: graph.EdgeContainment}
	if _, ok := b.edgeIdx[k]; ok {
		return
	}
	b.edgeIdx[k] = len(b.og.Edges)
	b.og.Edges = append(b.og.Edges, observe.ObservedEdge{
		Edge:    graph.Edge{From: from, To: to, Kind: graph.EdgeContainment},
		Buckets: make([]int, b.win.n),
	})
}

// addDispatch records a dispatch occurrence: it creates the edge on first sight
// (with an empty routing block and a zeroed series) and increments the bucket
// the event time falls in.
func (b *builder) addDispatch(from, to, kind string, t time.Time) {
	k := edgeKey{from: from, to: to, kind: kind}
	i, ok := b.edgeIdx[k]
	if !ok {
		i = len(b.og.Edges)
		b.edgeIdx[k] = i
		b.og.Edges = append(b.og.Edges, observe.ObservedEdge{
			Edge:    graph.Edge{From: from, To: to, Kind: kind, Routing: &graph.Routing{}},
			Buckets: make([]int, b.win.n),
		})
	}
	b.og.Edges[i].Buckets[b.win.index(t)]++
}
