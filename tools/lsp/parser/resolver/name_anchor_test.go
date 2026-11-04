package resolver

import (
	"regexp"
	"strings"
	"testing"
)

// TestReferenceDiagnosticsAnchorAtName: a diagnostic about a referenced name
// is reported at that name's token, and one about a qualifier at the
// qualifier (#288).
func TestReferenceDiagnosticsAnchorAtName(t *testing.T) {
	tests := []struct {
		name string
		srcs []string // the last one holds the reference
		kind ErrorKind
		line int
		word string
		nth  int
	}{
		{"undefined signal on a type send", []string{"workflow P(wid: string):\n    signal C.Nope()\n        id: wid\n    close complete()\n\nworkflow C(wid: string):\n    close complete()\n"},
			ErrUndefinedSignal, 2, "Nope", 0},
		{"undefined signal on a handle send", []string{"workflow P(wid: string):\n    promise h <- workflow C(wid)\n    signal h.Nope()\n    close complete()\n\nworkflow C(wid: string):\n    close complete()\n"},
			ErrSignalSendUndefinedSignal, 3, "Nope", 0},
		{"undefined ident target", []string{"workflow P():\n    await missing\n    close complete()\n"},
			ErrUndefinedPromiseOrCondition, 2, "missing", 0},
		{"async operation's undefined workflow", []string{"nexus service S:\n    async Op workflow Missing\n"},
			ErrNexusAsyncUndefinedWorkflow, 2, "Missing", 0},
		{"namespace's undefined worker", []string{"namespace N:\n    worker Missing\n        options:\n            task_queue: \"q\"\n"},
			ErrNamespaceUndefinedWorker, 2, "Missing", 0},
		{"nexus call's service qualifier", []string{"workflow P():\n    nexus Ep q.S.Op()\n    close complete()\n"},
			ErrQualifiedRefWithoutImport, 2, "q", 0},
		{"async operation's workflow qualifier", []string{"nexus service S:\n    async Op workflow q.W\n"},
			ErrQualifiedRefWithoutImport, 2, "q", 0},
		{"send head's qualifier", []string{"workflow P(wid: string):\n    signal q.C.Go()\n        id: wid\n    close complete()\n"},
			ErrQualifiedRefWithoutImport, 2, "q", 0},
		{"qualified send head's undefined workflow", []string{
			"# path: acme/o\npackage o\n\nworkflow X():\n    close complete()\n",
			"package p\n\nimport \"acme/o\"\n\nworkflow P(wid: string):\n    signal o.Missing.Go()\n        id: wid\n    close complete()\n",
		}, ErrUndefinedWorkflow, 6, "Missing", 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			text := strings.Split(tt.srcs[len(tt.srcs)-1], "\n")[tt.line-1]
			locs := regexp.MustCompile(`\b`+tt.word+`\b`).FindAllStringIndex(text, -1)
			column := locs[tt.nth][0] + 1
			for _, e := range Resolve(mustMerge(t, tt.srcs...)) {
				if e.Kind == tt.kind {
					if e.Line != tt.line || e.Column != column {
						t.Errorf("%s at %d:%d, want %d:%d (%s in %q)", tt.kind, e.Line, e.Column, tt.line, column, tt.word, text)
					}
					return
				}
			}
			t.Errorf("no %s reported", tt.kind)
		})
	}
}
