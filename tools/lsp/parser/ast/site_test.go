package ast_test

import (
	"encoding/json"
	goast "go/ast"
	goparser "go/parser"
	"go/token"
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
)

// TestWireHasOnePositionType: no struct in a file tygo projects onto the wire
// carries a position field outside Site.
func TestWireHasOnePositionType(t *testing.T) {
	const root = "../../../../"
	cfg, err := os.ReadFile(root + "tools/wire-types/tygo.yaml")
	if err != nil {
		t.Fatal(err)
	}
	pkgPath := regexp.MustCompile(`path: "github.com/jmbarzee/temporal-architect/(.+)"`)
	goFile := regexp.MustCompile(`- "(\w+\.go)"`)
	positional := map[string]bool{"Line": true, "Column": true, "File": true, "SourceFile": true}
	var dir string
	checked := 0
	for _, line := range strings.Split(string(cfg), "\n") {
		if m := pkgPath.FindStringSubmatch(line); m != nil {
			dir = m[1]
			continue
		}
		m := goFile.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		path := root + dir + "/" + m[1]
		f, err := goparser.ParseFile(token.NewFileSet(), path, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		checked++
		goast.Inspect(f, func(n goast.Node) bool {
			ts, ok := n.(*goast.TypeSpec)
			if !ok || ts.Name.Name == "Site" {
				return true
			}
			if st, ok := ts.Type.(*goast.StructType); ok {
				for _, field := range st.Fields.List {
					for _, name := range field.Names {
						if positional[name.Name] {
							t.Errorf("%s: %s.%s is a position outside Site", path, ts.Name.Name, name.Name)
						}
					}
				}
			}
			return true
		})
	}
	if checked == 0 {
		t.Fatal("tygo.yaml names no wire file")
	}
}

// TestSiteFiles: a statement carries its definition's file, and a resolved
// endpoint and operation carry the file of the namespace and service they are
// nested in.
func TestSiteFiles(t *testing.T) {
	var inputs []ast.StampInput
	for _, in := range []struct{ name, src string }{
		{"a.twf", `workflow W():
	nexus e S.Op()
	close complete()
`},
		{"b.twf", `nexus service S:
	sync Op() -> ():
		close complete()

namespace n:
	nexus endpoint e
		options:
			task_queue: "q"
`},
	} {
		file, errs := parser.ParseFileAll(in.src)
		if len(errs) > 0 {
			t.Fatalf("parse %s: %v", in.name, errs[0])
		}
		inputs = append(inputs, ast.StampInput{File: file, SourceFile: in.name})
	}
	file := ast.Stamp(inputs)
	resolver.Resolve(file)
	data, err := json.Marshal(file)
	if err != nil {
		t.Fatal(err)
	}
	var wire struct {
		Definitions []struct {
			Body []ast.NexusCallJSON `json:"body"`
		} `json:"definitions"`
	}
	if err := json.Unmarshal(data, &wire); err != nil {
		t.Fatal(err)
	}
	call := wire.Definitions[0].Body[0]
	if call.Site.File != "a.twf" {
		t.Errorf("call site file = %q, want a.twf", call.Site.File)
	}
	if call.ResolvedEndpoint == nil || call.ResolvedEndpoint.Site.File != "b.twf" {
		t.Errorf("resolved endpoint = %+v, want its site in b.twf", call.ResolvedEndpoint)
	}
	if call.ResolvedOperation == nil || call.ResolvedOperation.Site.File != "b.twf" {
		t.Errorf("resolved operation = %+v, want its site in b.twf", call.ResolvedOperation)
	}
}
