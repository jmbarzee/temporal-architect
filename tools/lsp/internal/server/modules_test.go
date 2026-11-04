package server

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/jmbarzee/glsp"
	protocol "github.com/jmbarzee/glsp/protocol_3_16"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

func TestCreateModuleFileAction(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".git", "config"), []byte("[remote \"origin\"]\n\turl = git@github.com:org/repo.git\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	buf := "package fabric\n\nworkflow W():\n    activity Ghost()\n"
	_, uri := writeTWF(t, dir, "fabric/f.twf", buf)

	store := NewDocumentStore()
	store.SetFolders([]string{dir})
	doc := store.Open(uri, buf)

	actions := createModuleFileActions(store, doc, &protocol.CodeActionParams{Range: posToRange(nil, 1, 1)})
	if len(actions) != 1 {
		t.Fatalf("got %d actions, want 1: %+v", len(actions), actions)
	}
	want := "Create twf.mod in " + filepath.Base(pipeline.Canonicalize(dir)) + "/ (module github.com/org/repo)"
	if actions[0].Title != want {
		t.Errorf("title = %q, want %q", actions[0].Title, want)
	}

	var shown []string
	ctx := &glsp.Context{Notify: func(method string, params any) {
		if p, ok := params.(protocol.ShowMessageParams); ok {
			shown = append(shown, p.Message)
		}
	}}
	cmd := actions[0].Command
	if _, err := executeCommandHandler(store)(ctx, &protocol.ExecuteCommandParams{Command: cmd.Command, Arguments: cmd.Arguments}); err != nil {
		t.Fatal(err)
	}
	if data, err := os.ReadFile(filepath.Join(dir, "twf.mod")); err != nil || string(data) != "module github.com/org/repo\n" {
		t.Fatalf("twf.mod = %q, %v", data, err)
	}
	if hasKind(doc.ResolveErrs, resolver.ErrPackageOutsideModule) || !hasKind(doc.ResolveErrs, resolver.ErrUndefinedActivity) {
		t.Errorf("after creating twf.mod the buffer is in a module: %v", doc.ResolveErrs)
	}

	// Running it again never overwrites; the failure is shown.
	if _, err := executeCommandHandler(store)(ctx, &protocol.ExecuteCommandParams{Command: cmd.Command, Arguments: cmd.Arguments}); err != nil {
		t.Fatal(err)
	}
	if len(shown) != 1 || !strings.Contains(shown[0], "already exists") {
		t.Errorf("shown = %q", shown)
	}
}

func TestCreateModuleFileActionNotOfferedAboveRepositories(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "repo", ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	buf := "package fabric\n"
	_, uri := writeTWF(t, dir, "fabric/f.twf", buf)
	store := NewDocumentStore()
	store.SetFolders([]string{dir})
	doc := store.Open(uri, buf)
	if actions := createModuleFileActions(store, doc, &protocol.CodeActionParams{Range: posToRange(nil, 1, 1)}); len(actions) != 0 {
		t.Errorf("offered %+v above a repository", actions)
	}
}

func TestCreateModuleFileCommandOnlyAtAFolderRoot(t *testing.T) {
	dir := t.TempDir()
	store := NewDocumentStore()
	store.SetFolders([]string{filepath.Join(dir, "ws")})
	ctx := &glsp.Context{Notify: func(string, any) {}}
	_, err := executeCommandHandler(store)(ctx, &protocol.ExecuteCommandParams{Command: createModuleFileCommand, Arguments: []any{dir, "demo"}})
	if err == nil {
		t.Error("a directory that is not a workspace folder must be refused")
	}
	if _, statErr := os.Stat(filepath.Join(dir, "twf.mod")); statErr == nil {
		t.Error("twf.mod was written")
	}
}

// TestCreateModuleFileActionReadsOpenBuffers: the suggestion reads an open
// buffer's text, here an unsaved file whose import is the only source.
func TestCreateModuleFileActionReadsOpenBuffers(t *testing.T) {
	dir := t.TempDir()
	writeTWF(t, dir, "orders/o.twf", "package orders\n")
	buf := "package fabric\n\nimport \"example.com/acme/orders\"\n"
	store := NewDocumentStore()
	store.SetFolders([]string{dir})
	doc := store.Open("file://"+filepath.Join(dir, "fabric", "f.twf"), buf)
	actions := createModuleFileActions(store, doc, &protocol.CodeActionParams{Range: posToRange(nil, 1, 1)})
	want := "Create twf.mod in " + filepath.Base(pipeline.Canonicalize(dir)) + "/ (module example.com/acme)"
	if len(actions) != 1 || actions[0].Title != want {
		t.Errorf("got %+v, want one action %q", actions, want)
	}
}

// TestWatchModuleFilesOutsideFolders: with a client that takes relative
// patterns, a module root above every folder is watched; a twf.mod change
// there re-analyzes; the watch follows the open buffers.
func TestWatchModuleFilesOutsideFolders(t *testing.T) {
	dir := t.TempDir()
	writeModule(t, dir, "example.com/m")
	buf := "workflow W():\n    close complete(\"ok\")\n"
	_, uri := writeTWF(t, dir, "peer/p.twf", buf)

	type call struct {
		method string
		params any
	}
	calls := make(chan call, 8)
	p := published{}
	ctx := p.context()
	ctx.Call = func(method string, params, _ any) { calls <- call{method, params} }

	store := NewDocumentStore()
	store.SetFolders([]string{filepath.Join(dir, "peer")})
	store.SetRelativePatterns(true)
	store.Open(uri, buf)
	if err := publishAll(ctx, store); err != nil {
		t.Fatal(err)
	}
	c := <-calls
	reg, ok := c.params.(protocol.RegistrationParams)
	if c.method != protocol.ServerClientRegisterCapability || !ok || len(reg.Registrations) != 1 {
		t.Fatalf("got %s %+v, want one registration", c.method, c.params)
	}
	watchers := reg.Registrations[0].RegisterOptions.(map[string]any)["watchers"].([]relativeWatcher)
	if len(watchers) != 1 || watchers[0].GlobPattern.BaseURI != pathToURI(canonical(dir)) || watchers[0].GlobPattern.Pattern != "twf.mod" {
		t.Errorf("watchers = %+v, want the module root's twf.mod", watchers)
	}

	// A twf.mod change there is seen when the client reports it.
	writeFile(t, filepath.Join(dir, "twf.mod"), "modul x\n")
	if err := didChangeWatchedFilesHandler(store)(ctx, &protocol.DidChangeWatchedFilesParams{}); err != nil {
		t.Fatal(err)
	}
	wantCodes(t, p, "the buffer", uri, "1:MODULE_FILE_INVALID")
	if store.outside.n != 1 {
		t.Errorf("re-registered %d times with the same directories", store.outside.n)
	}

	// With no buffer open, the watch is dropped.
	store.Close(uri)
	if err := publishAll(ctx, store); err != nil {
		t.Fatal(err)
	}
	c = <-calls
	if unreg, ok := c.params.(protocol.UnregistrationParams); c.method != protocol.ServerClientUnregisterCapability || !ok || unreg.Unregisterations[0].ID != reg.Registrations[0].ID {
		t.Errorf("got %s %+v, want the registration dropped", c.method, c.params)
	}

	// Without relative-pattern support nothing is registered.
	store = NewDocumentStore()
	store.SetFolders([]string{filepath.Join(dir, "peer")})
	store.Open(uri, buf)
	if err := publishAll(ctx, store); err != nil {
		t.Fatal(err)
	}
	if store.outside.n != 0 {
		t.Error("registered relative patterns with a client that does not take them")
	}
}

// TestModuleDirsOutside: with no module, every directory from the buffer's up
// to the temp root, outside the folder, decides its module.
func TestModuleDirsOutside(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(pipeline.Canonicalize(dir), "ws", "a", "x.twf")
	got := moduleDirsOutside([]string{filepath.Join(dir, "ws")}, []string{file})
	want := []string{filepath.Dir(pipeline.Canonicalize(dir)), pipeline.Canonicalize(dir)}
	if !slices.Equal(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestRelativePatternSupport(t *testing.T) {
	for raw, want := range map[string]bool{
		`{"capabilities":{"workspace":{"didChangeWatchedFiles":{"dynamicRegistration":true,"relativePatternSupport":true}}}}`: true,
		`{"capabilities":{"workspace":{"didChangeWatchedFiles":{"dynamicRegistration":true}}}}`:                               false,
		`{"capabilities":{}}`: false,
	} {
		if got := relativePatternSupport([]byte(raw)); got != want {
			t.Errorf("%s: got %v, want %v", raw, got, want)
		}
	}
}

// TestCallQueueKeepsOrder: queued client calls run one at a time, in order.
func TestCallQueueKeepsOrder(t *testing.T) {
	var q callQueue
	got := make(chan int, 100)
	for i := range 100 {
		q.push(func() { got <- i })
	}
	for want := range 100 {
		if i := <-got; i != want {
			t.Fatalf("call %d ran at position %d", i, want)
		}
	}
}
