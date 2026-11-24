package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
)

func TestResolveOutPath(t *testing.T) {
	dir := t.TempDir()

	t.Run("existing dir gets observed-graph.json", func(t *testing.T) {
		got := resolveOutPath(dir)
		want := filepath.Join(dir, "observed-graph.json")
		if got != want {
			t.Errorf("resolveOutPath(%q) = %q, want %q", dir, got, want)
		}
	})

	t.Run("explicit file path is verbatim", func(t *testing.T) {
		p := filepath.Join(dir, "custom.json")
		if got := resolveOutPath(p); got != p {
			t.Errorf("resolveOutPath(%q) = %q, want %q", p, got, p)
		}
	})

	t.Run("trailing separator is treated as dir", func(t *testing.T) {
		in := "somewhere" + string(filepath.Separator)
		want := filepath.Join("somewhere", "observed-graph.json")
		if got := resolveOutPath(in); got != want {
			t.Errorf("resolveOutPath(%q) = %q, want %q", in, got, want)
		}
	})
}

func TestParseTimeFlag(t *testing.T) {
	now := time.Date(2026, 6, 14, 12, 0, 0, 0, time.UTC)

	t.Run("empty is unbounded", func(t *testing.T) {
		got, err := parseTimeFlag("", now)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !got.IsZero() {
			t.Errorf("want zero time, got %v", got)
		}
	})

	t.Run("RFC3339 parsed as-is", func(t *testing.T) {
		got, err := parseTimeFlag("2026-01-02T03:04:05Z", now)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
		if !got.Equal(want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})

	t.Run("duration is relative to now", func(t *testing.T) {
		got, err := parseTimeFlag("24h", now)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := now.Add(-24 * time.Hour)
		if !got.Equal(want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})

	t.Run("invalid is rejected", func(t *testing.T) {
		if _, err := parseTimeFlag("not-a-time", now); err == nil {
			t.Error("want error for invalid value, got nil")
		}
	})
}

func TestParseFlags_TransitivePerType(t *testing.T) {
	for _, tc := range []struct {
		args []string
		want int
	}{
		{nil, 5},
		{[]string{"--transitive-per-type", "0"}, 0},
		{[]string{"--transitive-per-type", "12"}, 12},
	} {
		if got := parseFlags(tc.args).transitivePerType; got != tc.want {
			t.Errorf("parseFlags(%v).transitivePerType = %d, want %d", tc.args, got, tc.want)
		}
	}
}

func TestSplitExecution(t *testing.T) {
	const run = "01a20b0c-db2e-7d81-ba7a-a4125aa2c874"
	for _, tc := range []struct{ in, workflowID, runID string }{
		{"order-1", "order-1", ""},
		{"order-1/" + run, "order-1", run},
		{"orders/1", "orders/1", ""},
		{"orders/1/" + run, "orders/1", run},
	} {
		if w, r := splitExecution(tc.in); w != tc.workflowID || r != tc.runID {
			t.Errorf("splitExecution(%q) = %q, %q, want %q, %q", tc.in, w, r, tc.workflowID, tc.runID)
		}
	}
}

// TestWrite_WithoutExecution holds the envelope to its shape before
// --execution: without one, the file has the observed graph alone.
func TestWrite_WithoutExecution(t *testing.T) {
	path := filepath.Join(t.TempDir(), "observed-graph.json")
	og := observe.New()
	if err := write(path, output{ObservedGraph: og}); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	want, _ := json.MarshalIndent(struct {
		ObservedGraph *observe.ObservedGraph `json:"observedGraph"`
	}{og}, "", "  ")
	if !bytes.Equal(got, want) {
		t.Errorf("wrote\n%s\nwant\n%s", got, want)
	}
}
