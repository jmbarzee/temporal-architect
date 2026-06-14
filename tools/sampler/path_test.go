package main

import (
	"path/filepath"
	"testing"
	"time"
)

func TestOutputPath(t *testing.T) {
	tests := []struct {
		name            string
		out, ns, wf, id string
		want            string
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
