package chunks_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/clitest"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	graphcmd "github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/command/graph"
)

// runChunks drives `graph chunks` through the assembled graph command, since
// chunks is only ever reached as a child of graph (it inherits --json/--history
// from the parent). This mirrors the real invocation path.
func runChunks(args []string) int {
	cmd := graphcmd.New()
	cmd.SetArgs(append([]string{"chunks"}, args...))
	return cmdutil.Exec(cmd)
}

// TestChunksCommand_JSON drives `twf graph chunks --json` and asserts the
// envelope carries a well-formed chunks payload.
func TestChunksCommand_JSON(t *testing.T) {
	out, err := clitest.CaptureStdout(func() {
		code := runChunks([]string{"--json", clitest.Testdata("clean.twf")})
		if code != 0 {
			t.Errorf("graph chunks exit code = %d, want 0", code)
		}
	})
	if err != nil {
		t.Fatalf("CaptureStdout: %v", err)
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
	out, err := clitest.CaptureStdout(func() {
		code := runChunks([]string{clitest.Testdata("clean.twf")})
		if code != 0 {
			t.Errorf("graph chunks text exit code = %d, want 0", code)
		}
	})
	if err != nil {
		t.Fatalf("CaptureStdout: %v", err)
	}
	if !strings.Contains(out, "Decomposition:") {
		t.Errorf("text output missing header; got: %s", out)
	}
}
