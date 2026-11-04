package parser

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// crlfFixtures are tracked .twf files, relative to this package, that a CRLF
// copy must parse exactly as. syntax_error.twf carries diagnostics.
var crlfFixtures = []string{
	"../../../../examples/document-ingestion-pipeline/document-ingestion-pipeline.twf",
	"../../../../examples/human-in-the-loop-access-control/access-control.twf",
	"../../../../examples/resumable-loan-application/resumable-loan-application.twf",
	"../../../../skills/temporal-architect-design/topics/signals-queries-updates.twf",
	"../../../../skills/temporal-architect-design/topics/nexus.twf",
	"../../../../skills/temporal-architect-design/topics/workflow-id-schemes.twf",
	"../../../../skills/temporal-architect-design/topics/packages/orders/orders.twf",
	"../../cmd/twf/testdata/syntax_error.twf",
	"../testdata/spec_compliance.twf",
}

// crlfInline covers what the fixtures may not: multi-line raw text and return
// values, trailing comments, and a bad line.
const crlfInline = `workflow P(x):
	update U(v) -> (R):
		return f(a,
			b) # note
	x = f(a,
		b) # note
	break Missing
	close complete(x)
`

// A CRLF file parses as its LF twin: the same AST, raw text and return values
// with "\n" line ends, and the same diagnostics at the same positions.
func TestCRLFParsesAsLF(t *testing.T) {
	sources := map[string]string{"inline": crlfInline}
	for _, path := range crlfFixtures {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		if strings.Contains(string(data), "\r") {
			t.Fatalf("%s already holds a \\r", path)
		}
		sources[filepath.Base(path)] = string(data)
	}
	for name, lf := range sources {
		t.Run(name, func(t *testing.T) {
			crlf := strings.ReplaceAll(lf, "\n", "\r\n")
			wantFile, wantErrs := ParseFileAll(lf)
			gotFile, gotErrs := ParseFileAll(crlf)

			want, err := json.Marshal(wantFile)
			if err != nil {
				t.Fatal(err)
			}
			got, err := json.Marshal(gotFile)
			if err != nil {
				t.Fatal(err)
			}
			if string(got) != string(want) {
				t.Errorf("CRLF AST differs from LF:\n%s\n%s", got, want)
			}
			if strings.Contains(string(got), `\r`) {
				t.Errorf("CRLF AST holds a \\r: %s", got)
			}
			if !reflect.DeepEqual(gotErrs, wantErrs) {
				t.Errorf("CRLF diagnostics %v, LF %v", gotErrs, wantErrs)
			}
		})
	}
}

// A line of only spaces and tabs is a blank line at the top level and in a
// body, as an empty line is.
func TestWhitespaceOnlyLinesParse(t *testing.T) {
	const src = "_workflow P(x):_    activity A(x)_    close complete(x)__activity A(x):_    return x_"
	for _, nl := range []string{"\n\t\n", "\n \n\t\n", "\n\t \t\n", "\n    \t\n", "\r\n\t\r\n"} {
		file, err := ParseFile(strings.ReplaceAll(src, "_", nl))
		if err != nil {
			t.Errorf("%q between lines: unexpected error: %v", nl, err)
			continue
		}
		wf := file.Definitions[0].(*ast.WorkflowDef)
		if len(file.Definitions) != 2 || len(wf.Body) != 2 {
			t.Errorf("%q between lines: got %d definitions and %d workflow statements, want 2 and 2", nl, len(file.Definitions), len(wf.Body))
		}
	}
}
