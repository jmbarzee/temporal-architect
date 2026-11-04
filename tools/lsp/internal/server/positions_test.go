package server

import (
	"os"
	"path/filepath"
	"testing"
)

// TestClosedURIUsesDeepestFolder: a closed file under nested workspace folders
// is spelled through the deepest one, whatever order the folders come in.
func TestClosedURIUsesDeepestFolder(t *testing.T) {
	outer := t.TempDir()
	if err := os.MkdirAll(filepath.Join(outer, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	inner := filepath.Join(t.TempDir(), "link") // the inner folder, opened through a symlink
	if err := os.Symlink(filepath.Join(outer, "sub"), inner); err != nil {
		t.Skipf("no symlinks: %v", err)
	}
	file := canonical(filepath.Join(outer, "sub", "a.twf"))
	want := pathToURI(filepath.ToSlash(inner) + "/a.twf")
	for _, folders := range [][]string{{outer, inner}, {inner, outer}} {
		store := NewDocumentStore()
		store.SetFolders(folders)
		if got := newSources(store, "").closedURI(file); got != want {
			t.Errorf("folders %v: closedURI = %s, want %s", folders, got, want)
		}
	}
}
