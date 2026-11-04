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
		if got, err := Indent(tabs); err != nil || got != tabs {
			t.Errorf("%s: a tab-indented file changed (%v)", path, err)
		}
		for _, unit := range []string{"  ", "   ", "    "} {
			for _, nl := range []string{"\n", "\r\n"} {
				name := filepath.Base(path) + "/" + strings.ReplaceAll(unit, " ", "s") + strings.ReplaceAll(nl, "\r", `\r`)
				t.Run(name, func(t *testing.T) {
					want := strings.ReplaceAll(tabs, "\n", nl)
					got, err := Indent(strings.ReplaceAll(spaced(tabs, unit), "\n", nl))
					if err != nil || got != want {
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
			name: "spaces after a tab under a header open its block",
			src:  "workflow W(x):\n\tif (x):\n\t  activity A(x)\n\tclose complete(x)\n",
			want: "workflow W(x):\n\tif (x):\n\t\tactivity A(x)\n\tclose complete(x)\n",
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
			name: "levels follow columns, whatever each definition's unit",
			src:  "workflow W(x):\n  close complete(x)\n\nworkflow V(x):\n    if (x):\n        activity A(x)\n    close complete(x)\n\nactivity A(x):\n  return x\n",
			want: "workflow W(x):\n\tclose complete(x)\n\nworkflow V(x):\n\tif (x):\n\t\tactivity A(x)\n\tclose complete(x)\n\nactivity A(x):\n\treturn x\n",
		},
		{
			name: "a comment sets no unit and opens no level",
			src:  "workflow W(x):\n # note\n    activity A(x,\n        y) -> r\n        # deep\n    close complete(r)\n",
			want: "workflow W(x):\n\t# note\n\tactivity A(x,\n\t\ty) -> r\n\t\t# deep\n\tclose complete(r)\n",
		},
		{
			name: "a two-level jump is one level",
			src:  "workflow W(x):\n\tif (x):\n\t\t\tactivity A(x)\n\tclose complete(x)\n",
			want: "workflow W(x):\n\tif (x):\n\t\tactivity A(x)\n\tclose complete(x)\n",
		},
		{
			name: "no trailing newline",
			src:  "workflow W(x):\n    close complete(x)",
			want: "workflow W(x):\n\tclose complete(x)",
		},
		{"empty", "", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Indent(tc.src)
			if err != nil || got != tc.want {
				t.Errorf("got %q, %v, want %q", got, err, tc.want)
			}
			if again, err := Indent(got); err != nil || again != got {
				t.Errorf("second run gives %q, %v", again, err)
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
	got, err := Indent(src)
	if err != nil {
		t.Fatal(err)
	}
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

// A statement line that closes to a column no open level has is refused: the
// source comes back unchanged with an error naming the line.
func TestIndentRefusesAnUnclearLevel(t *testing.T) {
	for _, src := range []string{
		"workflow W(x):\n\t\tactivity A(x)\n\tclose complete(x)\n",
		"workflow W(x):\n\tactivity A(x)\n  close complete(x)\n",
		"workflow W(x):\n    if (x):\n        activity A(x)\n      close complete(x)\n",
	} {
		got, err := Indent(src)
		if err == nil || !strings.HasPrefix(err.Error(), "line 3: ") && !strings.HasPrefix(err.Error(), "line 4: ") || got != src {
			t.Errorf("Indent(%q) = %q, %v; want the source back and an error naming the line", src, got, err)
		}
	}
}
