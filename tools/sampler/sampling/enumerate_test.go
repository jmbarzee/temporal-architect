package sampling

import (
	"context"
	"strconv"
	"strings"
	"testing"

	commonpb "go.temporal.io/api/common/v1"
	enumspb "go.temporal.io/api/enums/v1"
	workflowpb "go.temporal.io/api/workflow/v1"
	"go.temporal.io/api/workflowservice/v1"
	"go.temporal.io/sdk/client"
)

// fakeBackend drives enumerate's fallback path: CountWorkflow returns no groups
// (so GROUP BY is treated as unsupported), and ListWorkflow serves fixed pages,
// tracking how many were requested so tests can assert the scan is bounded.
type fakeBackend struct {
	pages     [][]*workflowpb.WorkflowExecutionInfo
	listCalls int
}

func execPage(n int) []*workflowpb.WorkflowExecutionInfo {
	page := make([]*workflowpb.WorkflowExecutionInfo, n)
	for i := range page {
		page[i] = &workflowpb.WorkflowExecutionInfo{
			Execution: &commonpb.WorkflowExecution{WorkflowId: "wf-" + strconv.Itoa(i)},
			Type:      &commonpb.WorkflowType{Name: "Order"},
			Status:    enumspb.WORKFLOW_EXECUTION_STATUS_COMPLETED,
		}
	}
	return page
}

func (f *fakeBackend) CountWorkflow(context.Context, *workflowservice.CountWorkflowExecutionsRequest) (*workflowservice.CountWorkflowExecutionsResponse, error) {
	// No groups => enumerate falls back to a scan.
	return &workflowservice.CountWorkflowExecutionsResponse{}, nil
}

func (f *fakeBackend) ListWorkflow(_ context.Context, req *workflowservice.ListWorkflowExecutionsRequest) (*workflowservice.ListWorkflowExecutionsResponse, error) {
	f.listCalls++
	idx := 0
	if len(req.GetNextPageToken()) > 0 {
		idx, _ = strconv.Atoi(string(req.GetNextPageToken()))
	}
	resp := &workflowservice.ListWorkflowExecutionsResponse{Executions: f.pages[idx]}
	if idx+1 < len(f.pages) {
		resp.NextPageToken = []byte(strconv.Itoa(idx + 1))
	}
	return resp, nil
}

func (f *fakeBackend) GetWorkflowHistory(context.Context, string, string, bool, enumspb.HistoryEventFilterType) client.HistoryEventIterator {
	return nil
}

func TestEnumerateScanCap(t *testing.T) {
	// Four pages of 4 executions each (16 total). A ScanLimit of 5 must abort
	// after the second page (total 8 > 5), never walking the whole set.
	be := &fakeBackend{pages: [][]*workflowpb.WorkflowExecutionInfo{
		execPage(4), execPage(4), execPage(4), execPage(4),
	}}
	_, err := enumerate(context.Background(), be, "ns", filters{}, EnumeratePolicy{ScanLimit: 5})
	if err == nil {
		t.Fatal("expected scan-limit error, got nil")
	}
	if !strings.Contains(err.Error(), "exceeded 5 executions") {
		t.Fatalf("unexpected error: %v", err)
	}
	if be.listCalls != 2 {
		t.Fatalf("scan should stop after 2 pages, made %d ListWorkflow calls", be.listCalls)
	}
}

func TestEnumerateScanUnderLimit(t *testing.T) {
	// Total (8) under the limit (default 200k): the scan completes and counts.
	be := &fakeBackend{pages: [][]*workflowpb.WorkflowExecutionInfo{
		execPage(4), execPage(4),
	}}
	counts, err := enumerate(context.Background(), be, "ns", filters{}, EnumeratePolicy{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := counts["Order"]; got != 8 {
		t.Fatalf("Order count = %d, want 8", got)
	}
}

func TestEnumerateDisableScanFallback(t *testing.T) {
	// With the fallback disabled, an unavailable grouped Count fails immediately
	// and ListWorkflow is never called (no walk of the namespace).
	be := &fakeBackend{pages: [][]*workflowpb.WorkflowExecutionInfo{execPage(4)}}
	_, err := enumerate(context.Background(), be, "ns", filters{}, EnumeratePolicy{DisableScanFallback: true})
	if err == nil {
		t.Fatal("expected error when scan fallback is disabled, got nil")
	}
	if be.listCalls != 0 {
		t.Fatalf("ListWorkflow should not be called when fallback disabled, made %d calls", be.listCalls)
	}
}
