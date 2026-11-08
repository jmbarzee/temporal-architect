package server

import (
	"fmt"
	"path/filepath"
	"strings"

	protocol "github.com/jmbarzee/glsp/protocol_3_16"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// sdkNames are the SDKs' display names.
var sdkNames = map[string]string{
	"go": "Go", "typescript": "TypeScript", "python": "Python", "java": "Java",
	"dotnet": ".NET", "ruby": "Ruby", "php": "PHP", "rust": "Rust",
	"swift": "Swift", "haskell": "Haskell", "clojure": "Clojure", "perl": "Perl", "erlang": "Erlang", "elixir": "Elixir",
}

// sdkAt returns the `@sdk` annotation on a 1-based line, and its worker.
func sdkAt(file *ast.File, line int) (*ast.WorkerDef, *ast.WorkerSDK) {
	if file == nil {
		return nil, nil
	}
	for _, def := range file.Definitions {
		if w, ok := def.(*ast.WorkerDef); ok {
			for i := range w.SDKs {
				if w.SDKs[i].Line == line {
					return w, &w.SDKs[i]
				}
			}
		}
	}
	return nil, nil
}

// sdkHover describes an `@sdk` annotation.
func sdkHover(w *ast.WorkerDef, s *ast.WorkerSDK) string {
	text := fmt.Sprintf("Worker `%s` is implemented in the %s SDK", w.Name, sdkNames[s.SDK])
	if s.Impl == "" {
		return text + "; no code yet. Its workflows, activities and services take this SDK."
	}
	return text + fmt.Sprintf(", entry file `%s` (from the module root, else this file's directory). Its workflows, activities and services take this SDK.", s.Impl)
}

// implLocation is the entry file an `@sdk` path names, when the cursor is on
// the path string and the file exists.
func implLocation(doc *Document, cursor protocol.Position) (protocol.Location, bool) {
	line := int(cursor.Line) + 1
	_, s := sdkAt(doc.File, line)
	path := uriToPath(doc.URI)
	if s == nil || s.Impl == "" || path == "" {
		return protocol.Location{}, false
	}
	col := byteColumn(lineText(doc.lines(), line), cursor.Character)
	if col < s.ImplPos.Column || col > s.ImplPos.Column+len(s.Impl)+1 {
		return protocol.Location{}, false
	}
	target := pipeline.ImplFile(path, s.Impl)
	if !pipeline.IsFile(target) {
		return protocol.Location{}, false
	}
	return protocol.Location{URI: pathToURI(filepath.ToSlash(target))}, true
}

// annotationCompletions completes an annotation line typed up to the cursor:
// the annotation's name after '@', and an SDK as `@sdk`'s first argument. ok
// is false off an annotation line.
func annotationCompletions(prefix string) (items []protocol.CompletionItem, ok bool) {
	typed, ok := strings.CutPrefix(strings.TrimLeft(prefix, " \t"), "@")
	if !ok {
		return nil, false
	}
	if isNamePrefix(typed) {
		return []protocol.CompletionItem{keywordItem("sdk", "Declare an SDK implementing this worker, and its entry file")}, true
	}
	if arg, found := strings.CutPrefix(typed, "sdk("); found && isNamePrefix(strings.TrimLeft(arg, " ")) {
		for _, sdk := range ast.SDKs {
			kind := protocol.CompletionItemKindEnumMember
			detail := sdkNames[sdk] + " SDK"
			items = append(items, protocol.CompletionItem{Label: sdk, Kind: &kind, Detail: &detail})
		}
	}
	return items, true
}

// isNamePrefix reports whether s could begin an identifier: letters, digits
// and underscores, possibly none.
func isNamePrefix(s string) bool {
	return strings.Trim(s, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_") == ""
}
