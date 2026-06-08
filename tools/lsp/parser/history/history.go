// Package history builds a resolved deployment graph from Temporal
// workflow-history JSON, producing the same graph.Graph wire shape as
// graph.Extract — without any .twf source or AST.
//
// The entry point is Build. Load history files with LoadFile.
package history

import (
	"os"
	"sort"

	historypb "go.temporal.io/api/history/v1"
	enumspb "go.temporal.io/api/enums/v1"
	"go.temporal.io/api/temporalproto"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// History is one workflow execution's event log. WorkflowID is the
// execution ID — needed for cross-batch signal-target resolution.
type History struct {
	WorkflowID string
	Events     []*historypb.HistoryEvent
}

// Context carries per-call metadata shared across all histories in one
// Build invocation. Namespace is required because the
// WORKFLOW_EXECUTION_STARTED event does not include it.
type Context struct {
	Namespace string
}

// LoadFile reads and parses a single Temporal history JSON file (the
// format produced by `temporal workflow show -o json`). workflowID is
// the execution identity — typically the file's stem from the sampler
// output folder.
func LoadFile(path, workflowID string) (History, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return History{}, err
	}
	var h historypb.History
	opts := temporalproto.CustomJSONUnmarshalOptions{DiscardUnknown: true}
	if err := opts.Unmarshal(data, &h); err != nil {
		return History{}, err
	}
	return History{WorkflowID: workflowID, Events: h.Events}, nil
}

// Build folds a set of workflow histories into a graph.Graph using the
// same node-ID scheme as graph.Extract, so the output is compatible with
// the visualizer's Graph tab without any .twf source.
//
// The algorithm is a deterministic multi-pass fold:
//  1. Pass 1 — index: extract workflow type, task queue, and namespace
//     from each history's WORKFLOW_EXECUTION_STARTED event; build a
//     workflowID → info map for cross-history signal-target resolution.
//  2. Synthesize workers: one worker node per distinct (namespace,
//     taskQueue) pair, worker name = queue name.
//  3. Hosted nodes: emit workflow/activity nodes + containment edges.
//  4. Dispatch edges: activityCall, workflowCall, signalSend.
//  5. Finalize: coarsen + sort for byte-identical output.
func Build(histories []History, ctx Context) *graph.Graph {
	// Sort input for determinism: same set regardless of call order.
	sorted := make([]History, len(histories))
	copy(sorted, histories)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].WorkflowID < sorted[j].WorkflowID
	})

	b := &builder{
		ctx:      ctx,
		g:        newEmptyGraph(),
		nodesSeen: map[string]struct{}{},
		edgesSeen: map[edgeKey]struct{}{},
	}

	// Pass 1 — build the wfID → startInfo index.
	b.index = buildIndex(sorted, ctx)

	// Pass 2-4 — emit nodes and edges.
	for _, h := range sorted {
		b.processHistory(h)
	}

	graph.Finalize(b.g)
	return b.g
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type startInfo struct {
	workflowType string
	taskQueue    string
	namespace    string
}

type edgeKey struct {
	from, to, kind string
}

type builder struct {
	ctx       Context
	g         *graph.Graph
	index     map[string]startInfo // workflowID → startInfo
	nodesSeen map[string]struct{}
	edgesSeen map[edgeKey]struct{}
}

// ---------------------------------------------------------------------------
// Pass 1 — index
// ---------------------------------------------------------------------------

func buildIndex(histories []History, ctx Context) map[string]startInfo {
	idx := make(map[string]startInfo, len(histories))
	for _, h := range histories {
		for _, e := range h.Events {
			if e.EventType != enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED {
				continue
			}
			attr := e.GetWorkflowExecutionStartedEventAttributes()
			if attr == nil {
				break
			}
			ns := ctx.Namespace
			if attr.ParentWorkflowNamespace != "" {
				// Only set if the event explicitly carries a namespace override.
				// For started events this field is the parent's namespace, not
				// the workflow's own. The workflow's namespace comes from ctx.
			}
			idx[h.WorkflowID] = startInfo{
				workflowType: attr.GetWorkflowType().GetName(),
				taskQueue:    attr.GetTaskQueue().GetName(),
				namespace:    ns,
			}
			break
		}
	}
	return idx
}

// ---------------------------------------------------------------------------
// Per-history processing
// ---------------------------------------------------------------------------

func (b *builder) processHistory(h History) {
	// Locate the root workflow's start event.
	var root startInfo
	found := false
	for _, e := range h.Events {
		if e.EventType != enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED {
			continue
		}
		attr := e.GetWorkflowExecutionStartedEventAttributes()
		if attr == nil {
			break
		}
		root = startInfo{
			workflowType: attr.GetWorkflowType().GetName(),
			taskQueue:    attr.GetTaskQueue().GetName(),
			namespace:    b.ctx.Namespace,
		}
		found = true
		break
	}
	if !found || root.workflowType == "" || root.taskQueue == "" {
		return
	}

	b.ensureWorkerAndNamespace(root.namespace, root.taskQueue)
	rootNodeID := b.ensureHosted(graph.KindWorkflow, root.workflowType, root.namespace, root.taskQueue)

	// Scan remaining events for dispatch.
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
	b.addEdge(graph.Edge{
		From:    callerID,
		To:      calleeID,
		Kind:    graph.EdgeActivityCall,
		Routing: &graph.Routing{},
	})
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
	// Child namespace: use the explicit value if set, otherwise inherit from ctx.
	childNS := attr.GetNamespace()
	if childNS == "" {
		childNS = caller.namespace
	}
	b.ensureWorkerAndNamespace(childNS, queue)
	calleeID := b.ensureHosted(graph.KindWorkflow, childType, childNS, queue)
	b.addEdge(graph.Edge{
		From:    callerID,
		To:      calleeID,
		Kind:    graph.EdgeWorkflowCall,
		Routing: &graph.Routing{},
	})
}

func (b *builder) handleSignalInitiated(e *historypb.HistoryEvent, callerID string, caller startInfo) {
	attr := e.GetSignalExternalWorkflowExecutionInitiatedEventAttributes()
	if attr == nil {
		return
	}
	targetWFID := attr.GetWorkflowExecution().GetWorkflowId()
	if targetWFID == "" {
		return
	}
	info, ok := b.index[targetWFID]
	if !ok {
		// Target not in sample — record as unresolved.
		b.g.Unresolved = append(b.g.Unresolved, graph.Unresolved{
			From: callerID,
			Name: targetWFID,
			Kind: graph.EdgeSignalSend,
		})
		return
	}
	b.ensureWorkerAndNamespace(info.namespace, info.taskQueue)
	calleeID := b.ensureHosted(graph.KindWorkflow, info.workflowType, info.namespace, info.taskQueue)
	b.addEdge(graph.Edge{
		From:    callerID,
		To:      calleeID,
		Kind:    graph.EdgeSignalSend,
		Routing: &graph.Routing{},
	})
}

// ---------------------------------------------------------------------------
// Node / edge helpers
// ---------------------------------------------------------------------------

func (b *builder) ensureWorkerAndNamespace(namespace, queue string) {
	nsID := graph.NamespaceID(namespace)
	if _, seen := b.nodesSeen[nsID]; !seen {
		b.g.Nodes = append(b.g.Nodes, graph.Node{
			ID:         nsID,
			Definition: graph.DefKey(graph.KindNamespace, namespace),
		})
		b.nodesSeen[nsID] = struct{}{}
	}

	wID := graph.WorkerID(queue, namespace)
	if _, seen := b.nodesSeen[wID]; !seen {
		b.g.Nodes = append(b.g.Nodes, graph.Node{
			ID:         wID,
			Definition: graph.DefKey(graph.KindWorker, queue),
			Queue:      queue,
		})
		b.nodesSeen[wID] = struct{}{}
		// worker → namespace containment
		b.g.Edges = append(b.g.Edges, graph.Edge{
			From: wID,
			To:   nsID,
			Kind: graph.EdgeContainment,
		})
	}
}

func (b *builder) ensureHosted(kind, name, namespace, queue string) string {
	// Worker name = queue name (1-worker-per-queue assumption).
	workerName := queue
	nodeID := graph.HostedID(kind, name, workerName, namespace, false)
	if _, seen := b.nodesSeen[nodeID]; !seen {
		b.g.Nodes = append(b.g.Nodes, graph.Node{
			ID:         nodeID,
			Definition: graph.DefKey(kind, name),
		})
		b.nodesSeen[nodeID] = struct{}{}
		// hosted → worker containment
		b.g.Edges = append(b.g.Edges, graph.Edge{
			From: nodeID,
			To:   graph.WorkerID(workerName, namespace),
			Kind: graph.EdgeContainment,
		})
	}
	return nodeID
}

func (b *builder) addEdge(e graph.Edge) {
	k := edgeKey{from: e.From, to: e.To, kind: e.Kind}
	if _, seen := b.edgesSeen[k]; seen {
		return
	}
	b.edgesSeen[k] = struct{}{}
	b.g.Edges = append(b.g.Edges, e)
}

// ---------------------------------------------------------------------------
// Graph constructor
// ---------------------------------------------------------------------------

func newEmptyGraph() *graph.Graph {
	return &graph.Graph{
		Nodes:          []graph.Node{},
		Edges:          []graph.Edge{},
		CoarsenedEdges: []graph.CoarsenedEdge{},
		Unresolved:     []graph.Unresolved{},
		Diagnostics:    []graph.Diagnostic{},
	}
}
