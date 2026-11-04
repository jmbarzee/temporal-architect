package server

import (
	"fmt"

	"github.com/jmbarzee/glsp"
	protocol "github.com/jmbarzee/glsp/protocol_3_16"
)

func renameHandler(store *DocumentStore) protocol.TextDocumentRenameFunc {
	return func(context *glsp.Context, params *protocol.RenameParams) (*protocol.WorkspaceEdit, error) {
		occs, at, ok := occurrenceAt(store, params.TextDocument.URI, params.Position)
		if !ok {
			return nil, nil
		}
		src := newSources(store, params.TextDocument.URI)
		changes := map[string][]protocol.TextEdit{}
		for _, o := range occs {
			if o.decl != at.decl {
				continue
			}
			loc, fresh := src.location(o)
			if !fresh {
				return nil, fmt.Errorf("%s changed on disk since it was analyzed; save or reopen it and rename again", loc.URI)
			}
			changes[loc.URI] = append(changes[loc.URI], protocol.TextEdit{Range: loc.Range, NewText: params.NewName})
		}
		return &protocol.WorkspaceEdit{Changes: changes}, nil
	}
}

func prepareRenameHandler(store *DocumentStore) protocol.TextDocumentPrepareRenameFunc {
	return func(context *glsp.Context, params *protocol.PrepareRenameParams) (any, error) {
		_, at, ok := occurrenceAt(store, params.TextDocument.URI, params.Position)
		if !ok {
			return nil, nil
		}
		loc, _ := newSources(store, params.TextDocument.URI).location(at)
		return loc.Range, nil
	}
}
