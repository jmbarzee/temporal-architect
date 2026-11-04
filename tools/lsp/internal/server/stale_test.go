package server

import (
	"os"
	"testing"

	protocol "github.com/jmbarzee/glsp/protocol_3_16"
)

// TestRenameRefusesStaleClosedFile: a closed file that changed on disk after
// the run read it, without the client reporting it, gets no edits at stale
// positions: rename fails, references drop its spellings, and definition
// finds nothing there. Once the change is reported, rename reaches it again.
func TestRenameRefusesStaleClosedFile(t *testing.T) {
	const closed = "activity Do(x: string):\n    do(x)\n"
	const open = "workflow W(x: string):\n    activity Do(x)\n    close complete()\n"
	for _, tt := range []struct {
		name   string
		change func(path string) error
	}{
		{"modified", func(path string) error { return os.WriteFile(path, []byte("# one\n# two\n"+closed), 0o644) }},
		{"deleted", os.Remove},
	} {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			closedPath, _ := writeTWF(t, dir, "a.twf", closed)
			_, uri := writeTWF(t, dir, "b.twf", open)
			store := NewDocumentStore()
			store.SetFolders([]string{dir})
			store.Open(uri, open)
			at := protocol.TextDocumentPositionParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: uri},
				Position:     wordAt(t, open, 1, "Do", 0),
			}
			if err := tt.change(closedPath); err != nil {
				t.Fatal(err)
			}

			if edit, err := renameHandler(store)(nil, &protocol.RenameParams{TextDocumentPositionParams: at, NewName: "Renamed"}); err == nil || edit != nil {
				t.Errorf("rename over a stale file = %+v, %v; want an error", edit, err)
			}
			refs, err := referencesHandler(store)(nil, &protocol.ReferenceParams{
				TextDocumentPositionParams: at,
				Context:                    protocol.ReferenceContext{IncludeDeclaration: true},
			})
			if err != nil || len(refs) != 1 || refs[0].URI != uri {
				t.Errorf("references = %+v (err %v), want only the open buffer's", refs, err)
			}
			if def, err := definitionHandler(store)(nil, &protocol.DefinitionParams{TextDocumentPositionParams: at}); err != nil || def != nil {
				t.Errorf("definition into a stale file = %+v, %v; want nothing", def, err)
			}

			if tt.name != "modified" {
				return
			}
			store.Reanalyze() // what didChangeWatchedFiles does
			edit, err := renameHandler(store)(nil, &protocol.RenameParams{TextDocumentPositionParams: at, NewName: "Renamed"})
			if err != nil || edit == nil || len(edit.Changes) != 2 {
				t.Fatalf("rename after the change is reported = %+v, %v; want edits to both files", edit, err)
			}
			for u, edits := range edit.Changes {
				if u != uri && (len(edits) != 1 || edits[0].Range.Start.Line != 2) {
					t.Errorf("edits to %s = %+v, want the moved declaration on line 2", u, edits)
				}
			}
		})
	}
}
