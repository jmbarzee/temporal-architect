package server

import (
	"os"
	"path/filepath"
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

	actions := createModuleFileActions(store, doc, &protocol.CodeActionParams{Range: posToRange(1, 1)})
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
	if actions := createModuleFileActions(store, doc, &protocol.CodeActionParams{Range: posToRange(1, 1)}); len(actions) != 0 {
		t.Errorf("offered %+v above a repository", actions)
	}
}
