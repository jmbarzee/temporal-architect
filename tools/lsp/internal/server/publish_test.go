package server

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/jmbarzee/glsp"
	protocol "github.com/jmbarzee/glsp/protocol_3_16"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// published records the last diagnostics published per URI.
type published map[string][]protocol.Diagnostic

func (p published) context() *glsp.Context {
	return &glsp.Context{Notify: func(method string, params any) {
		if d, ok := params.(protocol.PublishDiagnosticsParams); ok {
			p[d.URI] = d.Diagnostics
		}
	}}
}

// codes lists the codes last published on uri, as "line:CODE".
func (p published) codes(uri string) []string {
	var out []string
	for _, d := range p[uri] {
		code := ""
		if d.Code != nil {
			code = fmt.Sprint(d.Code.Value)
		}
		out = append(out, fmt.Sprintf("%d:%s", d.Range.Start.Line+1, code))
	}
	return out
}

// uris lists the URIs last published with diagnostics.
func (p published) uris() []string {
	var out []string
	for uri, diags := range p {
		if len(diags) > 0 {
			out = append(out, uri)
		}
	}
	slices.Sort(out)
	return out
}

func (p published) open(t *testing.T, store *DocumentStore, uri, text string) {
	t.Helper()
	store.Open(uri, text)
	if err := publishAll(p.context(), store); err != nil {
		t.Fatal(err)
	}
}

func (p published) close(t *testing.T, store *DocumentStore, uri string) {
	t.Helper()
	if err := didCloseHandler(store)(p.context(), &protocol.DidCloseTextDocumentParams{TextDocument: protocol.TextDocumentIdentifier{URI: uri}}); err != nil {
		t.Fatal(err)
	}
}

func fileURI(abs string) string { return pathToURI(filepath.ToSlash(abs)) }

func writeFile(t *testing.T, abs, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(abs, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func wantCodes(t *testing.T, p published, what, uri string, want ...string) {
	t.Helper()
	if got := p.codes(uri); !slices.Equal(got, want) {
		t.Errorf("%s (%s): got %v, want %v", what, uri, got, want)
	}
}

// TestPublishContributionDedupedAndCleared: a diagnostic two buffers' analyses
// contribute to a closed file is published once, stays while either
// contributes, and is cleared when the last one stops.
func TestPublishContributionDedupedAndCleared(t *testing.T) {
	dir := t.TempDir()
	writeModule(t, dir, "example.com/m")
	_, closed := writeTWF(t, dir, "c/z.twf", "import \"other.org/ext\"\n")
	a := "workflow A():\n\tclose complete(\"ok\")\n"
	_, aURI := writeTWF(t, dir, "a/x.twf", a)
	b := "workflow B():\n\tclose complete(\"ok\")\n"
	_, bURI := writeTWF(t, dir, "b/y.twf", b)

	store := NewDocumentStore()
	store.SetFolders([]string{dir})
	p := published{}
	p.open(t, store, aURI, a)
	p.open(t, store, bURI, b)
	wantCodes(t, p, "both contribute", closed, "1:UNRESOLVED_IMPORT")
	p.close(t, store, aURI)
	wantCodes(t, p, "one contributes", closed, "1:UNRESOLVED_IMPORT")
	p.close(t, store, bURI)
	if diags, ok := p[closed]; !ok || len(diags) != 0 {
		t.Errorf("after the last contributor closed: %v (published %v), want an empty publish", diags, ok)
	}
}

// TestPublishClosedSiblingImportsAndCauses: from one open buffer, every failing
// import line of its package is published on its file — a closed sibling's
// IMPORT_NOT_FOUND and UNRESOLVED_IMPORT included — with each sinking line's
// cause on the file that holds it; a closed sibling of the buffer's directory
// that was excluded shows why.
func TestPublishClosedSiblingImportsAndCauses(t *testing.T) {
	dir := t.TempDir()
	writeModule(t, dir, "example.com/m")
	_, prov := writeTWF(t, dir, "prov/a.twf", "package\n\nworkflow X():\n\tclose complete(\"ok\")\n")
	writeFile(t, filepath.Join(dir, "brk", "twf.mod"), "modul x\n")
	writeTWF(t, dir, "brk/c.twf", "package brk\n")
	_, sib := writeTWF(t, dir, "use/b.twf", "package use\n\nimport \"example.com/m/nope\"\nimport \"other.org/ext\"\nimport \"example.com/m/brk\"\n")
	_, conflict := writeTWF(t, dir, "use/c.twf", "package other\n")
	buf := "package use\n\nimport \"example.com/m/prov\"\n\nworkflow W():\n\tclose complete(\"ok\")\n"
	_, uri := writeTWF(t, dir, "use/a.twf", buf)

	store := NewDocumentStore()
	store.SetFolders([]string{dir})
	p := published{}
	p.open(t, store, uri, buf)

	wantCodes(t, p, "the buffer", uri)
	wantCodes(t, p, "the closed sibling's failing imports", sib, "3:IMPORT_NOT_FOUND", "4:UNRESOLVED_IMPORT")
	wantCodes(t, p, "the buffer's sinking import's cause", prov, "1:SYNTAX")
	wantCodes(t, p, "the sibling's sinking import's cause", fileURI(filepath.Join(dir, "brk", "twf.mod")), "1:MODULE_FILE_INVALID")
	wantCodes(t, p, "an excluded sibling", conflict, "1:PACKAGE_CLAUSE_CONFLICT")
	if got := len(p.uris()); got != 4 {
		t.Errorf("published on %v, want only the four files above", p.uris())
	}
}

// TestPublishElsewhereInUTF16: a diagnostic published on a closed file has
// its range counted in UTF-16 over that file's text, not the buffer's, and a
// CRLF file's `\r` is not counted.
func TestPublishElsewhereInUTF16(t *testing.T) {
	for _, eol := range []string{"\n", "\r\n"} {
		dir := t.TempDir()
		writeModule(t, dir, "example.com/m")
		const line = `import "example.com/m/é"` // 25 bytes, 24 UTF-16 units
		_, sib := writeTWF(t, dir, "use/b.twf", "package use"+eol+eol+line+eol)
		buf := "package use\n\nworkflow W():\n\tclose complete(\"ok\")\n"
		_, uri := writeTWF(t, dir, "use/a.twf", buf)
		store := NewDocumentStore()
		store.SetFolders([]string{dir})
		p := published{}
		p.open(t, store, uri, buf)
		if len(p[sib]) != 1 {
			t.Fatalf("eol %q: closed sibling: %+v, want its failing import", eol, p[sib])
		}
		want := protocol.Range{Start: protocol.Position{Line: 2, Character: 0}, End: protocol.Position{Line: 2, Character: 24}}
		if got := p[sib][0].Range; got != want {
			t.Errorf("eol %q: range = %+v, want %+v", eol, got, want)
		}
	}
}

// TestPublishOwnModuleErrors: a buffer whose own twf.mod is broken — outside
// every folder here — shows its MODULE_FILE_INVALID on the twf.mod and at its
// own 1:1.
func TestPublishOwnModuleErrors(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "twf.mod"), "modul x\n")
	buf := "package fabric\n\nworkflow W():\n\tclose complete(\"ok\")\n"
	_, uri := writeTWF(t, dir, "fabric/f.twf", buf)
	store := NewDocumentStore()
	store.SetFolders([]string{filepath.Join(dir, "fabric")})
	p := published{}
	p.open(t, store, uri, buf)
	wantCodes(t, p, "the buffer", uri, "1:MODULE_FILE_INVALID")
	wantCodes(t, p, "its twf.mod", pathToURI(canonical(filepath.Join(dir, "twf.mod"))), "1:MODULE_FILE_INVALID")
}

// TestPublishBrokenModuleAtHomeFolder: a broken twf.mod at the buffer's home
// folder root, whose module has input files, is published from a buffer in a
// nested module below it.
func TestPublishBrokenModuleAtHomeFolder(t *testing.T) {
	ws := t.TempDir()
	writeFile(t, filepath.Join(ws, "twf.mod"), "modul x\n")
	writeTWF(t, ws, "top.twf", "workflow Top():\n\tclose complete(\"ok\")\n")
	writeTWF(t, ws, "sub/twf.mod", "module example.com/sub\n")
	buf := "workflow W():\n\tclose complete(\"ok\")\n"
	_, uri := writeTWF(t, ws, "sub/w.twf", buf)
	store := NewDocumentStore()
	store.SetFolders([]string{ws})
	p := published{}
	p.open(t, store, uri, buf)
	wantCodes(t, p, "the buffer", uri)
	wantCodes(t, p, "the home folder's twf.mod", fileURI(filepath.Join(ws, "twf.mod")), "1:MODULE_FILE_INVALID")
}

// TestPublishLostDuplicateModule: a buffer whose module lost DUPLICATE_MODULE
// to a copy nested inside it shows the DUPLICATE_MODULE on its twf.mod and at
// its own 1:1, and nothing else.
func TestPublishLostDuplicateModule(t *testing.T) {
	dir := t.TempDir()
	writeModule(t, dir, "example.com/x")
	writeTWF(t, dir, "backup/a.twf", "workflow A():\n\tclose complete(\"ok\")\n")
	writeModule(t, filepath.Join(dir, "backup"), "example.com/x")
	buf := "import \"other.org/ext\"\n\nworkflow Z():\n\tactivity Ghost()\n"
	_, uri := writeTWF(t, dir, "z.twf", buf)
	store := NewDocumentStore()
	store.SetFolders([]string{dir})
	p := published{}
	p.open(t, store, uri, buf)
	wantCodes(t, p, "the buffer", uri, "1:DUPLICATE_MODULE")
	wantCodes(t, p, "its twf.mod", fileURI(filepath.Join(dir, "twf.mod")), "1:DUPLICATE_MODULE")
	if got := len(p.uris()); got != 2 {
		t.Errorf("published on %v, want only the buffer and its twf.mod", p.uris())
	}
}

// TestPublishOtherDuplicateModuleOnlyWhenImported: with two checkouts of one
// module in a folder, a buffer flags the other copy's twf.mod only when its
// package imports under that module path; with buffers open in both copies,
// each flags the other (accepted).
func TestPublishOtherDuplicateModuleOnlyWhenImported(t *testing.T) {
	ws := t.TempDir()
	for _, c := range []string{"a", "b"} {
		if err := os.MkdirAll(filepath.Join(ws, c), 0o755); err != nil {
			t.Fatal(err)
		}
		writeModule(t, filepath.Join(ws, c), "example.com/x")
		writeTWF(t, ws, c+"/q/q.twf", "package q\n\nworkflow Q():\n\tclose complete(\"ok\")\n")
	}
	plain := "package p\n\nworkflow P():\n\tclose complete(\"ok\")\n"
	importing := "package p\n\nimport \"example.com/x/q\"\n\nworkflow P():\n\tworkflow q.Q()\n\tclose complete(\"ok\")\n"
	_, aURI := writeTWF(t, ws, "a/p/p.twf", plain)
	_, bURI := writeTWF(t, ws, "b/p/p.twf", importing)
	aMod, bMod := fileURI(filepath.Join(ws, "a", "twf.mod")), fileURI(filepath.Join(ws, "b", "twf.mod"))

	store := NewDocumentStore()
	store.SetFolders([]string{ws})
	p := published{}
	p.open(t, store, aURI, plain)
	if got := p.uris(); len(got) != 0 {
		t.Errorf("a buffer with no import under the module published %v", got)
	}
	store.Update(aURI, importing)
	if err := publishAll(p.context(), store); err != nil {
		t.Fatal(err)
	}
	wantCodes(t, p, "the other copy", bMod, "1:DUPLICATE_MODULE")
	wantCodes(t, p, "its own copy", aMod)

	p.open(t, store, bURI, importing)
	wantCodes(t, p, "a's copy, flagged from b", aMod, "1:DUPLICATE_MODULE")
	wantCodes(t, p, "b's copy, flagged from a", bMod, "1:DUPLICATE_MODULE")
}

// TestPublishOneIdentityTwoSpellings: a folder opened through one spelling of
// a directory (macOS's /var → /private/var, else a symlink) and a buffer URI
// under the other are one file: the buffer's diagnostics appear only on its
// URI, a closed file's under the folder's spelling, and opening the buffer
// under the second spelling too publishes its diagnostics once on each.
func TestPublishOneIdentityTwoSpellings(t *testing.T) {
	alias := t.TempDir()
	real, err := filepath.EvalSymlinks(alias)
	if err != nil {
		t.Fatal(err)
	}
	if real == alias {
		alias = filepath.Join(t.TempDir(), "ws")
		if err := os.Symlink(real, alias); err != nil {
			t.Skipf("no alias for %s: %v", real, err)
		}
	}
	writeTWF(t, real, "c.twf", "import \"other.org/ext\"\n")
	buf := "workflow W():\n\tactivity Ghost()\n"
	writeTWF(t, real, "w.twf", buf)
	realURI, aliasURI := fileURI(filepath.Join(real, "w.twf")), fileURI(filepath.Join(alias, "w.twf"))
	closed := fileURI(filepath.Join(alias, "c.twf"))

	store := NewDocumentStore()
	store.SetFolders([]string{alias})
	p := published{}
	p.open(t, store, realURI, buf)
	wantCodes(t, p, "the buffer", realURI, "2:UNDEFINED_ACTIVITY")
	wantCodes(t, p, "the closed file", closed, "1:UNRESOLVED_IMPORT")
	if got, want := p.uris(), slices.Sorted(slices.Values([]string{closed, realURI})); !slices.Equal(got, want) {
		t.Errorf("published on %v, want %v", got, want)
	}

	p.open(t, store, aliasURI, buf)
	wantCodes(t, p, "the first URI", realURI, "2:UNDEFINED_ACTIVITY")
	wantCodes(t, p, "the second URI", aliasURI, "2:UNDEFINED_ACTIVITY")

	// The two buffers diverge: both URIs show the most recently edited text's
	// diagnostics, never the other buffer's stale parse errors.
	store.Update(realURI, "workflow W(:\n")
	store.Update(aliasURI, "workflow W(:\n")
	if err := publishAll(p.context(), store); err != nil {
		t.Fatal(err)
	}
	broken := p.codes(aliasURI)
	if len(broken) == 0 {
		t.Fatal("the broken text reported nothing")
	}
	wantCodes(t, p, "the first URI, broken", realURI, broken...)
	store.Update(aliasURI, buf)
	if err := publishAll(p.context(), store); err != nil {
		t.Fatal(err)
	}
	wantCodes(t, p, "the stale URI, fixed through the other", realURI, "2:UNDEFINED_ACTIVITY")
	wantCodes(t, p, "the edited URI", aliasURI, "2:UNDEFINED_ACTIVITY")
}

// TestWorkspaceMidMigration: a main checkout with a twf.mod and a worktree
// under it with none: the worktree buffer is in main's module, whose root is
// walked, so it meets main's files — the state the design pins.
func TestWorkspaceMidMigration(t *testing.T) {
	main := t.TempDir()
	writeModule(t, main, "example.com/main")
	writeTWF(t, main, "flows.twf", "workflow Shared():\n\tclose complete(\"ok\")\n")
	buf := "workflow Shared():\n\tclose complete(\"ok\")\n"
	wt := filepath.Join(main, ".claude", "worktrees", "x")
	_, uri := writeTWF(t, wt, "flows.twf", buf)
	for _, folders := range [][]string{{main}, {main, wt}} {
		store := NewDocumentStore()
		store.SetFolders(folders)
		p := published{}
		p.open(t, store, uri, buf)
		wantCodes(t, p, fmt.Sprintf("folders %v", folders), uri, "1:DUPLICATE_WORKFLOW")
	}
}

// TestPublishCrossSDKCall: the editor shows the CROSS_SDK_CALL hint at the call.
func TestPublishCrossSDKCall(t *testing.T) {
	const src = "workflow W():\n\tactivity A()\n\tclose complete()\n\nactivity A():\n\tdefault_options:\n\t\ttask_queue: \"a\"\n\treturn x\n\n@sdk(go)\nworker wW:\n\tworkflow W\n\n@sdk(python)\nworker aW:\n\tactivity A\n\nnamespace ns:\n\tworker wW\n\t\toptions:\n\t\t\ttask_queue: \"w\"\n\tworker aW\n\t\toptions:\n\t\t\ttask_queue: \"a\"\n"
	const uri = "untitled:Untitled-1"
	p := published{}
	p.open(t, NewDocumentStore(), uri, src)
	wantCodes(t, p, "a call from go to python", uri, "2:CROSS_SDK_CALL")
	if d := p[uri]; len(d) == 1 && *d[0].Severity != protocol.DiagnosticSeverityHint {
		t.Errorf("severity = %v, want hint", *d[0].Severity)
	}
}

// TestSkippedImportHint: an import stopped at a skipped directory says to
// open it as the workspace folder only when that makes the import resolve;
// otherwise it says what would.
func TestSkippedImportHint(t *testing.T) {
	dir := t.TempDir()
	writeModule(t, dir, "example.com/m")
	writeTWF(t, dir, "_x/b/b.twf", "package b\n\nworkflow B():\n\tclose complete(\"ok\")\n")
	writeTWF(t, dir, "testdata/t/t.twf", "package t\n\nworkflow T():\n\tclose complete(\"ok\")\n")
	notFound := func(doc *Document) string {
		for _, e := range doc.ResolveErrs {
			if e.Code() == "IMPORT_NOT_FOUND" {
				return e.Msg
			}
		}
		return ""
	}

	// From outside the skipped directory, a folder there would not be this
	// file's home: the hint says to move the package.
	outside := "package peer\n\nimport \"example.com/m/testdata/t\"\n\nworkflow P():\n\tworkflow t.T()\n\tclose complete(\"ok\")\n"
	_, outsideURI := writeTWF(t, dir, "peer/p.twf", outside)
	store := NewDocumentStore()
	store.SetFolders([]string{dir})
	msg := notFound(store.Open(outsideURI, outside))
	if !strings.Contains(msg, "the walk skips testdata/ (move the package out of testdata/ to import it here)") {
		t.Errorf("outside the skipped directory: %q", msg)
	}

	// From inside it, opening it as the folder loads the package.
	inside := "package a\n\nimport \"example.com/m/_x/b\"\n\nworkflow A():\n\tworkflow b.B()\n\tclose complete(\"ok\")\n"
	_, insideURI := writeTWF(t, dir, "_x/a/a.twf", inside)
	store = NewDocumentStore()
	store.SetFolders([]string{dir})
	doc := store.Open(insideURI, inside)
	skipped := canonical(filepath.Join(dir, "_x"))
	if msg := notFound(doc); !strings.Contains(msg, "the walk skips _x/ (open "+skipped+" as the workspace folder)") {
		t.Fatalf("inside the skipped directory: %q", msg)
	}
	store.SetFolders([]string{dir, filepath.Join(dir, "_x")})
	store.Reanalyze()
	if len(doc.ResolveErrs) > 0 {
		t.Errorf("with the folder open, the import should bind: %v", doc.ResolveErrs)
	}
}

// TestUntitledBufferMatchesInlineSource: a buffer with no file reports what an
// MCP inline source and `twf check` on the same text outside a module do.
func TestUntitledBufferMatchesInlineSource(t *testing.T) {
	const wf = "workflow W(x):\n\tclose complete(x)\n"
	const imp = "import cf \"example.com/demo/cluster/fabric\"\n\nworkflow Setup():\n\tworkflow cf.Setup()\n\tclose complete(\"ok\")\n"
	cases := []struct{ name, src string }{
		{"empty", ""},
		{"no package clause", wf},
		{"package clause", "package orders\n\n" + wf},
		{"package clause with an import", "package fabric\n\n" + imp},
		{"package clause with an undefined call", "package orders\n\nworkflow W():\n\tactivity Ghost()\n"},
		{"package clause with a parse error", "package orders\n\nworkflow W(:\n"},
		{"failed package clause", "package\n\n" + wf},
		{"no package clause with an import", imp},
		{"no package clause with an undefined call", "workflow W():\n\tactivity Ghost()\n"},
	}
	dir := t.TempDir()
	render := func(line, column int, severity, code, msg string) string {
		return fmt.Sprintf("%d:%d %s %s %s", line, column, severity, code, msg)
	}
	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			file := filepath.Join(dir, fmt.Sprintf("in%d.twf", i))
			writeFile(t, file, tc.src)
			_, onDisk, err := pipeline.ParseFiles([]string{file})
			if err != nil {
				t.Fatal(err)
			}
			_, inline, err := pipeline.ParseSource("input.twf", tc.src)
			if err != nil {
				t.Fatal(err)
			}
			want := func(diags []pipeline.Diagnostic) []string {
				var out []string
				for _, d := range diags {
					out = append(out, render(d.Site.Line, d.Site.Column, d.Severity, d.Code, d.Message))
				}
				slices.Sort(out)
				return out
			}

			store := NewDocumentStore()
			p := published{}
			uri := fmt.Sprintf("untitled:Untitled-%d", i)
			p.open(t, store, uri, tc.src)
			var got []string
			for _, d := range p[uri] {
				sev := map[protocol.DiagnosticSeverity]string{protocol.DiagnosticSeverityError: "error", protocol.DiagnosticSeverityWarning: "warning", protocol.DiagnosticSeverityHint: "hint"}[*d.Severity]
				got = append(got, render(int(d.Range.Start.Line)+1, int(d.Range.Start.Character)+1, sev, fmt.Sprint(d.Code.Value), d.Message))
			}
			slices.Sort(got)
			if !slices.Equal(got, want(inline)) {
				t.Errorf("untitled buffer:\n got: %q\ninline: %q", got, want(inline))
			}
			if !slices.Equal(got, want(onDisk)) {
				t.Errorf("untitled buffer:\n got: %q\ntwf check: %q", got, want(onDisk))
			}
		})
	}
}
