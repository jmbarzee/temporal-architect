package server

import (
	"encoding/json"
	"fmt"
	"maps"
	"path/filepath"
	"slices"
	"strings"

	"github.com/jmbarzee/glsp"
	protocol "github.com/jmbarzee/glsp/protocol_3_16"
	"github.com/jmbarzee/temporal-architect/tools/lsp/internal/modinit"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/module"
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
	for _, path := range modinit.Suggest(home, []modinit.Source{modinit.Imports, modinit.Git}, store.Overlays()) {
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
// client without dynamic registration rejects it, harmlessly.) A twf.mod
// outside every folder is watched by watchModuleFilesOutsideFolders.
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

// outsideWatch is the registered watch on twf.mod files outside every folder.
type outsideWatch struct {
	supported bool     // the client takes relative patterns
	dirs      []string // the watched directories
	id        string   // the registration, "" when none
	n         int      // registrations made
}

// relativeWatcher is an LSP 3.17 FileSystemWatcher with a RelativePattern,
// which the protocol_3_16 types cannot spell.
type relativeWatcher struct {
	GlobPattern struct {
		BaseURI string `json:"baseUri"`
		Pattern string `json:"pattern"`
	} `json:"globPattern"`
}

// watchModuleFilesOutsideFolders watches the twf.mod files that decide an open
// buffer's module but lie outside every workspace folder, where `**/twf.mod`
// does not reach: one non-recursive watcher per directory (moduleDirsOutside),
// re-registered when that set changes. It needs a client that takes relative
// patterns; without one, a change there is seen on the next buffer change,
// since modules are rediscovered on every analysis.
func watchModuleFilesOutsideFolders(context *glsp.Context, store *DocumentStore) {
	store.mu.Lock()
	w := &store.outside
	if !w.supported || context.Call == nil {
		store.mu.Unlock()
		return
	}
	var files []string
	for _, d := range store.all() {
		if d.sourceFile != "" {
			files = append(files, filepath.FromSlash(d.sourceFile))
		}
	}
	dirs := moduleDirsOutside(store.folders, files)
	if slices.Equal(dirs, w.dirs) {
		store.mu.Unlock()
		return
	}
	old := w.id
	w.dirs, w.id = dirs, ""
	if len(dirs) > 0 {
		w.n++
		w.id = fmt.Sprintf("twf-mod-watch-outside-%d", w.n)
	}
	id := w.id
	store.mu.Unlock()

	watchers := make([]relativeWatcher, len(dirs))
	for i, dir := range dirs {
		watchers[i].GlobPattern.BaseURI = pathToURI(filepath.ToSlash(dir))
		watchers[i].GlobPattern.Pattern = module.FileName
	}
	method := string(protocol.MethodWorkspaceDidChangeWatchedFiles)
	call := context.Call
	go func() {
		if id != "" {
			call(protocol.ServerClientRegisterCapability, protocol.RegistrationParams{
				Registrations: []protocol.Registration{{ID: id, Method: method, RegisterOptions: map[string]any{"watchers": watchers}}},
			}, nil)
		}
		if old != "" {
			call(protocol.ServerClientUnregisterCapability, protocol.UnregistrationParams{
				Unregisterations: []protocol.Unregistration{{ID: old, Method: method}},
			}, nil)
		}
	}()
}

// moduleDirsOutside lists, sorted, the directories outside every folder whose
// twf.mod decides the module of one of files (canonical paths): each from the
// file's directory up to its module root, else up to the filesystem root —
// stopping below the temp root, where a twf.mod is ignored.
func moduleDirsOutside(folders []string, files []string) []string {
	var roots []string
	for _, f := range folders {
		roots = append(roots, strings.TrimSuffix(pipeline.Canonicalize(f), string(filepath.Separator)))
	}
	inFolder := func(dir string) bool {
		for _, r := range roots {
			if dir == r || strings.HasPrefix(dir, r+string(filepath.Separator)) {
				return true
			}
		}
		return false
	}
	temp := pipeline.TempRoot()
	set := map[string]bool{}
	for _, file := range files {
		dir := filepath.Dir(file)
		root, _, _ := pipeline.ModuleOf(dir)
		for dir != temp {
			if !inFolder(dir) {
				set[dir] = true
			}
			parent := filepath.Dir(dir)
			if dir == root || parent == dir {
				break
			}
			dir = parent
		}
	}
	return slices.Sorted(maps.Keys(set))
}

// relativePatternSupport reports whether an initialize request's client takes
// relative glob patterns in dynamically registered file watchers, which the
// protocol types do not decode.
func relativePatternSupport(params json.RawMessage) bool {
	var p struct {
		Capabilities struct {
			Workspace struct {
				DidChangeWatchedFiles struct {
					DynamicRegistration    bool `json:"dynamicRegistration"`
					RelativePatternSupport bool `json:"relativePatternSupport"`
				} `json:"didChangeWatchedFiles"`
			} `json:"workspace"`
		} `json:"capabilities"`
	}
	if json.Unmarshal(params, &p) != nil {
		return false
	}
	w := p.Capabilities.Workspace.DidChangeWatchedFiles
	return w.DynamicRegistration && w.RelativePatternSupport
}

// SetRelativePatterns records whether the client takes relative glob patterns.
// Safe for concurrent use.
func (s *DocumentStore) SetRelativePatterns(supported bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.outside.supported = supported
}
