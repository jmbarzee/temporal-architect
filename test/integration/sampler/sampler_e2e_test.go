//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
)

// TestSamplerE2E is the command-level test: it drives the real `sampler` binary
// as a subprocess and reads the single observed-graph.json it writes,
// complementing the direct-call suite (which bypasses the CLI). Shared fixtures
// and matchers live in harness_test.go.
func TestSamplerE2E(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test: skipped in -short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	srv := startDevServer(ctx, t, []string{defaultNamespace})
	defer func() { _ = srv.Stop() }()

	c, err := client.Dial(client.Options{HostPort: srv.FrontendHostPort(), Namespace: defaultNamespace})
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer c.Close()

	w := worker.New(c, graphTestQueue, worker.Options{})
	w.RegisterWorkflow(GraphTestWorkflow)
	w.RegisterActivity(GraphTestActivity)
	if err := w.Start(); err != nil {
		t.Fatalf("start worker: %v", err)
	}
	defer w.Stop()

	run, err := c.ExecuteWorkflow(ctx, client.StartWorkflowOptions{
		ID:        "graph-it-wf-1",
		TaskQueue: graphTestQueue,
	}, GraphTestWorkflow)
	if err != nil {
		t.Fatalf("execute workflow: %v", err)
	}
	if err := run.Get(ctx, nil); err != nil {
		t.Fatalf("workflow result: %v", err)
	}

	waitForVisibleCount(ctx, t, c, defaultNamespace, 1)

	// Run the real sampler binary into a temp dir; it writes observed-graph.json.
	root := repoRoot(t)
	outDir := t.TempDir()
	runGo(ctx, t, root,
		"run", "./tools/sampler",
		"--address", srv.FrontendHostPort(),
		"--namespace", defaultNamespace,
		"--out", outDir,
		"--min-per-type", "1",
	)

	outPath := filepath.Join(outDir, "observed-graph.json")
	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("read observed-graph.json: %v", err)
	}

	var env struct {
		ObservedGraph *observe.ObservedGraph `json:"observedGraph"`
	}
	if err := json.Unmarshal(data, &env); err != nil {
		t.Fatalf("unmarshal observed-graph envelope: %v\noutput: %s", err, data)
	}
	if env.ObservedGraph == nil {
		t.Fatalf("envelope has null observedGraph\noutput: %s", data)
	}
	// Default single-bucket window: every edge carries a length-1 series.
	if env.ObservedGraph.Window.Buckets != 1 {
		t.Errorf("default window buckets = %d, want 1", env.ObservedGraph.Window.Buckets)
	}

	// Assert with the same expectation vocabulary as the suite, over the
	// projected deployment graph.
	g := observe.ToGraph(env.ObservedGraph)
	exp := Expect{
		Nodes: []ExpectNode{
			{Kind: graph.KindWorkflow, Name: graphTestWorkflowType},
			{Kind: graph.KindActivity, Name: graphTestActivityType},
		},
		Edges: []ExpectEdge{
			{
				From: ExpectNode{Kind: graph.KindWorkflow, Name: graphTestWorkflowType},
				To:   ExpectNode{Kind: graph.KindActivity, Name: graphTestActivityType},
				Kind: graph.EdgeActivityCall,
			},
		},
	}
	if ok, miss := satisfied(g, exp, true); !ok {
		t.Fatalf("sampler-produced graph missing expected structure: %s", miss)
	}
}

// ---------------------------------------------------------------------------
// Subprocess helpers (specific to the CLI command test)
// ---------------------------------------------------------------------------

// repoRoot walks up from the current working directory to the directory that
// contains go.work, so subprocess package paths resolve regardless of where
// `go test` was invoked.
func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.work")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatalf("could not locate go.work above %s", dir)
		}
		dir = parent
	}
}

// runGo runs `go <args...>` from the repo root and returns stdout, failing the
// test (with combined output) on a non-zero exit.
func runGo(ctx context.Context, t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.CommandContext(ctx, "go", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GOMODCACHE="+goModCache())
	out, err := cmd.Output()
	if err != nil {
		stderr := ""
		if ee, ok := err.(*exec.ExitError); ok {
			stderr = string(ee.Stderr)
		}
		t.Fatalf("go %v failed: %v\nstderr: %s", args, err, stderr)
	}
	return string(out)
}

// goModCache mirrors the repo convention of pointing GOMODCACHE at the host
// cache so module resolution matches the rest of the workspace (see AGENTS.md).
func goModCache() string {
	if home, err := os.UserHomeDir(); err == nil {
		return filepath.Join(home, "go", "pkg", "mod")
	}
	return os.Getenv("GOMODCACHE")
}
