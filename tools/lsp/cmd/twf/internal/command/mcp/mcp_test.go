package mcp

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/spec"
	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

// cleanTWF is a known-good fixture (one activity, one workflow), relative to
// this package dir (cmd/twf/internal/command/mcp -> cmd/twf/testdata).
const cleanTWF = "../../../testdata/clean.twf"

// connect wires the server and a client over in-memory transports and returns
// the connected client session.
func connect(t *testing.T) *sdk.ClientSession {
	t.Helper()
	ctx := context.Background()

	server, err := newServer("test")
	if err != nil {
		t.Fatalf("newServer: %v", err)
	}

	serverT, clientT := sdk.NewInMemoryTransports()
	ss, err := server.Connect(ctx, serverT, nil)
	if err != nil {
		t.Fatalf("server connect: %v", err)
	}
	t.Cleanup(func() { ss.Close() })

	client := sdk.NewClient(&sdk.Implementation{Name: "test-client", Version: "v0"}, nil)
	cs, err := client.Connect(ctx, clientT, nil)
	if err != nil {
		t.Fatalf("client connect: %v", err)
	}
	t.Cleanup(func() { cs.Close() })

	return cs
}

func callTool(t *testing.T, cs *sdk.ClientSession, name string, args map[string]any) *sdk.CallToolResult {
	t.Helper()
	res, err := cs.CallTool(context.Background(), &sdk.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		t.Fatalf("call %s: %v", name, err)
	}
	return res
}

// toolText returns the first text-content block of a tool result, failing if
// the result is an error or has no text content.
func toolText(t *testing.T, res *sdk.CallToolResult) string {
	t.Helper()
	if res.IsError {
		msg := ""
		if len(res.Content) > 0 {
			if tc, ok := res.Content[0].(*sdk.TextContent); ok {
				msg = tc.Text
			}
		}
		t.Fatalf("tool returned error result: %s", msg)
	}
	if len(res.Content) == 0 {
		t.Fatal("tool result has no content")
	}
	tc, ok := res.Content[0].(*sdk.TextContent)
	if !ok {
		t.Fatalf("tool result content is not text: %T", res.Content[0])
	}
	return tc.Text
}

func TestListTools(t *testing.T) {
	cs := connect(t)

	res, err := cs.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}

	got := make(map[string]bool, len(res.Tools))
	for _, tool := range res.Tools {
		got[tool.Name] = true
	}

	want := []string{
		"twf_check", "twf_parse", "twf_symbols", "twf_graph",
		"twf_graph_chunks", "twf_spec_list", "twf_spec_get",
	}
	for _, name := range want {
		if !got[name] {
			t.Errorf("missing tool %q (have %v)", name, got)
		}
	}
}

func TestCheckTool(t *testing.T) {
	cs := connect(t)

	res := callTool(t, cs, "twf_check", map[string]any{"paths": []string{cleanTWF}})
	var env struct {
		Summary struct {
			Workflows  int `json:"workflows"`
			Activities int `json:"activities"`
			Errors     int `json:"errors"`
		} `json:"summary"`
		Diagnostics []any `json:"diagnostics"`
	}
	if err := json.Unmarshal([]byte(toolText(t, res)), &env); err != nil {
		t.Fatalf("decode check envelope: %v", err)
	}
	if env.Summary.Errors != 0 {
		t.Errorf("clean.twf reported %d errors, want 0", env.Summary.Errors)
	}
	if env.Summary.Workflows != 1 || env.Summary.Activities != 1 {
		t.Errorf("summary = %d workflows / %d activities, want 1/1", env.Summary.Workflows, env.Summary.Activities)
	}
}

func TestParseToolMatchesBuilder(t *testing.T) {
	cs := connect(t)

	res := callTool(t, cs, "twf_parse", map[string]any{"paths": []string{cleanTWF}})
	got := toolText(t, res)

	// The tool must return byte-identical output to the shared builder the CLI
	// also uses, proving the single-code-path contract.
	want, err := buildParse(filesInput{Paths: []string{cleanTWF}})
	if err != nil {
		t.Fatalf("buildParse: %v", err)
	}
	if got != string(want) {
		t.Errorf("twf_parse output diverged from buildParse\n got: %s\nwant: %s", got, want)
	}
}

func TestInlineSource(t *testing.T) {
	cs := connect(t)

	const src = "activity Charge(amt: Money) -> (Receipt):\n  return ok\n\nworkflow Pay(amt: Money) -> (Receipt):\n  activity Charge(amt) -> r\n  return r\n"

	res := callTool(t, cs, "twf_symbols", map[string]any{"source": src})
	var env struct {
		Summary struct {
			Errors int `json:"errors"`
		} `json:"summary"`
		Symbols []struct {
			Kind string `json:"kind"`
			Name string `json:"name"`
		} `json:"symbols"`
	}
	if err := json.Unmarshal([]byte(toolText(t, res)), &env); err != nil {
		t.Fatalf("decode symbols envelope: %v", err)
	}
	if env.Summary.Errors != 0 {
		t.Errorf("inline source reported %d errors, want 0", env.Summary.Errors)
	}
	if len(env.Symbols) != 2 {
		t.Fatalf("got %d symbols from inline source, want 2: %+v", len(env.Symbols), env.Symbols)
	}

	// Neither paths nor source -> tool error.
	bad := callTool(t, cs, "twf_check", map[string]any{})
	if !bad.IsError {
		t.Error("twf_check with no paths and no source should be a tool error")
	}
}

func TestSymbolsTool(t *testing.T) {
	cs := connect(t)

	res := callTool(t, cs, "twf_symbols", map[string]any{"paths": []string{cleanTWF}})
	var env struct {
		Symbols []struct {
			Kind string `json:"kind"`
			Name string `json:"name"`
		} `json:"symbols"`
	}
	if err := json.Unmarshal([]byte(toolText(t, res)), &env); err != nil {
		t.Fatalf("decode symbols envelope: %v", err)
	}
	if len(env.Symbols) != 2 {
		t.Fatalf("got %d symbols, want 2: %+v", len(env.Symbols), env.Symbols)
	}
}

func TestGraphAndChunksTools(t *testing.T) {
	cs := connect(t)

	for _, name := range []string{"twf_graph", "twf_graph_chunks"} {
		res := callTool(t, cs, name, map[string]any{"paths": []string{cleanTWF}})
		text := toolText(t, res)
		var env map[string]json.RawMessage
		if err := json.Unmarshal([]byte(text), &env); err != nil {
			t.Fatalf("%s: decode envelope: %v", name, err)
		}
		if _, ok := env["summary"]; !ok {
			t.Errorf("%s: envelope missing summary", name)
		}
	}
}

func TestSpecTools(t *testing.T) {
	cs := connect(t)

	listRes := callTool(t, cs, "twf_spec_list", map[string]any{})
	var entries []struct {
		Slug  string `json:"slug"`
		Title string `json:"title"`
	}
	if err := json.Unmarshal([]byte(toolText(t, listRes)), &entries); err != nil {
		t.Fatalf("decode spec list: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("twf_spec_list returned no sections")
	}

	slug := entries[0].Slug
	getRes := callTool(t, cs, "twf_spec_get", map[string]any{"slug": slug})
	if got := toolText(t, getRes); got == "" {
		t.Errorf("twf_spec_get(%q) returned empty content", slug)
	}

	// Unknown slug -> tool error.
	bad, err := cs.CallTool(context.Background(), &sdk.CallToolParams{
		Name:      "twf_spec_get",
		Arguments: map[string]any{"slug": "no-such-section"},
	})
	if err != nil {
		t.Fatalf("call twf_spec_get: %v", err)
	}
	if !bad.IsError {
		t.Error("twf_spec_get with unknown slug should be a tool error")
	}
}

func TestSpecResources(t *testing.T) {
	cs := connect(t)
	ctx := context.Background()

	listRes, err := cs.ListResources(ctx, nil)
	if err != nil {
		t.Fatalf("list resources: %v", err)
	}
	uris := make(map[string]bool, len(listRes.Resources))
	for _, r := range listRes.Resources {
		uris[r.URI] = true
	}
	if !uris[specURIRoot] {
		t.Errorf("missing full-spec resource %q", specURIRoot)
	}

	sections, err := spec.Sections()
	if err != nil {
		t.Fatalf("spec.Sections: %v", err)
	}
	sectionURI := specURIRoot + "/" + sections[0].Slug
	if !uris[sectionURI] {
		t.Errorf("missing section resource %q", sectionURI)
	}

	read, err := cs.ReadResource(ctx, &sdk.ReadResourceParams{URI: sectionURI})
	if err != nil {
		t.Fatalf("read resource %q: %v", sectionURI, err)
	}
	if len(read.Contents) == 0 || read.Contents[0].Text == "" {
		t.Errorf("resource %q returned no content", sectionURI)
	}
	if mt := read.Contents[0].MIMEType; mt != specMIME {
		t.Errorf("resource MIME = %q, want %q", mt, specMIME)
	}
}
