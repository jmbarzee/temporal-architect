package server

import (
	"github.com/jmbarzee/glsp"
	protocol "github.com/jmbarzee/glsp/protocol_3_16"
)

func definitionHandler(store *DocumentStore) protocol.TextDocumentDefinitionFunc {
	return func(context *glsp.Context, params *protocol.DefinitionParams) (any, error) {
		if doc, ok := store.Get(params.TextDocument.URI); ok {
			if loc, ok := implLocation(doc, params.Position); ok {
				return loc, nil
			}
		}
		_, occs, at, ok := occurrenceAt(store, params.TextDocument.URI, params.Position)
		if !ok {
			return nil, nil
		}
		for _, o := range occs {
			if o.isDecl && o.decl == at.decl {
				if loc, fresh := newSources(store, params.TextDocument.URI).location(o); fresh {
					return loc, nil
				}
			}
		}
		return nil, nil
	}
}
