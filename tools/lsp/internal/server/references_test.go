package server

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	protocol "github.com/jmbarzee/glsp/protocol_3_16"
)

// wordAt is the position of the nth (0-based) whole-word word on line of src.
func wordAt(t *testing.T, src string, line int, word string, nth int) protocol.Position {
	t.Helper()
	text := strings.Split(src, "\n")[line]
	locs := regexp.MustCompile(`\b`+regexp.QuoteMeta(word)+`\b`).FindAllStringIndex(text, -1)
	if nth >= len(locs) {
		t.Fatalf("line %d %q has no occurrence %d of %s", line, text, nth, word)
	}
	return protocol.Position{Line: uint32(line), Character: utf16Len(text[:locs[nth][0]])}
}

// spelled is the text range r covers in src.
func spelled(src string, r protocol.Range) string {
	line := strings.Split(src, "\n")[r.Start.Line]
	return line[r.Start.Character:r.End.Character] // ASCII sources
}

// spot is the nth whole-word word on a line.
type spot struct {
	line int
	word string
	nth  int
}

// everyKindSource names each kind of declaration twice where scope allows —
// Parent and Child both declare signal Go, update Set, query Status and
// condition ready — and spells names beside same-text tokens: a promise and a
// workflow named Child, a send head and signal named Child, and an endpoint and
// service named Orders.
const everyKindSource = `workflow Parent(wid: string):
    state:
        condition ready
    signal Go():
        set ready
    update Set():
        unset ready
    query Status() -> (string):
        return "ok"
    promise Child <- workflow Child(wid)
    signal Child.Go()
    await Child
    nexus Orders Orders.Place(wid)
    await ready
    activity Do(wid)
    close complete()

workflow Sender(wid: string):
    signal Child.Child()
        id: wid
    workflow Child(wid)
    close complete()

workflow Child(wid: string):
    id_scheme: "child-{wid}"
    state:
        condition ready
    signal Go():
        set ready
    signal Child():
        set ready
    update Set():
        unset ready
    query Status() -> (string):
        return "ok"
    await one:
        signal Go:
            close complete()
        update Set:
            close complete()
        ready:
            close complete()

activity Do(wid: string):
    do(wid)

nexus service Orders:
    async Place workflow Child

worker W:
    workflow Parent
    workflow Sender
    workflow Child
    activity Do
    nexus service Orders

namespace Prod:
    worker W
        options:
            task_queue: "q"
    nexus endpoint Orders
        options:
            task_queue: "q"
`

// TestRenameEveryKind renames each declared name from one of its spellings and
// checks every edit lands on that name's own token, the count of them, that
// references and definition agree, and that the result is clean. It runs on a
// saved buffer (positions from the workspace run) and an untitled one (from
// the buffer's own AST).
func TestRenameEveryKind(t *testing.T) {
	tests := []struct {
		name         string
		cursor, decl spot
		want         int
	}{
		{"workflow beside a same-named promise", spot{9, "Child", 1}, spot{23, "Child", 0}, 6},
		{"promise beside a same-named workflow", spot{11, "Child", 0}, spot{9, "Child", 0}, 3},
		{"signal named like its send head", spot{18, "Child", 1}, spot{29, "Child", 0}, 2},
		{"signal sent through a handle", spot{10, "Go", 0}, spot{27, "Go", 0}, 3},
		{"same-named signal of another workflow", spot{3, "Go", 0}, spot{3, "Go", 0}, 1},
		{"update", spot{38, "Set", 0}, spot{31, "Set", 0}, 2},
		{"same-named update of another workflow", spot{5, "Set", 0}, spot{5, "Set", 0}, 1},
		{"query", spot{33, "Status", 0}, spot{33, "Status", 0}, 1},
		{"condition", spot{13, "ready", 0}, spot{2, "ready", 0}, 4},
		{"same-named condition of another workflow", spot{40, "ready", 0}, spot{26, "ready", 0}, 5},
		{"nexus service after a same-named endpoint", spot{12, "Orders", 1}, spot{46, "Orders", 0}, 3},
		{"nexus endpoint before a same-named service", spot{12, "Orders", 0}, spot{60, "Orders", 0}, 2},
		{"nexus operation", spot{12, "Place", 0}, spot{47, "Place", 0}, 2},
		{"activity", spot{14, "Do", 0}, spot{43, "Do", 0}, 3},
		{"worker", spot{57, "W", 0}, spot{49, "W", 0}, 2},
		{"namespace", spot{56, "Prod", 0}, spot{56, "Prod", 0}, 1},
		{"workflow registered on a worker", spot{50, "Parent", 0}, spot{0, "Parent", 0}, 2},
	}
	saved := "file://" + filepath.Join(t.TempDir(), "kinds.twf")
	for _, uri := range []string{saved, "untitled:Untitled-1"} {
		for _, tt := range tests {
			t.Run(uri+"/"+tt.name, func(t *testing.T) {
				store := NewDocumentStore()
				store.Open(uri, everyKindSource)
				cursor := wordAt(t, everyKindSource, tt.cursor.line, tt.cursor.word, tt.cursor.nth)
				at := protocol.TextDocumentPositionParams{
					TextDocument: protocol.TextDocumentIdentifier{URI: uri},
					Position:     cursor,
				}

				edit, err := renameHandler(store)(nil, &protocol.RenameParams{TextDocumentPositionParams: at, NewName: "Renamed"})
				if err != nil || edit == nil {
					t.Fatalf("rename: edit=%v err=%v", edit, err)
				}
				edits := edit.Changes[uri]
				if len(edit.Changes) != 1 || len(edits) != tt.want {
					t.Fatalf("want %d edits to %s, got %+v", tt.want, uri, edit.Changes)
				}
				for _, e := range edits {
					if got := spelled(everyKindSource, e.Range); got != tt.cursor.word {
						t.Errorf("edit at %+v rewrites %q, not %s", e.Range.Start, got, tt.cursor.word)
					}
				}

				refs, err := referencesHandler(store)(nil, &protocol.ReferenceParams{
					TextDocumentPositionParams: at,
					Context:                    protocol.ReferenceContext{IncludeDeclaration: true},
				})
				if err != nil || len(refs) != tt.want {
					t.Errorf("references: want %d, got %d (err %v)", tt.want, len(refs), err)
				}

				def, err := definitionHandler(store)(nil, &protocol.DefinitionParams{TextDocumentPositionParams: at})
				loc, ok := def.(protocol.Location)
				wantDecl := wordAt(t, everyKindSource, tt.decl.line, tt.decl.word, tt.decl.nth)
				if err != nil || !ok || loc.URI != uri || loc.Range.Start != wantDecl {
					t.Errorf("definition = %#v (err %v), want %s at %+v", def, err, uri, wantDecl)
				}

				renamed := applyEdits(t, everyKindSource, edits)
				doc := store.Open(uri, renamed)
				if len(doc.ParseErrs)+len(doc.ResolveErrs)+len(doc.ValidateErrs) > 0 {
					t.Errorf("renamed source is not clean: parse=%v resolve=%v validate=%v\n%s",
						doc.ParseErrs, doc.ResolveErrs, doc.ValidateErrs, renamed)
				}
			})
		}
	}
}

// duplicateDeclSource declares each in-definition name twice, the two
// differing in signature: condition Ready, signal Ping, update Bump, and
// operation Op (sync, then async).
const duplicateDeclSource = `workflow W(wid: string):
    id_scheme: "w-{wid}"
    state:
        condition Ready
        condition Ready
    signal Ping(a: string):
        set Ready
    signal Ping(b: int):
        set Ready
    update Bump() -> (string):
        return "a"
    update Bump(n: int) -> (int):
        return 1
    await signal Ping
    await update Bump
    await Ready
    nexus e S.Op()
    close complete()

workflow Sender(wid: string):
    signal W.Ping("x")
        id: wid
    promise h <- workflow W(wid)
    signal h.Ping("y")
    close complete()

nexus service S:
    sync Op() -> ():
        close complete()
    async Op workflow W

namespace n:
    nexus endpoint e
        options:
            task_queue: "q"
`

// TestDefinitionOfDuplicateIsFirst: a name declared twice in one definition
// (DUPLICATE_*) is its first declaration, so go-to-definition from every
// reference to it, a signal send's included, lands on the first.
func TestDefinitionOfDuplicateIsFirst(t *testing.T) {
	tests := []struct {
		name         string
		cursor, decl spot
	}{
		{"await signal", spot{13, "Ping", 0}, spot{5, "Ping", 0}},
		{"signal send to a type", spot{20, "Ping", 0}, spot{5, "Ping", 0}},
		{"signal send through a handle", spot{23, "Ping", 0}, spot{5, "Ping", 0}},
		{"await update", spot{14, "Bump", 0}, spot{9, "Bump", 0}},
		{"await condition", spot{15, "Ready", 0}, spot{3, "Ready", 0}},
		{"set in the first handler", spot{6, "Ready", 0}, spot{3, "Ready", 0}},
		{"set in the later handler", spot{8, "Ready", 0}, spot{3, "Ready", 0}},
		{"nexus operation", spot{16, "Op", 0}, spot{27, "Op", 0}},
	}
	saved := "file://" + filepath.Join(t.TempDir(), "dup.twf")
	for _, uri := range []string{saved, "untitled:Untitled-1"} {
		for _, tt := range tests {
			t.Run(uri+"/"+tt.name, func(t *testing.T) {
				store := NewDocumentStore()
				store.Open(uri, duplicateDeclSource)
				at := protocol.TextDocumentPositionParams{
					TextDocument: protocol.TextDocumentIdentifier{URI: uri},
					Position:     wordAt(t, duplicateDeclSource, tt.cursor.line, tt.cursor.word, tt.cursor.nth),
				}
				def, err := definitionHandler(store)(nil, &protocol.DefinitionParams{TextDocumentPositionParams: at})
				loc, ok := def.(protocol.Location)
				want := wordAt(t, duplicateDeclSource, tt.decl.line, tt.decl.word, tt.decl.nth)
				if err != nil || !ok || loc.URI != uri || loc.Range.Start != want {
					t.Errorf("definition = %#v (err %v), want %s at %+v", def, err, uri, want)
				}
			})
		}
	}
}

// TestRenameOffANameDoesNothing: a cursor on a keyword names nothing.
func TestRenameOffANameDoesNothing(t *testing.T) {
	store := NewDocumentStore()
	store.Open(renameURI, everyKindSource)
	got, err := prepareRenameHandler(store)(nil, &protocol.PrepareRenameParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: renameURI},
			Position:     protocol.Position{Line: 14, Character: 5}, // `activity`
		},
	})
	if err != nil || got != nil {
		t.Errorf("prepareRename on a keyword = %v, %v; want nothing", got, err)
	}
}

// packageSources is a module with two imported packages that declare the
// same names, and an importing package that declares them too.
var packageSources = map[string]string{
	"billing/billing.twf": billingSource,
	"billingv2/billingv2.twf": strings.NewReplacer(
		"package billing", "package billingv2", "Billing:", "BillingV2:",
		`"billing"`, `"billingv2"`, "child-{wid}", "child2-{wid}", "endpoint Pay\n", "endpoint Pay2\n",
	).Replace(billingSource),
	"app/app.twf": appSource,
}

const billingSource = `package billing

workflow Child(wid: string):
    id_scheme: "child-{wid}"
    signal Go():
        done = true
    activity Charge(wid)
    close complete()

activity Charge(wid: string):
    charge(wid)

nexus service Orders:
    async Place workflow Child

worker W:
    workflow Child
    activity Charge
    nexus service Orders

namespace Billing:
    worker W
        options:
            task_queue: "billing"
    nexus endpoint Pay
        options:
            task_queue: "billing"
`

// appSource imports billingv2 as Child, beside its own workflow Child.
const appSource = `package app

import "acme/billing"
import Child "acme/billingv2"

workflow Parent(wid: string):
    activity Charge(wid)
    activity billing.Charge(wid)
        options:
            task_queue: "b"
    activity Child.Charge(wid)
        options:
            task_queue: "b2"
    signal billing.Child.Go()
        id: wid
    signal Child.Child.Go()
        id: wid
    signal Child.Go()
        id: wid
    nexus Pay billing.Orders.Place(wid)
    nexus Pay2 Child.Orders.Place(wid)
    nexus Local Orders.Place(wid)
    close complete()

workflow Child(wid: string):
    id_scheme: "app-{wid}"
    signal Go():
        done = true
    close complete()

activity Charge(wid: string):
    charge(wid)

nexus service Orders:
    async Place workflow Child

worker W:
    workflow Parent
    workflow Child
    activity Charge
    nexus service Orders

worker B:
    activity billing.Charge

worker B2:
    activity Child.Charge

namespace App:
    worker W
        options:
            task_queue: "app"
    worker B
        options:
            task_queue: "b"
    worker B2
        options:
            task_queue: "b2"
    nexus endpoint Local
        options:
            task_queue: "app"
`

// TestRenameAcrossPackages renames, from the open app buffer, names that two
// imported packages and the app each declare: each rename and its references
// reach exactly the one declaration's spellings, in whichever files they are,
// definition lands on that declaration, and every file stays clean.
func TestRenameAcrossPackages(t *testing.T) {
	tests := []struct {
		name     string
		cursor   spot
		declFile string
		want     map[string]int // edits per file
	}{
		{"local activity", spot{6, "Charge", 0}, "app.twf", map[string]int{"app.twf": 3}},
		{"qualified activity", spot{7, "Charge", 0}, "billing.twf", map[string]int{"app.twf": 2, "billing.twf": 3}},
		{"aliased activity", spot{10, "Charge", 0}, "billingv2.twf", map[string]int{"app.twf": 2, "billingv2.twf": 3}},
		{"workflow behind an alias spelled like it", spot{15, "Child", 1}, "billingv2.twf", map[string]int{"app.twf": 1, "billingv2.twf": 3}},
		{"qualified workflow", spot{13, "Child", 0}, "billing.twf", map[string]int{"app.twf": 1, "billing.twf": 3}},
		{"local workflow spelled like an alias", spot{17, "Child", 0}, "app.twf", map[string]int{"app.twf": 4}},
		{"signal of an aliased workflow", spot{15, "Go", 0}, "billingv2.twf", map[string]int{"app.twf": 1, "billingv2.twf": 1}},
		{"signal of a qualified workflow", spot{13, "Go", 0}, "billing.twf", map[string]int{"app.twf": 1, "billing.twf": 1}},
		{"signal of a local workflow", spot{17, "Go", 0}, "app.twf", map[string]int{"app.twf": 2}},
		{"qualified nexus service", spot{19, "Orders", 0}, "billing.twf", map[string]int{"app.twf": 1, "billing.twf": 2}},
		{"aliased nexus service", spot{20, "Orders", 0}, "billingv2.twf", map[string]int{"app.twf": 1, "billingv2.twf": 2}},
		{"local nexus service", spot{21, "Orders", 0}, "app.twf", map[string]int{"app.twf": 3}},
		{"qualified nexus operation", spot{19, "Place", 0}, "billing.twf", map[string]int{"app.twf": 1, "billing.twf": 1}},
		{"local nexus operation", spot{21, "Place", 0}, "app.twf", map[string]int{"app.twf": 2}},
		{"endpoint in another package", spot{20, "Pay2", 0}, "billingv2.twf", map[string]int{"app.twf": 1, "billingv2.twf": 1}},
		{"local endpoint", spot{21, "Local", 0}, "app.twf", map[string]int{"app.twf": 2}},
		{"worker named like other packages' workers", spot{49, "W", 0}, "app.twf", map[string]int{"app.twf": 2}},
		{"namespace", spot{48, "App", 0}, "app.twf", map[string]int{"app.twf": 1}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			writeModule(t, dir, "acme")
			for name, src := range packageSources {
				writeTWF(t, dir, name, src)
			}
			_, appURI := writeTWF(t, dir, "app/app.twf", appSource)
			store := NewDocumentStore()
			store.SetFolders([]string{dir})
			store.Open(appURI, appSource)
			at := protocol.TextDocumentPositionParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: appURI},
				Position:     wordAt(t, appSource, tt.cursor.line, tt.cursor.word, tt.cursor.nth),
			}

			edit, err := renameHandler(store)(nil, &protocol.RenameParams{TextDocumentPositionParams: at, NewName: "Renamed"})
			if err != nil || edit == nil {
				t.Fatalf("rename: edit=%v err=%v", edit, err)
			}
			total := 0
			for uri, edits := range edit.Changes {
				if !strings.HasPrefix(uri, "file://"+dir+"/") {
					t.Errorf("edit URI %s is not under the folder's own spelling %s", uri, dir)
				}
				base := filepath.Base(uriToPath(uri))
				src := packageSources[filepath.Base(filepath.Dir(uriToPath(uri)))+"/"+base]
				if got := len(edits); got != tt.want[base] {
					t.Errorf("%d edits to %s, want %d", got, base, tt.want[base])
				}
				for _, e := range edits {
					if got := spelled(src, e.Range); got != tt.cursor.word {
						t.Errorf("edit to %s at %+v rewrites %q, not %s", base, e.Range.Start, got, tt.cursor.word)
					}
				}
				total += len(edits)
			}
			if len(edit.Changes) != len(tt.want) {
				t.Errorf("edited files %v, want %v", edit.Changes, tt.want)
			}

			refs, err := referencesHandler(store)(nil, &protocol.ReferenceParams{
				TextDocumentPositionParams: at,
				Context:                    protocol.ReferenceContext{IncludeDeclaration: true},
			})
			if err != nil || len(refs) != total {
				t.Errorf("references: want %d, got %d (err %v)", total, len(refs), err)
			}
			def, err := definitionHandler(store)(nil, &protocol.DefinitionParams{TextDocumentPositionParams: at})
			if loc, ok := def.(protocol.Location); err != nil || !ok || filepath.Base(uriToPath(loc.URI)) != tt.declFile {
				t.Errorf("definition = %#v (err %v), want a location in %s", def, err, tt.declFile)
			}

			for uri, edits := range edit.Changes {
				path := uriToPath(uri)
				src := packageSources[filepath.Base(filepath.Dir(path))+"/"+filepath.Base(path)]
				if err := os.WriteFile(path, []byte(applyEdits(t, src, edits)), 0o644); err != nil {
					t.Fatal(err)
				}
			}

			// Every file, opened from its renamed text, is clean.
			after := NewDocumentStore()
			after.SetFolders([]string{dir})
			for name := range packageSources {
				path := filepath.Join(dir, name)
				text, err := os.ReadFile(path)
				if err != nil {
					t.Fatal(err)
				}
				after.Open("file://"+path, string(text))
			}
			for _, doc := range after.All() {
				if len(doc.ParseErrs)+len(doc.ResolveErrs)+len(doc.ValidateErrs) > 0 {
					t.Errorf("%s is not clean after the rename: parse=%v resolve=%v validate=%v\n%s",
						doc.URI, doc.ParseErrs, doc.ResolveErrs, doc.ValidateErrs, doc.Content)
				}
			}
		})
	}
}

// TestNameRangeCountsUTF16: a range's characters are UTF-16 code units, so
// text before a name that is not ASCII shifts it by its UTF-16 length, not its
// byte length.
func TestNameRangeCountsUTF16(t *testing.T) {
	line := `    "é😀" Charge`
	col := strings.Index(line, "Charge") + 1 // the parser's 1-based byte column
	o := occurrence{name: "Charge"}
	o.Line, o.Column = 2, col
	got := nameRange([]string{"first line", line}, o.Pos, o.name)
	want := protocol.Range{
		Start: protocol.Position{Line: 1, Character: 10}, // 4 spaces, ", é, 😀 (2 units), ", space
		End:   protocol.Position{Line: 1, Character: 16},
	}
	if got != want {
		t.Errorf("nameRange = %+v, want %+v", got, want)
	}
}
