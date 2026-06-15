package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestChunksCommand_JSON drives `twf graph chunks --json` through the same
// dispatch the CLI uses and asserts the envelope carries a well-formed chunks
// payload.
func TestChunksCommand_JSON(t *testing.T) {
	out, err := captureStdout(func() {
		// Routed via graphCommand to exercise the `graph chunks` subcommand path.
		code := graphCommand([]string{"chunks", "--json", "testdata/clean.twf"})
		if code != 0 {
			t.Errorf("graph chunks exit code = %d, want 0", code)
		}
	})
	if err != nil {
		t.Fatalf("captureStdout: %v", err)
	}

	var env struct {
		Summary     map[string]any   `json:"summary"`
		Diagnostics []map[string]any `json:"diagnostics"`
		Chunks      *struct {
			Nodes      []map[string]any `json:"nodes"`
			Roots      []map[string]any `json:"roots"`
			Chunks     []map[string]any `json:"chunks"`
			ChunkEdges []map[string]any `json:"chunkEdges"`
			Floor      int              `json:"floor"`
			Ceiling    int              `json:"ceiling"`
		} `json:"chunks"`
	}
	if err := json.Unmarshal([]byte(out), &env); err != nil {
		t.Fatalf("unmarshal envelope: %v\noutput: %s", err, out)
	}
	if env.Chunks == nil {
		t.Fatal("envelope chunks payload is null")
	}
	if env.Diagnostics == nil {
		t.Error("envelope diagnostics is null, want []")
	}
	// clean.twf defines one workflow + one activity (both authorable nodes).
	if len(env.Chunks.Nodes) != 2 {
		t.Errorf("chunks.nodes = %d, want 2; payload: %s", len(env.Chunks.Nodes), out)
	}
	if env.Chunks.Floor != 2 {
		t.Errorf("default floor = %d, want 2", env.Chunks.Floor)
	}
}

// TestChunksCommand_Text smoke-tests the human-readable rendering.
func TestChunksCommand_Text(t *testing.T) {
	out, err := captureStdout(func() {
		code := graphCommand([]string{"chunks", "testdata/clean.twf"})
		if code != 0 {
			t.Errorf("graph chunks text exit code = %d, want 0", code)
		}
	})
	if err != nil {
		t.Fatalf("captureStdout: %v", err)
	}
	if !strings.Contains(out, "Decomposition:") {
		t.Errorf("text output missing header; got: %s", out)
	}
}
