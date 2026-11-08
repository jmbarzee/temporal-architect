package server

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	protocol "github.com/jmbarzee/glsp/protocol_3_16"
)

const sdkSource = "@sdk(go, \"cmd/w/main.go\")\n@sdk(typescript)\nworker w:\n\tactivity A\n\nactivity A():\n\treturn x\n"

// TestSDKHover: hovering an `@sdk` line describes the implementation.
func TestSDKHover(t *testing.T) {
	store := NewDocumentStore()
	store.Open(renameURI, sdkSource)
	for line, want := range map[uint32]string{
		0: "Worker `w` is implemented in the Go SDK, entry file `cmd/w/main.go`",
		1: "Worker `w` is implemented in the TypeScript SDK; no code yet",
	} {
		at := protocol.TextDocumentPositionParams{TextDocument: protocol.TextDocumentIdentifier{URI: renameURI}, Position: protocol.Position{Line: line, Character: 2}}
		hover, err := hoverHandler(store)(nil, &protocol.HoverParams{TextDocumentPositionParams: at})
		if err != nil || hover == nil {
			t.Fatalf("hover on line %d: hover=%v err=%v", line, hover, err)
		}
		if v := hover.Contents.(protocol.MarkupContent).Value; !strings.HasPrefix(v, want) {
			t.Errorf("hover on line %d = %q, want it to start %q", line, v, want)
		}
	}
}

// TestSDKDefinition: Go to Definition on an `@sdk` path opens the entry file,
// read from the .twf file's directory outside a module; a directory is no
// entry file.
func TestSDKDefinition(t *testing.T) {
	dir := t.TempDir()
	main := filepath.Join(dir, "cmd", "w", "main.go")
	if err := os.MkdirAll(filepath.Dir(main), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(main, []byte("package main\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	uri := fileURI(filepath.Join(dir, "w.twf"))
	store := NewDocumentStore()
	store.Open(uri, sdkSource)

	tests := []struct {
		name      string
		line, col uint32
		want      string
	}{
		{"on the path", 0, 12, fileURI(canonical(main))},
		{"on the opening quote", 0, 9, fileURI(canonical(main))},
		{"on the SDK", 0, 6, ""},
		{"no path", 1, 7, ""},
		{"a directory", 0, 12, ""},
	}
	dirURI := fileURI(filepath.Join(dir, "d.twf"))
	store.Open(dirURI, "@sdk(go, \"cmd/w\")\nworker w:\n\tactivity A\n")
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uri := uri
			if tt.name == "a directory" {
				uri = dirURI
			}
			at := protocol.TextDocumentPositionParams{TextDocument: protocol.TextDocumentIdentifier{URI: uri}, Position: protocol.Position{Line: tt.line, Character: tt.col}}
			got, err := definitionHandler(store)(nil, &protocol.DefinitionParams{TextDocumentPositionParams: at})
			if err != nil {
				t.Fatal(err)
			}
			loc, _ := got.(protocol.Location)
			if loc.URI != tt.want {
				t.Errorf("definition = %#v, want %q", got, tt.want)
			}
		})
	}
}

// TestAnnotationCompletions: '@' completes annotation names, and `@sdk(` the
// SDKs; nothing else on an annotation line completes.
func TestAnnotationCompletions(t *testing.T) {
	tests := []struct {
		prefix string
		want   []string
		ok     bool
	}{
		{"@", []string{"sdk"}, true},
		{"@s", []string{"sdk"}, true},
		{"@sdk(", []string{"go", "typescript", "python", "java", "dotnet", "ruby", "php", "rust", "swift", "haskell", "clojure", "perl", "erlang", "elixir"}, true},
		{"@sdk(ty", []string{"go", "typescript", "python", "java", "dotnet", "ruby", "php", "rust", "swift", "haskell", "clojure", "perl", "erlang", "elixir"}, true},
		{`@sdk(go, "`, nil, true},
		{"\tactivity A", nil, false},
	}
	for _, tt := range tests {
		items, ok := annotationCompletions(tt.prefix)
		var got []string
		for _, it := range items {
			got = append(got, it.Label)
		}
		if ok != tt.ok || !slices.Equal(got, tt.want) {
			t.Errorf("annotationCompletions(%q) = %v, %v; want %v, %v", tt.prefix, got, ok, tt.want, tt.ok)
		}
	}
}

// TestSemanticTokenDecorator: an annotation's '@' and name are decorators.
func TestSemanticTokenDecorator(t *testing.T) {
	data := buildSemanticTokens("@sdk(go)\n")
	if len(data) < 10 || data[3] != semDecorator || data[8] != semDecorator || data[2] != 1 || data[7] != 3 {
		t.Fatalf("semantic tokens = %v, want '@' and sdk as decorators", data)
	}
}
