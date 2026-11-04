package parser

import (
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// recoveryCases each hold a workflow with bad lines, marked `# BAD` at the end
// of the line an error belongs to, and the lines of the statements that must
// survive in ParseFileAll's partial AST.
var recoveryCases = []struct {
	name string
	src  string
	keep []int // lines of the surviving statements, handlers included
}{
	{
		name: "one bad line in a workflow body",
		src: `workflow P(x):
    signal S(v):
        activity A(v)
    activity A(x)
    update Foo # BAD
    activity A(x)
    close complete(x)
`,
		keep: []int{2, 3, 4, 6, 7},
	},
	{
		name: "several bad lines in a workflow body",
		src: `workflow P(x):
    activity A(x)
    timer(1m) # BAD
    activity A(x) -> r
    for (i in x):
        break Missing # BAD
    set Ready Missing # BAD
    query Q() -> (R): # BAD
        return x
    close complete(x)
`,
		keep: []int{2, 4, 5, 6, 7, 10}, // break and set are complete: kept
	},
	{
		name: "bad lines in handlers",
		src: `workflow P(x):
    signal S(v):
        activity A(v)
        update Foo # BAD
        activity A(v)
    update U(v) -> (R):
        timer(1m) # BAD
        return v
    query Q() -> (R):
        await timer(1m) # BAD
        return x
    close complete(x)
`,
		keep: []int{2, 3, 5, 6, 8, 9, 11, 12},
	},
	{
		name: "bad lines in await blocks",
		src: `workflow P(x):
    await all:
        activity A(x)
        signal Bad # BAD
        activity A(x)
    await one:
        timer(1m):
            close later # BAD
            activity A(x)
        signal S:
            activity A(x)
    close complete(x)
`,
		keep: []int{2, 3, 5, 6, 7, 9, 10, 11, 12},
	},
	{
		name: "bad lines in nested if and for",
		src: `workflow P(x):
    for (i in x):
        if (i):
            unset # BAD
            activity A(i)
        else:
            close fail Missing # BAD
        activity A(i)
    close complete(x)
`,
		keep: []int{2, 3, 5, 7, 8, 9},
	},
	{
		name: "a bad line's indented block is skipped with it",
		src: `workflow P(x):
    if junk: # BAD
        update Foo
        activity A(x)
    activity A x # BAD
        options:
            start_to_close_timeout: 1m
    activity A(x)
    close complete(x)
`,
		keep: []int{8, 9},
	},
	{
		name: "a bad if line's else clause is skipped with it",
		src: `workflow P(x):
    if (x) junk: # BAD
        activity A(x)
    else:
        activity A(x)
    activity A(x)
    close complete(x)
`,
		keep: []int{6, 7},
	},
	{
		name: "bad lines at the head of a workflow body",
		src: `workflow P(x):
    state:
        condition Ready Missing # BAD
        condition Done
    update Foo # BAD
    signal S(v):
        activity A(v)
    signal W.S(x) junk # BAD
    activity A(x)
    close complete(x)
`,
		keep: []int{3, 4, 6, 7, 8, 9, 10},
	},
	{
		name: "a trailing token on the body's last line",
		src: `workflow P(x):
    activity A(x)
    close complete(x) Missing # BAD

activity A(x):
    return x
`,
		keep: []int{2, 3},
	},
	{
		name: "trailing tokens keep their statements",
		src: `workflow P(x):
    promise p <- activity A(x) -> r # BAD
    activity A(x) -> r junk # BAD
        options:
            start_to_close_timeout: 1m
    await p junk # BAD
    close complete(r)
`,
		keep: []int{2, 3, 6, 7},
	},
	{
		name: "a bad line in a sync nexus operation",
		src: `nexus service Svc:
    sync Op(x) -> (R):
        activity A(x)
        update Foo # BAD
        return x
    async Other workflow P
`,
		keep: []int{3, 5},
	},
}

// A failed statement drops only itself from ParseFileAll's partial AST: the
// definition, its handlers, and its other statements survive, and each bad
// line is reported once. A complete statement with trailing tokens is kept.
func TestStatementErrorRecovery(t *testing.T) {
	for _, tc := range recoveryCases {
		t.Run(tc.name, func(t *testing.T) {
			src := strings.ReplaceAll(tc.src, " # BAD", "")
			file, errs := ParseFileAll(src)

			var gotErrs []int
			for _, e := range errs {
				gotErrs = append(gotErrs, e.Line)
			}
			if want := badLines(tc.src); !reflect.DeepEqual(gotErrs, want) {
				t.Errorf("errors on lines %v, want %v: %v", gotErrs, want, errs)
			}

			if len(file.Definitions) == 0 {
				t.Fatalf("the definition was dropped")
			}
			if got := statementLines(file.Definitions[0]); !reflect.DeepEqual(got, tc.keep) {
				t.Errorf("surviving statements on lines %v, want %v", got, tc.keep)
			}
		})
	}
}

// A call kept despite trailing tokens keeps its result and options block.
func TestTrailingTokenKeepsCall(t *testing.T) {
	file, errs := ParseFileAll("workflow P(x):\n    activity A(x) -> r junk\n        options:\n            start_to_close_timeout: 1m\n    close complete(r)\n")
	if len(errs) != 1 {
		t.Fatalf("got errors %v, want one", errs)
	}
	call, ok := file.Definitions[0].(*ast.WorkflowDef).Body[0].(*ast.ActivityCall)
	if !ok || call.Result != "r" || call.Options == nil || len(call.Options.Entries) != 1 {
		t.Errorf("got %#v, want the call with its result and options", file.Definitions[0].(*ast.WorkflowDef).Body[0])
	}
}

// ParseFile still stops at the first error, which is ParseFileAll's first.
func TestStrictParseStopsAtFirstStatementError(t *testing.T) {
	for _, tc := range recoveryCases {
		t.Run(tc.name, func(t *testing.T) {
			src := strings.ReplaceAll(tc.src, " # BAD", "")
			_, err := ParseFile(src)
			if err == nil {
				t.Fatalf("parsed, want an error")
			}
			_, errs := ParseFileAll(src)
			if first := errs[0]; err.Error() != first.Error() {
				t.Errorf("ParseFile: %v, want ParseFileAll's first error %v", err, first)
			}
		})
	}
}

// badLines returns the lines of src marked `# BAD`.
func badLines(src string) []int {
	var lines []int
	for i, l := range strings.Split(src, "\n") {
		if strings.HasSuffix(l, " # BAD") {
			lines = append(lines, i+1)
		}
	}
	return lines
}

// statementLines returns the sorted lines of a workflow's or nexus service's
// statements and handlers, nested ones included, and of its state conditions.
func statementLines(def ast.Definition) []int {
	var lines []int
	walk := func(body []ast.Statement) {
		ast.WalkStatements(body, func(s ast.Statement) bool {
			if _, ok := s.(*ast.Comment); !ok {
				lines = append(lines, s.NodeLine())
			}
			return true
		})
	}
	switch d := def.(type) {
	case *ast.WorkflowDef:
		walk(d.Body)
		if d.State != nil {
			for _, c := range d.State.Conditions {
				lines = append(lines, c.Line)
			}
		}
		for _, s := range d.Signals {
			lines = append(lines, s.Line)
			walk(s.Body)
		}
		for _, q := range d.Queries {
			lines = append(lines, q.Line)
			walk(q.Body)
		}
		for _, u := range d.Updates {
			lines = append(lines, u.Line)
			walk(u.Body)
		}
	case *ast.NexusServiceDef:
		for _, op := range d.Operations {
			walk(op.Body)
		}
	}
	sort.Ints(lines)
	return lines
}
