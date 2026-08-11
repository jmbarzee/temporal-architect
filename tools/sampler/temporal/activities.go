package temporal

import (
	"context"
	"fmt"

	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	"go.temporal.io/sdk/activity"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
	"github.com/jmbarzee/temporal-architect/tools/sampler/history"
	"github.com/jmbarzee/temporal-architect/tools/sampler/sampling"
	"github.com/jmbarzee/temporal-architect/tools/sampler/transport"
)

// Activities holds the sampler's activity implementations — the only place
// target-namespace IO happens. Connect builds a sampling.Backend for a target
// namespace worker-side (reading the credential from the environment / a file,
// never from workflow state); it is a field so tests can inject a stub backend.
type Activities struct {
	Connect func(namespace string) (sampling.Backend, func(), error)
}

// NewActivities returns Activities wired to the real transport connector, which
// reads SAMPLER_* config + the bearer credential from the environment.
func NewActivities() *Activities {
	return &Activities{Connect: transport.ConnectForNamespace}
}

// EnumerateTypes is Phase A: the distinct workflow types + filtered counts,
// plus the coverage assurance describing how complete that list is. Discovery
// runs an exclusion loop (no server supports counting GROUP BY WorkflowType, and
// a full scan is O(executions)), then one supported filtered Count per type.
// Read-only → safe to retry.
func (a *Activities) EnumerateTypes(ctx context.Context, req EnumerateRequest) (*TypeDiscovery, error) {
	backend, cleanup, err := a.Connect(req.Namespace)
	if err != nil {
		return nil, fmt.Errorf("connect %q: %w", req.Namespace, err)
	}
	defer cleanup()

	sel, err := selectorFromWindow(req.Window, req.Status)
	if err != nil {
		return nil, err
	}
	activity.RecordHeartbeat(ctx, "discovering types")
	d, err := sampling.DiscoverTypes(ctx, backend, req.Namespace, sel, req.Discovery.policy())
	if err != nil {
		return nil, err
	}

	source := CoverageDiscovered
	if len(req.Discovery.WorkflowTypes) > 0 {
		source = CoverageExplicit
	}
	coverage := TypeCoverage{
		Types:      len(d.Types),
		Exhaustive: d.Exhaustive,
		Remaining:  d.Remaining,
		Rounds:     d.Rounds,
		Calls:      d.Calls,
		Source:     source,
	}
	// exhaustive=false with remaining>0 means executions in this window have a
	// type we never found — the sample will silently omit whole workflows.
	activity.GetLogger(ctx).Info("discovered workflow types",
		"namespace", req.Namespace,
		"types", coverage.Types,
		"exhaustive", coverage.Exhaustive,
		"remaining", coverage.Remaining,
		"rounds", coverage.Rounds,
		"calls", coverage.Calls,
		"source", coverage.Source)

	activity.RecordHeartbeat(ctx, "counting types")
	counts, err := sampling.CountTypes(ctx, backend, req.Namespace, d.Types, sel)
	if err != nil {
		return nil, err
	}
	return &TypeDiscovery{TypeCounts: counts, Coverage: coverage}, nil
}

// SelectCandidates is Phase B's selection (no history download): up to
// req.Target candidate executions for one workflow type, preferring running
// ones. Read-only → safe to retry.
func (a *Activities) SelectCandidates(ctx context.Context, req SelectRequest) ([]sampling.Execution, error) {
	backend, cleanup, err := a.Connect(req.Namespace)
	if err != nil {
		return nil, fmt.Errorf("connect %q: %w", req.Namespace, err)
	}
	defer cleanup()

	sel, err := selectorFromWindow(req.Window, req.Status)
	if err != nil {
		return nil, err
	}
	activity.RecordHeartbeat(ctx, "selecting candidates for "+req.WorkflowType)
	execs, err := sampling.SelectExecutions(ctx, backend, req.Namespace, req.WorkflowType, req.Target, sel)
	if err != nil {
		return nil, err
	}
	activity.GetLogger(ctx).Info("selected candidates", "workflowType", req.WorkflowType, "selected", len(execs), "target", req.Target)
	return execs, nil
}

// FetchFoldHistory is THE leaf unit that fans back in: download each execution's
// full history (paginated, heartbeating per page), then fold the whole batch to
// one partial ObservedGraph via history.Build, built with req.Window so it is
// index-aligned with every other partial for observe.Merge. History fetch + fold
// is read-only and idempotent → a normal retry policy is safe. On retry after a
// heartbeat, it can skip executions already downloaded (see the heartbeat
// details cursor).
func (a *Activities) FetchFoldHistory(ctx context.Context, req FetchRequest) (*observe.ObservedGraph, error) {
	backend, cleanup, err := a.Connect(req.Namespace)
	if err != nil {
		return nil, fmt.Errorf("connect %q: %w", req.Namespace, err)
	}
	defer cleanup()

	// Resume point: on a retry, skip executions already fully downloaded in a
	// prior attempt (best-effort — the fold is idempotent either way).
	start := 0
	if activity.HasHeartbeatDetails(ctx) {
		var hb FetchProgress
		if err := activity.GetHeartbeatDetails(ctx, &hb); err == nil {
			start = hb.Executions
		}
	}

	histories := make([]history.History, 0, len(req.Executions))
	pages := 0
	for i, exec := range req.Executions {
		if i < start {
			continue
		}
		events, p, err := drainHistory(ctx, backend, req.Namespace, exec, i, pages)
		if err != nil {
			return nil, err
		}
		pages = p
		histories = append(histories, history.History{
			WorkflowID: exec.WorkflowID,
			Namespace:  req.Namespace,
			Events:     events,
		})
		activity.RecordHeartbeat(ctx, FetchProgress{Executions: i + 1, Events: len(events), Pages: pages})
	}

	og := history.Build(histories, history.Options{Namespace: req.Namespace, Window: req.Window})
	activity.GetLogger(ctx).Info("folded batch", "executions", len(histories), "nodes", og.Summary.Nodes, "edges", og.Summary.Edges)
	return og, nil
}

// drainHistory pulls one execution's full event history, heartbeating every
// heartbeatEvery events (reporting the execution index, event count, and running
// page total) so a long history is observable. Returns the running page total.
func drainHistory(ctx context.Context, backend sampling.Backend, namespace string, exec sampling.Execution, execIdx, pages int) ([]*historypb.HistoryEvent, int, error) {
	const heartbeatEvery = 1000
	iter := backend.GetWorkflowHistory(ctx, exec.WorkflowID, exec.RunID, false, enumspb.HISTORY_EVENT_FILTER_TYPE_ALL_EVENT)
	var events []*historypb.HistoryEvent
	for iter.HasNext() {
		e, err := iter.Next()
		if err != nil {
			return nil, pages, fmt.Errorf("fetch history %s/%s: %w", exec.WorkflowID, exec.RunID, err)
		}
		events = append(events, e)
		if len(events)%heartbeatEvery == 0 {
			pages++
			activity.RecordHeartbeat(ctx, FetchProgress{Executions: execIdx, Events: len(events), Pages: pages})
		}
	}
	return events, pages, nil
}
