package pipeline_test

import (
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// A bad statement line costs only its own diagnostic: its workflow survives,
// so references to it resolve and nothing cascades.
func TestBadStatementDoesNotCascade(t *testing.T) {
	src := "workflow Parent(x):\n" +
		"\tworkflow Child(x) -> r\n" +
		"\tclose complete(r)\n" +
		"\n" +
		"workflow Child(x):\n" +
		"\tactivity A(x)\n" +
		"\tupdate Foo\n" +
		"\tbreak Missing\n" +
		"\tclose complete(x)\n" +
		"\n" +
		"activity A(x):\n" +
		"\treturn x\n"

	_, diags, err := pipeline.ParseSource("t.twf", src)
	if err != nil {
		t.Fatalf("ParseSource: %v", err)
	}
	var got []string
	for _, d := range diags {
		got = append(got, d.Kind+"/"+d.Code+" "+d.Message)
	}
	want := []string{
		"parse/SYNTAX update arrivals must be awaited: `await update Name`",
		`parse/SYNTAX expected the end of the line after break, got IDENT ("Missing")`,
	}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Errorf("diagnostics:\n%q\nwant:\n%q", got, want)
	}
}
