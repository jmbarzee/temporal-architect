package format

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
)

// fixtures are tracked tab-indented .twf files, relative to this package.
var fixtures = []string{
	"../testdata/spec_compliance.twf",
	"../../../../examples/document-ingestion-pipeline/document-ingestion-pipeline.twf",
	"../../../../skills/temporal-architect-design/topics/signals-queries-updates.twf",
	"../../../../skills/temporal-architect-design/topics/nexus.twf",
}

// spaced re-indents tab-indented src with unit per leading tab.
func spaced(src, unit string) string {
	lines := strings.Split(src, "\n")
	for i, line := range lines {
		body := strings.TrimLeft(line, "\t")
		lines[i] = strings.Repeat(unit, len(line)-len(body)) + body
	}
	return strings.Join(lines, "\n")
}

// A space-indented file, at any unit and with LF or CRLF line ends, formats
// back to its tab-indented original exactly; the original formats to itself.
func TestIndentRestoresTheTabOriginal(t *testing.T) {
	for _, path := range fixtures {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		tabs := string(data)
		if got := Indent(tabs); got != tabs {
			t.Errorf("%s: a tab-indented file changed", path)
		}
		for _, unit := range []string{"  ", "   ", "    "} {
			for _, nl := range []string{"\n", "\r\n"} {
				name := filepath.Base(path) + "/" + strings.ReplaceAll(unit, " ", "s") + strings.ReplaceAll(nl, "\r", `\r`)
				t.Run(name, func(t *testing.T) {
					want := strings.ReplaceAll(tabs, "\n", nl)
					got := Indent(strings.ReplaceAll(spaced(tabs, unit), "\n", nl))
					if got != want {
						t.Errorf("formatted file differs from the tab original:\n%q\n%q", got, want)
					}
				})
			}
		}
	}
}

func TestIndent(t *testing.T) {
	for _, tc := range []struct{ name, src, want string }{
		{
			name: "spaces after a tab",
			src:  "workflow W(x):\n\tactivity A(x)\n\t  close complete(x)\n",
			want: "workflow W(x):\n\tactivity A(x)\n\tclose complete(x)\n",
		},
		{
			name: "a stray spaces line in a tab file",
			src:  "workflow W(x):\n\tif (x):\n\t\tactivity A(x)\n        activity A(x)\n\tclose complete(x)\n",
			want: "workflow W(x):\n\tif (x):\n\t\tactivity A(x)\n\t\tactivity A(x)\n\tclose complete(x)\n",
		},
		{
			name: "comments and whitespace-only lines",
			src:  "workflow W(x):\n  # note\n  \n\t\n  close complete(x)\n",
			want: "workflow W(x):\n\t# note\n\n\n\tclose complete(x)\n",
		},
		{
			name: "argument-list continuations keep their offset",
			src:  "workflow W(x):\n  activity A(x,\n      y) -> r\n  close complete(r)\n",
			want: "workflow W(x):\n\tactivity A(x,\n\t\t\ty) -> r\n\tclose complete(r)\n",
		},
		{
			name: "a tab file's continuations stay as written",
			src:  "workflow W(x):\n\tactivity A(x,\n\t           y) -> r\n\tclose complete(r)\n",
			want: "workflow W(x):\n\tactivity A(x,\n\t           y) -> r\n\tclose complete(r)\n",
		},
		{
			name: "a dedent to no open block keeps the level the parser sees",
			src:  "workflow W(x):\n\t\tactivity A(x)\n\tclose complete(x)\n",
			want: "workflow W(x):\n\tactivity A(x)\nclose complete(x)\n",
		},
		{
			name: "no trailing newline",
			src:  "workflow W(x):\n    close complete(x)",
			want: "workflow W(x):\n\tclose complete(x)",
		},
		{"empty", "", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := Indent(tc.src)
			if got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
			if again := Indent(got); again != got {
				t.Errorf("second run gives %q", again)
			}
			_, errs := parser.ParseFileAll(got)
			for _, e := range errs {
				if e.Code() == parser.CodeLexical {
					t.Errorf("formatted source has %v", e)
				}
			}
		})
	}
}

// Only leading whitespace changes: every line keeps its text after it.
func TestIndentChangesOnlyLeadingWhitespace(t *testing.T) {
	src := "workflow W(x):  \n   if (x):\t# c \n         activity A(x, \"  a  \")\n   close complete(x)\t\n"
	got := Indent(src)
	a, b := strings.Split(src, "\n"), strings.Split(got, "\n")
	if len(a) != len(b) {
		t.Fatalf("line count %d, want %d", len(b), len(a))
	}
	for i := range a {
		if strings.TrimLeft(a[i], " \t") != strings.TrimLeft(b[i], " \t") {
			t.Errorf("line %d: %q became %q", i+1, a[i], b[i])
		}
	}
}
