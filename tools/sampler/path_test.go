package main

import (
	"path/filepath"
	"testing"
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
