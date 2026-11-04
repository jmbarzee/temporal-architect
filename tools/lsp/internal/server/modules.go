package server

import (
	"fmt"
	"path/filepath"

	"github.com/jmbarzee/glsp"
	protocol "github.com/jmbarzee/glsp/protocol_3_16"
	"github.com/jmbarzee/temporal-architect/tools/lsp/internal/modinit"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// createModuleFileCommand writes a twf.mod: arguments are the canonical
// directory and the module path its code action's title showed.
const createModuleFileCommand = "twf.createModuleFile"

// createModuleFileActions offers, on a PACKAGE_OUTSIDE_MODULE in range, one
// action per suggested module path for a twf.mod at the buffer's home folder
// root. None is offered without a home folder, at the temp root, above several
// repositories, or when nothing but a placeholder could be suggested.
func createModuleFileActions(store *DocumentStore, doc *Document, params *protocol.CodeActionParams) []protocol.CodeAction {
	var diag *resolver.ResolveError
	for _, e := range doc.ResolveErrs {
		if e.Kind == resolver.ErrPackageOutsideModule && rangesOverlap(params.Range, posToRange(doc.lines(), e.Line, e.Column)) {
			diag = e
			break
		}
	}
	bufPath := uriToPath(doc.URI)
	if diag == nil || bufPath == "" {
		return nil
	}
	canon := pipeline.Canonicalize(bufPath)
	home := homeFolder(store.Folders(), canon)
	if home == "" || home == pipeline.TempRoot() || !modinit.InRepositoryOrAlone(home) {
		return nil
	}
	where := ""
	if home != filepath.Dir(canon) {
		where = " in " + filepath.Base(home) + "/"
	}
	var actions []protocol.CodeAction
	for _, path := range modinit.Suggest(home, []modinit.Source{modinit.Imports, modinit.Git}) {
		title := fmt.Sprintf("Create twf.mod%s (module %s)", where, path)
		actions = append(actions, protocol.CodeAction{
			Title:   title,
			Kind:    ptrTo(protocol.CodeActionKindQuickFix),
			Command: &protocol.Command{Title: title, Command: createModuleFileCommand, Arguments: []any{home, path}},
		})
	}
	return actions
}

// executeCommandHandler runs createModuleFileCommand: it writes the twf.mod
// it was given, unchanged and never overwriting, then re-analyzes every open
// buffer. A failure is shown to the user.
func executeCommandHandler(store *DocumentStore) protocol.WorkspaceExecuteCommandFunc {
	return func(context *glsp.Context, params *protocol.ExecuteCommandParams) (any, error) {
		if params.Command != createModuleFileCommand {
			return nil, fmt.Errorf("unknown command %q", params.Command)
		}
		var dir, path string
		if len(params.Arguments) == 2 {
			dir, _ = params.Arguments[0].(string)
			path, _ = params.Arguments[1].(string)
		}
		if dir == "" || path == "" {
			return nil, fmt.Errorf("%s takes a directory and a module path", createModuleFileCommand)
		}
		if !isFolder(store.Folders(), dir) {
			return nil, fmt.Errorf("%s writes only at a workspace folder's root, not %s", createModuleFileCommand, dir)
		}
		if err := modinit.Create(dir, path); err != nil {
			context.Notify(protocol.ServerWindowShowMessage, protocol.ShowMessageParams{
				Type:    protocol.MessageTypeError,
				Message: "Create twf.mod: " + err.Error(),
			})
			return nil, nil
		}
		store.Reanalyze()
		return nil, publishAll(context, store)
	}
}

// didChangeWatchedFilesHandler re-analyzes every open buffer when a twf.mod or
// a .twf file changes on disk: a buffer's run reads closed files and twf.mod
// from disk, and modules are rediscovered on every analysis.
func didChangeWatchedFilesHandler(store *DocumentStore) protocol.WorkspaceDidChangeWatchedFilesFunc {
	return func(context *glsp.Context, params *protocol.DidChangeWatchedFilesParams) error {
		store.Reanalyze()
		return publishAll(context, store)
	}
}

// isFolder reports whether dir is one of the workspace folders.
func isFolder(folders []string, dir string) bool {
	c := pipeline.Canonicalize(dir)
	for _, f := range folders {
		if pipeline.Canonicalize(f) == c {
			return true
		}
	}
	return false
}

// watchModuleFiles asks the client to report changes to any twf.mod or .twf
// file. The request runs in the background: a handler must not wait on the
// client. (The LSP 3.17 capability types drop `didChangeWatchedFiles`, so a
// client without dynamic registration rejects it, harmlessly.) A file above
// every folder is not watched; edits there are seen on the next buffer change.
func watchModuleFiles(context *glsp.Context) {
	go context.Call(protocol.ServerClientRegisterCapability, protocol.RegistrationParams{
		Registrations: []protocol.Registration{{
			ID:     "twf-mod-watch",
			Method: string(protocol.MethodWorkspaceDidChangeWatchedFiles),
			RegisterOptions: protocol.DidChangeWatchedFilesRegistrationOptions{
				Watchers: []protocol.FileSystemWatcher{{GlobPattern: "**/twf.mod"}, {GlobPattern: "**/*.twf"}},
			},
		}},
	}, nil)
}
