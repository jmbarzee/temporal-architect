package main

import (
	"strings"
	"testing"
)

func TestTabify(t *testing.T) {
	for _, tc := range []struct{ name, src, want string }{
		{
			name: "four spaces",
			src:  "workflow W():\n    if (x):\n        a\n    b\n",
			want: "workflow W():\n\tif (x):\n\t\ta\n\tb\n",
		},
		{
			name: "two spaces",
			src:  "workflow W():\n  if (x):\n    a\n  b\n",
			want: "workflow W():\n\tif (x):\n\t\ta\n\tb\n",
		},
		{
			name: "levels of uneven width",
			src:  "workflow W():\n  if (x):\n      a\n  b\n",
			want: "workflow W():\n\tif (x):\n\t\ta\n\tb\n",
		},
		{
			name: "argument list continuation keeps its alignment",
			src:  "workflow W():\n    activity A(a,\n               b) -> r\n    c\n",
			want: "workflow W():\n\tactivity A(a,\n\t\t\t   b) -> r\n\tc\n",
		},
		{
			name: "parens in strings and comments open no argument list",
			src:  "workflow W():\n    x = \"(\" # (\n    y\n",
			want: "workflow W():\n\tx = \"(\" # (\n\ty\n",
		},
		{
			name: "blank lines become empty",
			src:  "workflow W():\n    a\n    \n\t\n    b\n",
			want: "workflow W():\n\ta\n\n\n\tb\n",
		},
		{
			name: "blank lines of tabs and spaces close no block",
			src:  "workflow W():\n    if (x):\n        a\n\t \n        b\n",
			want: "workflow W():\n\tif (x):\n\t\ta\n\n\t\tb\n",
		},
		{
			name: "CRLF line ends stay",
			src:  "workflow W():\r\n    if (x):\r\n        a\r\n\r\n        b\r\n",
			want: "workflow W():\r\n\tif (x):\r\n\t\ta\r\n\r\n\t\tb\r\n",
		},
		{
			name: "tabs stay as they are",
			src:  "workflow W():\n\tactivity A(a,\n\t\t   b)\n",
			want: "workflow W():\n\tactivity A(a,\n\t\t   b)\n",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Tabify(tc.src)
			if err != nil {
				t.Fatal(err)
			}
			if got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
			if again, err := Tabify(got); err != nil || again != got {
				t.Errorf("second run gives %q, %v", again, err)
			}
		})
	}
}

func TestTabifyErrors(t *testing.T) {
	for _, tc := range []struct{ name, src, msg string }{
		{"mixed within a line", "w:\n    a\n    \tb\n", "line 3: indentation mixes tabs and spaces"},
		{"mixed across lines", "w:\n\ta\n    b\n", "line 3: indented differently from the lines before it"},
		{"dedent to no open block", "w:\n    a\n  b\n", "line 3: dedents to 2 spaces, which no open block is indented at"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Tabify(tc.src)
			if err == nil || err.Error() != tc.msg {
				t.Errorf("got error %v, want %q", err, tc.msg)
			}
			if got != tc.src {
				t.Errorf("got %q, want the source unchanged", got)
			}
		})
	}
}

func TestTabifyMarkdown(t *testing.T) {
	md := strings.Join([]string{
		"Text",
		"",
		"```twf",
		"workflow W():",
		"    a",
		"```",
		"",
		"1. Item:",
		"",
		"   ````twf",
		"   workflow W():",
		"       a",
		"",
		"       b",
		"   ````",
		"",
		"```go",
		"    x := 1",
		"```",
		"    indented prose",
		"",
	}, "\n")
	want := strings.Join([]string{
		"Text",
		"",
		"```twf",
		"workflow W():",
		"\ta",
		"```",
		"",
		"1. Item:",
		"",
		"   ````twf",
		"   workflow W():",
		"   \ta",
		"",
		"   \tb",
		"   ````",
		"",
		"```go",
		"    x := 1",
		"```",
		"    indented prose",
		"",
	}, "\n")
	got, err := TabifyMarkdown(md)
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Errorf("got:\n%s\nwant:\n%s", got, want)
	}
	nested := "````markdown\n```twf\nw:\n    a\n```\n````\n\n```twf\nw:\n    a\n    ```\n```\n"
	wantNested := "````markdown\n```twf\nw:\n    a\n```\n````\n\n```twf\nw:\n\ta\n\t```\n```\n"
	if got, err := TabifyMarkdown(nested); err != nil || got != wantNested {
		t.Errorf("fences: got %q, %v, want %q", got, err, wantNested)
	}
	if got, err := TabifyMarkdown(strings.ReplaceAll(md, "\n", "\r\n")); err != nil || got != strings.ReplaceAll(want, "\n", "\r\n") {
		t.Errorf("CRLF: got %q, %v", got, err)
	}
	if _, err := TabifyMarkdown("```twf\nw:\n    a\n  b\n```\n"); err == nil || !strings.HasPrefix(err.Error(), "block at line 1: line 3:") {
		t.Errorf("got error %v, want one naming the block and its line", err)
	}
}
