package sampling

import (
	"testing"
	"time"
)

// fixed timestamps so query strings are stable and assertable.
var (
	t0 = time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	t1 = time.Date(2026, 1, 3, 3, 4, 5, 0, time.UTC)
)

func TestWhereClauses(t *testing.T) {
	tests := []struct {
		name string
		f    filters
		want []string
	}{
		{"empty", filters{}, nil},
		{"status only", filters{status: "Completed"},
			[]string{"ExecutionStatus = 'Completed'"}},
		{"since only", filters{since: t0},
			[]string{"StartTime >= '2026-01-02T03:04:05Z'"}},
		{"until only", filters{until: t1},
			[]string{"StartTime <= '2026-01-03T03:04:05Z'"}},
		{"between", filters{since: t0, until: t1},
			[]string{"StartTime BETWEEN '2026-01-02T03:04:05Z' AND '2026-01-03T03:04:05Z'"}},
		{"status and window (status first)", filters{status: "Failed", since: t0, until: t1},
			[]string{
				"ExecutionStatus = 'Failed'",
				"StartTime BETWEEN '2026-01-02T03:04:05Z' AND '2026-01-03T03:04:05Z'",
			}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertClauses(t, tt.f.whereClauses(), tt.want)
		})
	}
}

func TestCountQuery(t *testing.T) {
	tests := []struct {
		name string
		f    filters
		want string
	}{
		{"no filter keeps bare group by", filters{},
			"GROUP BY WorkflowType"},
		{"status prepended", filters{status: "Completed"},
			"ExecutionStatus = 'Completed' GROUP BY WorkflowType"},
		{"window prepended", filters{since: t0, until: t1},
			"StartTime BETWEEN '2026-01-02T03:04:05Z' AND '2026-01-03T03:04:05Z' GROUP BY WorkflowType"},
		{"status and window", filters{status: "Failed", since: t0},
			"ExecutionStatus = 'Failed' AND StartTime >= '2026-01-02T03:04:05Z' GROUP BY WorkflowType"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := countQuery(tt.f); got != tt.want {
				t.Errorf("countQuery() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestScanQuery(t *testing.T) {
	tests := []struct {
		name string
		f    filters
		want string
	}{
		{"no filter lists all", filters{}, ""},
		{"status", filters{status: "Running"}, "ExecutionStatus = 'Running'"},
		{"status and window", filters{status: "Completed", since: t0, until: t1},
			"ExecutionStatus = 'Completed' AND StartTime BETWEEN '2026-01-02T03:04:05Z' AND '2026-01-03T03:04:05Z'"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := scanQuery(tt.f); got != tt.want {
				t.Errorf("scanQuery() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestTypeQuery(t *testing.T) {
	tests := []struct {
		name        string
		wfType      string
		f           filters
		runningOnly bool
		want        string
	}{
		{"all, no filter", "Order", filters{}, false,
			"WorkflowType = 'Order'"},
		{"running-first pass, no filter", "Order", filters{}, true,
			"WorkflowType = 'Order' AND ExecutionStatus = 'Running'"},
		{"window applied", "Order", filters{since: t0, until: t1}, false,
			"WorkflowType = 'Order' AND StartTime BETWEEN '2026-01-02T03:04:05Z' AND '2026-01-03T03:04:05Z'"},
		{"running-first pass with window", "Order", filters{since: t0}, true,
			"WorkflowType = 'Order' AND StartTime >= '2026-01-02T03:04:05Z' AND ExecutionStatus = 'Running'"},
		{"status filter, no running pass", "Order", filters{status: "Completed"}, false,
			"WorkflowType = 'Order' AND ExecutionStatus = 'Completed'"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := typeQuery(tt.wfType, tt.f, tt.runningOnly); got != tt.want {
				t.Errorf("typeQuery() = %q, want %q", got, tt.want)
			}
		})
	}
}

func assertClauses(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func TestSampleCount(t *testing.T) {
	tests := []struct {
		name       string
		total      int
		percent    int
		minPerType int
		want       int
	}{
		{"empty type", 0, 10, 5, 0},
		{"min floor wins over percent", 100, 1, 5, 5},   // 1% of 100 = 1, floored to 5
		{"percent wins over min", 100, 20, 5, 20},       // 20% of 100 = 20
		{"ceil rounds up", 100, 1, 0, 1},                // ceil(1.0) = 1
		{"ceil rounds fractional up", 11, 10, 0, 2},     // ceil(1.1) = 2
		{"total cap when fewer than min", 3, 10, 5, 3},  // min 5 capped at total 3
		{"total cap when percent exceeds", 4, 90, 0, 4}, // ceil(3.6)=4, capped at 4
		{"100 percent", 7, 100, 0, 7},                   // all
		{"negative percent clamped", 10, -5, 2, 2},      // percent->0, min 2
		{"negative min clamped", 10, 10, -3, 1},         // ceil(1.0)=1, min->0
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sampleCount(tt.total, tt.percent, tt.minPerType)
			if got != tt.want {
				t.Errorf("sampleCount(%d,%d,%d) = %d, want %d",
					tt.total, tt.percent, tt.minPerType, got, tt.want)
			}
		})
	}
}

func TestSelectCandidates(t *testing.T) {
	cands := []candidate{
		{workflowID: "c1", running: false},
		{workflowID: "r1", running: true},
		{workflowID: "c2", running: false},
		{workflowID: "r2", running: true},
		{workflowID: "c3", running: false},
	}

	t.Run("running first then closed top-up", func(t *testing.T) {
		got := selectCandidates(cands, 3)
		assertIDs(t, got, []string{"r1", "r2", "c1"})
	})

	t.Run("only running when n fits running count", func(t *testing.T) {
		got := selectCandidates(cands, 2)
		assertIDs(t, got, []string{"r1", "r2"})
	})

	t.Run("n exceeds input returns all (copy)", func(t *testing.T) {
		got := selectCandidates(cands, 99)
		if len(got) != len(cands) {
			t.Fatalf("len = %d, want %d", len(got), len(cands))
		}
		got[0].workflowID = "MUT"
		if cands[0].workflowID == "MUT" {
			t.Error("selectCandidates returned a slice aliasing the source")
		}
	})

	t.Run("n zero returns nil", func(t *testing.T) {
		if got := selectCandidates(cands, 0); got != nil {
			t.Errorf("want nil, got %v", got)
		}
	})

	t.Run("deterministic across runs", func(t *testing.T) {
		a := selectCandidates(cands, 4)
		b := selectCandidates(cands, 4)
		assertIDs(t, a, idsOf(b))
	})
}

func assertIDs(t *testing.T, got []candidate, want []string) {
	t.Helper()
	gotIDs := idsOf(got)
	if len(gotIDs) != len(want) {
		t.Fatalf("got %v, want %v", gotIDs, want)
	}
	for i := range want {
		if gotIDs[i] != want[i] {
			t.Fatalf("got %v, want %v", gotIDs, want)
		}
	}
}

func idsOf(cands []candidate) []string {
	out := make([]string, len(cands))
	for i, c := range cands {
		out[i] = c.workflowID
	}
	return out
}
