package main

import (
	"path/filepath"
	"testing"
)

func TestSampleCount(t *testing.T) {
	tests := []struct {
		name       string
		total      int
		percent    int
		minPerType int
		want       int
	}{
		{"empty type", 0, 10, 5, 0},
		{"min floor wins over percent", 100, 1, 5, 5},     // 1% of 100 = 1, floored to 5
		{"percent wins over min", 100, 20, 5, 20},         // 20% of 100 = 20
		{"ceil rounds up", 100, 1, 0, 1},                  // ceil(1.0) = 1
		{"ceil rounds fractional up", 11, 10, 0, 2},       // ceil(1.1) = 2
		{"total cap when fewer than min", 3, 10, 5, 3},    // min 5 capped at total 3
		{"total cap when percent exceeds", 4, 90, 0, 4},   // ceil(3.6)=4, capped at 4
		{"100 percent", 7, 100, 0, 7},                     // all
		{"negative percent clamped", 10, -5, 2, 2},        // percent→0, min 2
		{"negative min clamped", 10, 10, -3, 1},           // ceil(1.0)=1, min→0
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
		want := []string{"r1", "r2", "c1"}
		assertIDs(t, got, want)
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
		// Mutating the result must not affect the source.
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

func TestOutputPath(t *testing.T) {
	tests := []struct {
		name              string
		out, ns, wf, id   string
		want              string
	}{
		{
			name: "basic layout",
			out:  "/data", ns: "ecommerce", wf: "OrderWorkflow", id: "order-001",
			want: filepath.Join("/data", "ecommerce", "OrderWorkflow", "order-001.json"),
		},
		{
			name: "slash in workflow id is sanitized",
			out:  "out", ns: "default", wf: "Wf", id: "a/b/c",
			want: filepath.Join("out", "default", "Wf", "a_b_c.json"),
		},
		{
			name: "parent-dir id is neutralized",
			out:  "out", ns: "default", wf: "Wf", id: "..",
			want: filepath.Join("out", "default", "Wf", "_.json"),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := outputPath(tt.out, tt.ns, tt.wf, tt.id)
			if got != tt.want {
				t.Errorf("outputPath = %q, want %q", got, tt.want)
			}
		})
	}
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
