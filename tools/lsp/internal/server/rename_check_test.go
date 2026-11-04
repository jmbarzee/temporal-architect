package server

import (
	"strings"
	"testing"

	protocol "github.com/jmbarzee/glsp/protocol_3_16"
)

// pairSource declares two of each kind in one scope, so each can be renamed
// to its sibling's name.
const pairSource = `workflow Parent(wid: string):
    state:
        condition ready
        condition idle
    signal Go():
        set ready
    signal Stop():
        unset ready
    query Status() -> (string):
        return "ok"
    query Size() -> (string):
        return "ok"
    update Set():
        set idle
    update Reset():
        unset idle
    promise done <- activity Do(wid)
    await done
    await ready
    activity Undo(wid)
    nexus Orders Orders.Place(wid)
    nexus Refunds Orders.Cancel(wid)
    close complete()

workflow Child(wid: string):
    id_scheme: "child-{wid}"
    close complete()

activity Do(wid: string):
    do(wid)

activity Undo(wid: string):
    undo(wid)

nexus service Orders:
    async Place workflow Child
    async Cancel workflow Child

nexus service Billing:
    async Pay workflow Child

worker W:
    workflow Parent
    workflow Child
    activity Do
    activity Undo
    nexus service Orders
    nexus service Billing

worker V:
    activity Do

namespace Prod:
    worker W
        options:
            task_queue: "q"
    nexus endpoint Orders
        options:
            task_queue: "q"
    nexus endpoint Refunds
        options:
            task_queue: "q"

namespace Stage:
    worker V
        options:
            task_queue: "v"
`

// spotIn is the position of word's first whole-word occurrence on the first
// line of src that contains needle.
func spotIn(t *testing.T, src, needle, word string) protocol.Position {
	t.Helper()
	for i, line := range strings.Split(src, "\n") {
		if strings.Contains(line, needle) {
			return wordAt(t, src, i, word, 0)
		}
	}
	t.Fatalf("no line holds %q", needle)
	return protocol.Position{}
}

func renameAt(store *DocumentStore, uri string, at protocol.Position, newName string) (*protocol.WorkspaceEdit, error) {
	return renameHandler(store)(nil, &protocol.RenameParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: uri},
			Position:     at,
		},
		NewName: newName,
	})
}

// TestRenameRejectsBadNames: a new name the parser would not read there — a
// keyword, a non-identifier, a malformed deployment name — or one another
// declaration already holds in the same scope is refused with an error and no
// edit. A name that is free in its scope renames cleanly.
func TestRenameRejectsBadNames(t *testing.T) {
	tests := []struct {
		kind, needle, word, newName string
		err                         string // "" when the rename is allowed
	}{
		// Keywords.
		{"workflow", "workflow Parent(", "Parent", "workflow", "keyword"},
		{"activity", "activity Do(wid: string)", "Do", "if", "keyword"},
		{"signal", "signal Go()", "Go", "await", "keyword"},
		{"query", "query Status()", "Status", "return", "keyword"},
		{"nexus service", "nexus service Orders", "Orders", "nexus", "keyword"},
		{"nexus operation", "async Place", "Place", "async", "keyword"},
		{"worker", "worker W:", "W", "worker", "keyword"},
		{"namespace", "namespace Prod", "Prod", "namespace", "keyword"},
		{"nexus endpoint", "nexus endpoint Orders", "Orders", "close", "keyword"},
		{"condition", "condition ready", "ready", "set", "keyword"},
		{"promise", "promise done", "done", "promise", "keyword"},
		{"condition", "condition ready", "ready", "parent", "reserved"},
		{"promise", "promise done", "done", "parent", "reserved"},

		// Not a name.
		{"workflow", "workflow Parent(", "Parent", "a b", "not a name"},
		{"workflow", "workflow Parent(", "Parent", "1x", "not a name"},
		{"workflow", "workflow Parent(", "Parent", "", "not a name"},
		{"activity", "activity Do(wid: string)", "Do", "a.b", "not a name"},
		{"activity", "activity Do(wid: string)", "Do", "do-it", "not a name"},
		{"update", "update Set()", "Set", " Set", "not a name"},
		{"nexus operation", "async Place", "Place", "Place()", "not a name"},
		{"worker", "worker W:", "W", "w-1", "not a name"},
		{"namespace", "namespace Prod", "Prod", "a b", "not a name"},
		{"namespace", "namespace Prod", "Prod", "-prod", "not a name"},
		{"namespace", "namespace Prod", "Prod", "prod.east", "not a name"},
		{"namespace", "namespace Prod", "Prod", "prod-{env", "not a name"},
		{"nexus endpoint", "nexus endpoint Orders", "Orders", "orders east", "not a name"},
		{"nexus endpoint", "nexus endpoint Orders", "Orders", "if-orders", "not a name"},

		// Taken in the same scope.
		{"workflow", "workflow Parent(", "Parent", "Child", "workflow Child is already declared in this package"},
		{"activity", "activity Do(wid: string)", "Do", "Undo", "activity Undo is already declared in this package"},
		{"worker", "worker W:", "W", "V", "worker V is already declared in this package"},
		{"namespace", "namespace Prod", "Prod", "Stage", "namespace Stage is already declared in this package"},
		{"nexus service", "nexus service Orders", "Orders", "Billing", "nexus service Billing is already declared in this package"},
		{"nexus operation", "async Place", "Place", "Cancel", "nexus operation Cancel is already declared in nexus service Orders"},
		{"nexus endpoint", "nexus endpoint Orders", "Orders", "Refunds", "nexus endpoint Refunds is already declared"},
		{"signal", "signal Go()", "Go", "Stop", "signal Stop is already declared in workflow Parent"},
		{"query", "query Status()", "Status", "Size", "query Size is already declared in workflow Parent"},
		{"update", "update Set()", "Set", "Reset", "update Reset is already declared in workflow Parent"},
		{"condition", "condition ready", "ready", "idle", "condition idle is already declared in workflow Parent"},
		{"condition", "condition ready", "ready", "done", "promise done is already declared in workflow Parent"},
		{"promise", "promise done", "done", "ready", "condition ready is already declared in workflow Parent"},

		// Free in the scope: a name another kind, or another scope, holds.
		{"workflow", "workflow Parent(", "Parent", "Do", ""},
		{"signal", "signal Go()", "Go", "Status", ""},
		{"nexus operation", "async Place", "Place", "Pay", ""},
		{"namespace", "namespace Prod", "Prod", "prod-east", ""},
		{"nexus endpoint", "nexus endpoint Orders", "Orders", "orders-east", ""},
		{"worker", "worker W:", "W", "Parent", ""},
		{"workflow", "workflow Child(", "Child", "parent", ""},
	}
	before := NewDocumentStore().Open(renameURI, pairSource)
	if len(before.ParseErrs)+len(before.ResolveErrs)+len(before.ValidateErrs) > 0 {
		t.Fatalf("pairSource is not clean: %v %v %v", before.ParseErrs, before.ResolveErrs, before.ValidateErrs)
	}
	for _, tt := range tests {
		t.Run(tt.kind+" "+tt.word+" to "+tt.newName, func(t *testing.T) {
			store := NewDocumentStore()
			store.Open(renameURI, pairSource)
			edit, err := renameAt(store, renameURI, spotIn(t, pairSource, tt.needle, tt.word), tt.newName)
			if tt.err != "" {
				if err == nil || !strings.Contains(err.Error(), tt.err) || edit != nil {
					t.Errorf("rename = %+v, %v; want no edit and an error containing %q", edit, err, tt.err)
				}
				return
			}
			if err != nil || edit == nil {
				t.Fatalf("rename: edit=%v err=%v", edit, err)
			}
			doc := store.Open(renameURI, applyEdits(t, pairSource, edit.Changes[renameURI]))
			if len(doc.ParseErrs)+len(doc.ResolveErrs)+len(doc.ValidateErrs) > 0 {
				t.Errorf("renamed source is not clean: parse=%v resolve=%v validate=%v\n%s",
					doc.ParseErrs, doc.ResolveErrs, doc.ValidateErrs, doc.Content)
			}
		})
	}
}

// extraBillingSource is a second file of package billing (see packageSources).
const extraBillingSource = `package billing

workflow Extra(wid: string):
    close complete()

activity Refund(wid: string):
    refund(wid)

nexus service Ledger:
    async Post workflow Extra

worker X:
    workflow Extra
`

// TestRenameChecksTheWholeRun: a name is taken by a declaration in another
// file of the package, an endpoint anywhere, or a type a worker that registers
// the renamed one already registers; a name declared only in another package
// is free.
func TestRenameChecksTheWholeRun(t *testing.T) {
	appWithSettle := strings.Replace(appSource, "worker B:\n    activity billing.Charge\n", "worker B:\n    activity billing.Charge\n    activity Settle\n", 1) +
		"\nactivity Settle(wid: string):\n    settle(wid)\n"
	tests := []struct {
		name, file, needle, word, newName, err string
	}{
		{"workflow taken in another file", "billing", "workflow Child(", "Child", "Extra", "workflow Extra is already declared in this package"},
		{"activity taken in another file", "billing", "activity Charge(wid: string)", "Charge", "Refund", "activity Refund is already declared in this package"},
		{"nexus service taken in another file", "billing", "nexus service Orders", "Orders", "Ledger", "nexus service Ledger is already declared in this package"},
		{"worker taken in another file", "billing", "worker W:", "W", "X", "worker X is already declared in this package"},
		{"endpoint taken in another package", "billing", "nexus endpoint Pay", "Pay", "Pay2", "nexus endpoint Pay2 is already declared"},
		{"activity a worker registers beside it", "app", "activity billing.Charge(wid)", "Charge", "Settle", "worker B already registers activity Settle"},
		{"workflow declared only in another package", "billing", "workflow Child(", "Child", "Parent", ""},
		{"activity declared only in another package", "app", "activity Charge(wid: string)", "Charge", "Refund", ""},
		{"worker declared only in another package", "billing", "worker W:", "W", "B", ""},
		{"namespace declared only in another package", "billing", "namespace Billing", "Billing", "App", ""},
		{"nexus service declared only in another package", "app", "nexus service Orders", "Orders", "Ledger", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			writeModule(t, dir, "acme")
			for name, src := range packageSources {
				writeTWF(t, dir, name, src)
			}
			writeTWF(t, dir, "billing/extra.twf", extraBillingSource)
			writeTWF(t, dir, "app/app.twf", appWithSettle)
			src := map[string]string{"billing": billingSource, "app": appWithSettle}[tt.file]
			_, uri := writeTWF(t, dir, tt.file+"/"+tt.file+".twf", src)
			store := NewDocumentStore()
			store.SetFolders([]string{dir})
			store.Open(uri, src)
			edit, err := renameAt(store, uri, spotIn(t, src, tt.needle, tt.word), tt.newName)
			if tt.err == "" {
				if err != nil || edit == nil {
					t.Errorf("rename: edit=%v err=%v", edit, err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.err) || edit != nil {
				t.Errorf("rename = %+v, %v; want no edit and an error containing %q", edit, err, tt.err)
			}
		})
	}
}

// familySource holds a namespace family and an endpoint family, the endpoint
// called by its templated name.
const familySource = `workflow Caller(wid: string):
    nexus orders-{org} Orders.Place(wid)
    close complete()

workflow Child(wid: string):
    id_scheme: "child-{wid}"
    close complete()

nexus service Orders:
    async Place workflow Child

worker W:
    workflow Caller
    workflow Child
    nexus service Orders

namespace prod-{org}:
    worker W
        options:
            task_queue: "q"
    nexus endpoint orders-{org}
        options:
            task_queue: "q"
`

// TestRenameKeepsTemplateParams: a deployment name's template params make it
// a family, so a rename that adds, drops or changes them is refused. One that
// keeps the set renames every reference and leaves a clean file.
func TestRenameKeepsTemplateParams(t *testing.T) {
	const changes = "changes the name's template parameters"
	tests := []struct {
		kind, src, needle, word, newName string
		err                              string // "" when the rename is allowed
	}{
		// Static to templated.
		{"namespace", pairSource, "namespace Prod", "Prod", "prod-{org}", changes},
		{"namespace", pairSource, "namespace Prod", "Prod", "prod_{org}x", changes},
		{"nexus endpoint", pairSource, "nexus endpoint Orders", "Orders", "orders-{org}", changes},
		{"nexus endpoint", pairSource, "nexus Orders Orders.Place", "Orders", "orders-{org}", changes},

		// Templated to static.
		{"namespace", familySource, "namespace prod-{org}", "prod", "prod", changes},
		{"nexus endpoint", familySource, "nexus endpoint orders-{org}", "orders", "orders", changes},
		{"nexus endpoint", familySource, "nexus orders-{org} Orders.Place", "orders", "orders", changes},

		// Another param set.
		{"namespace", familySource, "namespace prod-{org}", "prod", "prod-{region}", changes},
		{"namespace", familySource, "namespace prod-{org}", "prod", "prod-{org}-{region}", changes},
		{"nexus endpoint", familySource, "nexus endpoint orders-{org}", "orders", "orders-{tenant}", changes},
		{"nexus endpoint", familySource, "nexus endpoint orders-{org}", "orders", "orders-{org}-{region}", changes},

		// The same param set.
		{"namespace", familySource, "namespace prod-{org}", "prod", "production-{org}", ""},
		{"namespace", familySource, "namespace prod-{org}", "prod", "live-{org}-{org}", ""},
		{"nexus endpoint", familySource, "nexus endpoint orders-{org}", "orders", "orders-east-{org}", ""},
		{"nexus endpoint", familySource, "nexus orders-{org} Orders.Place", "orders", "ords_{org}", ""},
	}
	before := NewDocumentStore().Open(renameURI, familySource)
	if len(before.ParseErrs)+len(before.ResolveErrs)+len(before.ValidateErrs) > 0 {
		t.Fatalf("familySource is not clean: %v %v %v", before.ParseErrs, before.ResolveErrs, before.ValidateErrs)
	}
	for _, tt := range tests {
		t.Run(tt.needle+" to "+tt.newName, func(t *testing.T) {
			store := NewDocumentStore()
			store.Open(renameURI, tt.src)
			edit, err := renameAt(store, renameURI, spotIn(t, tt.src, tt.needle, tt.word), tt.newName)
			if tt.err != "" {
				if err == nil || !strings.Contains(err.Error(), tt.err) || edit != nil {
					t.Errorf("rename = %+v, %v; want no edit and an error containing %q", edit, err, tt.err)
				}
				return
			}
			if err != nil || edit == nil {
				t.Fatalf("rename: edit=%v err=%v", edit, err)
			}
			renamed := applyEdits(t, tt.src, edit.Changes[renameURI])
			if strings.Contains(renamed, tt.word+"-{org}") {
				t.Errorf("an occurrence keeps the old name:\n%s", renamed)
			}
			doc := store.Open(renameURI, renamed)
			if len(doc.ParseErrs)+len(doc.ResolveErrs)+len(doc.ValidateErrs) > 0 {
				t.Errorf("renamed source is not clean: parse=%v resolve=%v validate=%v\n%s",
					doc.ParseErrs, doc.ResolveErrs, doc.ValidateErrs, doc.Content)
			}
		})
	}
}
