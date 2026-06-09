package main

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// captureStdout runs fn with os.Stdout redirected to a pipe and returns
// everything written to stdout as a string. This lets CLI commands that
// write directly to fmt.Println be tested without subprocess overhead.
func captureStdout(fn func()) (string, error) {
	r, w, err := os.Pipe()
	if err != nil {
		return "", err
	}
	old := os.Stdout
	os.Stdout = w

	fn()

	w.Close()
	os.Stdout = old

	var buf [1 << 20]byte
	n, _ := r.Read(buf[:])
	r.Close()
	return string(buf[:n]), nil
}

// ---------------------------------------------------------------------------
// loadHistoriesFromDir — unit test
// ---------------------------------------------------------------------------

func TestLoadHistoriesFromDir(t *testing.T) {
	histories, err := loadHistoriesFromDir("testdata/sample")
	if err != nil {
		t.Fatalf("loadHistoriesFromDir: %v", err)
	}
	if len(histories) != 2 {
		t.Fatalf("got %d histories, want 2", len(histories))
	}

	// Each history must have its namespace set from the folder path.
	nsSeen := map[string]int{}
	for _, h := range histories {
		if h.Namespace == "" {
			t.Errorf("history %q has empty namespace", h.WorkflowID)
		}
		nsSeen[h.Namespace]++
		if len(h.Events) == 0 {
			t.Errorf("history %q has no events", h.WorkflowID)
		}
	}
	for _, ns := range []string{"ecommerce", "partner"} {
		if nsSeen[ns] == 0 {
			t.Errorf("no history found for namespace %q", ns)
		}
	}
}

// ---------------------------------------------------------------------------
// graphCommand --history — acceptance test
// ---------------------------------------------------------------------------

func TestGraphCommand_HistoryJSON(t *testing.T) {
	out, err := captureStdout(func() {
		code := graphCommand([]string{"--history", "testdata/sample", "--json"})
		if code != 0 {
			t.Errorf("graphCommand exit code = %d, want 0", code)
		}
	})
	if err != nil {
		t.Fatalf("captureStdout: %v", err)
	}

	// Unmarshal as a generic envelope.
	var env struct {
		Summary     map[string]any   `json:"summary"`
		Diagnostics []map[string]any `json:"diagnostics"`
		Graph       *graph.Graph     `json:"graph"`
	}
	if err := json.Unmarshal([]byte(out), &env); err != nil {
		t.Fatalf("unmarshal envelope: %v\noutput: %s", err, out)
	}
	if env.Graph == nil {
		t.Fatal("envelope graph is null")
	}
	if env.Summary == nil {
		t.Fatal("envelope summary is null")
	}

	// Must have nodes from both namespaces.
	nsEcommerce := graph.NamespaceID("ecommerce")
	nsPartner := graph.NamespaceID("partner")
	hasEcommerce, hasPartner := false, false
	for _, n := range env.Graph.Nodes {
		if n.ID == nsEcommerce {
			hasEcommerce = true
		}
		if n.ID == nsPartner {
			hasPartner = true
		}
	}
	if !hasEcommerce {
		t.Errorf("missing ecommerce namespace node")
	}
	if !hasPartner {
		t.Errorf("missing partner namespace node")
	}

	// Cross-namespace workflowCall: PartnerCheckout → OrderWorkflow in ecommerce.
	partnerWF := graph.HostedID(graph.KindWorkflow, "PartnerCheckout", "partner", "partner", false)
	orderWF := graph.HostedID(graph.KindWorkflow, "OrderWorkflow", "orders", "ecommerce", false)
	foundEdge := false
	for _, e := range env.Graph.Edges {
		if e.From == partnerWF && e.To == orderWF && e.Kind == graph.EdgeWorkflowCall {
			foundEdge = true
		}
	}
	if !foundEdge {
		t.Errorf("missing cross-namespace workflowCall %s → %s", partnerWF, orderWF)
	}

	// Diagnostics must be an array (never null).
	if env.Diagnostics == nil {
		t.Error("envelope diagnostics is null, want []")
	}
}

// ---------------------------------------------------------------------------
// Mutual exclusion
// ---------------------------------------------------------------------------

func TestGraphCommand_HistoryMutualExclusion(t *testing.T) {
	code := graphCommand([]string{"--history", "testdata/sample", "some.twf"})
	if code == 0 {
		t.Error("expected non-zero exit when --history and file args both present")
	}
}

// ---------------------------------------------------------------------------
// Text mode smoke test
// ---------------------------------------------------------------------------

func TestGraphCommand_HistoryText(t *testing.T) {
	out, err := captureStdout(func() {
		code := graphCommand([]string{"--history", "testdata/sample"})
		if code != 0 {
			t.Errorf("graphCommand text mode exit code = %d, want 0", code)
		}
	})
	if err != nil {
		t.Fatalf("captureStdout: %v", err)
	}
	if len(out) == 0 {
		t.Error("text output is empty")
	}
}
