package temporal

import (
	"testing"
	"time"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
	"github.com/jmbarzee/temporal-architect/tools/sampler/sampling"
)

func execs(ids ...string) []sampling.Execution {
	out := make([]sampling.Execution, len(ids))
	for i, id := range ids {
		out[i] = sampling.Execution{WorkflowID: id}
	}
	return out
}

func TestNextBatches(t *testing.T) {
	all := execs("a", "b", "c", "d", "e")
	tests := []struct {
		name          string
		processed     int
		batchSize     int
		batchesPerRun int
		want          [][]string
	}{
		{"even split", 0, 2, 0, [][]string{{"a", "b"}, {"c", "d"}, {"e"}}},
		{"from offset", 2, 2, 0, [][]string{{"c", "d"}, {"e"}}},
		{"capped per run", 0, 2, 1, [][]string{{"a", "b"}}},
		{"batchesPerRun over remaining", 0, 2, 10, [][]string{{"a", "b"}, {"c", "d"}, {"e"}}},
		{"default batch size folds all", 0, 0, 0, [][]string{{"a", "b", "c", "d", "e"}}},
		{"exhausted", 5, 2, 0, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := nextBatches(all, tt.processed, tt.batchSize, tt.batchesPerRun)
			if len(got) != len(tt.want) {
				t.Fatalf("batches=%d, want %d (%v)", len(got), len(tt.want), got)
			}
			for i := range got {
				if len(got[i]) != len(tt.want[i]) {
					t.Fatalf("batch %d len=%d, want %d", i, len(got[i]), len(tt.want[i]))
				}
				for j := range got[i] {
					if got[i][j].WorkflowID != tt.want[i][j] {
						t.Fatalf("batch %d[%d]=%q, want %q", i, j, got[i][j].WorkflowID, tt.want[i][j])
					}
				}
			}
		})
	}
}

func TestResolveWindow(t *testing.T) {
	now := time.Date(2026, 6, 2, 0, 0, 0, 0, time.UTC)

	t.Run("single bucket, no bounds", func(t *testing.T) {
		w, err := ResolveWindow("", "", 1, now)
		if err != nil {
			t.Fatal(err)
		}
		if w.Buckets != 1 || w.Since != "" || w.Until != "" {
			t.Fatalf("got %+v", w)
		}
	})

	t.Run("duration since resolves to absolute", func(t *testing.T) {
		w, err := ResolveWindow("24h", "", 1, now)
		if err != nil {
			t.Fatal(err)
		}
		if w.Since != "2026-06-01T00:00:00Z" {
			t.Fatalf("since=%q", w.Since)
		}
	})

	t.Run("buckets need since", func(t *testing.T) {
		if _, err := ResolveWindow("", "", 24, now); err == nil {
			t.Fatal("expected error when buckets>1 without since")
		}
	})

	t.Run("bucketed window defaults until to now", func(t *testing.T) {
		w, err := ResolveWindow("2026-06-01T00:00:00Z", "", 24, now)
		if err != nil {
			t.Fatal(err)
		}
		if w.Buckets != 24 || w.Since != "2026-06-01T00:00:00Z" || w.Until != "2026-06-02T00:00:00Z" {
			t.Fatalf("got %+v", w)
		}
	})
}

func TestSelectorFromWindow(t *testing.T) {
	sel, err := selectorFromWindow(observe.Window{Since: "2026-06-01T00:00:00Z", Until: "2026-06-02T00:00:00Z", Buckets: 1}, "Completed")
	if err != nil {
		t.Fatal(err)
	}
	if sel.Status != "Completed" {
		t.Fatalf("status=%q", sel.Status)
	}
	if sel.Since.IsZero() || sel.Until.IsZero() {
		t.Fatalf("expected parsed bounds, got %+v", sel)
	}
	if !sel.Since.Equal(time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("since=%v", sel.Since)
	}
}
