package graph_test

import (
	"encoding/json"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/clitest"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	graphcmd "github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/command/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// runGraph drives the assembled `graph` command (with its `chunks` child) with
// raw args and returns the process exit code, mirroring how main invokes it.
func runGraph(args []string) int {
	cmd := graphcmd.New()
	cmd.SetArgs(args)
	return cmdutil.Exec(cmd)
}

// ---------------------------------------------------------------------------
// graph --history — acceptance test
// ---------------------------------------------------------------------------

func TestGraphCommand_HistoryJSON(t *testing.T) {
	out, err := clitest.CaptureStdout(func() {
		code := runGraph([]string{"--history", clitest.Testdata("sample"), "--json"})
		if code != 0 {
			t.Errorf("graph exit code = %d, want 0", code)
		}
	})
	if err != nil {
		t.Fatalf("CaptureStdout: %v", err)
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
	code := runGraph([]string{"--history", clitest.Testdata("sample"), "some.twf"})
	if code == 0 {
		t.Error("expected non-zero exit when --history and file args both present")
	}
}

// ---------------------------------------------------------------------------
// Text mode smoke test
// ---------------------------------------------------------------------------

func TestGraphCommand_HistoryText(t *testing.T) {
	out, err := clitest.CaptureStdout(func() {
		code := runGraph([]string{"--history", clitest.Testdata("sample")})
		if code != 0 {
			t.Errorf("graph text mode exit code = %d, want 0", code)
		}
	})
	if err != nil {
		t.Fatalf("CaptureStdout: %v", err)
	}
	if len(out) == 0 {
		t.Error("text output is empty")
	}
}
