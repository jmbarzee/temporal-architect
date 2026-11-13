// Package history builds an observe.ObservedGraph from Temporal workflow
// history, producing the deployment-graph shape without any .twf source or AST.
// It owns the go.temporal.io dependency for the toolchain: the parser is
// Temporal-free, and this history→graph extraction lives here in the sampler.
//
// The entry point is Build. LoadFile parses a single history JSON file (the
// `temporal workflow show -o json` shape) for tests and offline use.
package history

import (
	"os"
	"sort"
	"time"

	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	"go.temporal.io/api/temporalproto"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
	"github.com/jmbarzee/temporal-architect/tools/sampler/design"
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
// when set, joins each sampled definition to its package, so its node ID is the
// design graph's; without one every name stays bare.
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
	}
	b.og.Window = observe.Window{Since: opts.Window.Since, Until: opts.Window.Until, Buckets: win.n}
	if opts.Design != nil {
		b.og.Packages = opts.Design.Graph.Packages
	}

	b.index = buildIndex(sorted, opts.Namespace)
	for _, h := range sorted {
		b.processHistory(h)
	}

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

func eventTime(e *historypb.HistoryEvent) time.Time {
	return e.GetEventTime().AsTime()
}

// ---------------------------------------------------------------------------
// Node / edge helpers
// ---------------------------------------------------------------------------

func (b *builder) ensureWorkerAndNamespace(namespace, queue string) {
	// Neither node sets TemplateParams: observed names are resolved runtime
	// values (namespace fabric-shard-acme, queue sandbox-8f3a), never families
	// with template parameters, so there is nothing to extract. See README.md
	// "templateParams is always empty on observed nodes".
	nsID := graph.NamespaceID(namespace)
	if _, seen := b.nodesSeen[nsID]; !seen {
		b.og.Nodes = append(b.og.Nodes, graph.Node{
			ID:         nsID,
			Definition: graph.DefKey(graph.KindNamespace, namespace),
			Name:       namespace,
		})
		b.nodesSeen[nsID] = struct{}{}
	}

	wID := graph.WorkerID(queue, namespace)
	if _, seen := b.nodesSeen[wID]; !seen {
		b.og.Nodes = append(b.og.Nodes, graph.Node{
			ID:         wID,
			Definition: graph.DefKey(graph.KindWorker, queue),
			Name:       queue,
			Queue:      queue,
		})
		b.nodesSeen[wID] = struct{}{}
		b.addContainment(wID, nsID)
	}
}

// ensureHosted adds the node for a sampled definition. Its name is qualified by
// the design's package for it. With a design that has none (or several it cannot
// tell apart) the name stays bare, and the node is reported as unresolved.
func (b *builder) ensureHosted(kind, name, namespace, queue string) string {
	pkg, known := "", true
	if b.design != nil {
		pkg, known = b.design.Package(kind, name, namespace, queue)
	}
	// Worker name = queue name (1-worker-per-queue assumption).
	workerName := queue
	qname := ast.QualifiedName(pkg, name)
	nodeID := graph.HostedID(kind, qname, workerName, namespace, false)
	if _, seen := b.nodesSeen[nodeID]; !seen {
		b.og.Nodes = append(b.og.Nodes, graph.Node{
			ID:         nodeID,
			Definition: graph.DefKey(kind, qname),
			Name:       name,
			PackageID:  pkg,
		})
		b.nodesSeen[nodeID] = struct{}{}
		b.addContainment(nodeID, graph.WorkerID(workerName, namespace))
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
