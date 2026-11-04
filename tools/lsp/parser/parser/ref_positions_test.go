package parser

import (
	"reflect"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// refPositionsSource builds a reference at every site the parser builds one,
// each named beside an earlier token of the same text, and declares every
// kind of name.
const refPositionsSource = `workflow p(p: string):
	state:
		condition c
	signal s(c: string):
		set c
	query q() -> (string):
		return "q"
	update u():
		unset c
	activity p.p(p)
	workflow p.p(p)
	detach workflow p.p(p)
	nexus p p.p.p(p)
	detach nexus p p.p(p)
	promise p <- workflow p.p(p)
	promise a <- activity p.p(p)
	promise n <- nexus p p.p.p(p)
	await workflow p.p(p)
	await signal s
	await update u
	await p
	await one:
		c:
			close complete()
	signal p.p.s()
		id: p
	signal p.s()
		id: p
	signal a.s()
	close complete()

activity p(p: string):
	p(p)

nexus service p:
	async p workflow p.p
	sync y(p: string) -> (string):
		return p

worker p:
	workflow p.p
	activity p.p
	nexus service p.p
	nexus service p.p.p

namespace p:
	worker p
		options:
			task_queue: "q"
	nexus endpoint p
		options:
			task_queue: "q"
`

// TestRefPositionsSpellTheirNames: every reference's Pos is its name token and
// its PackagePos its qualifier, and every declaration's NamePos (a send's
// SignalPos, an ident target's Pos) is its name token.
func TestRefPositionsSpellTheirNames(t *testing.T) {
	file, errs := ParseFileAll(refPositionsSource)
	if len(errs) > 0 {
		t.Fatalf("parse errors: %v", errs)
	}
	lines := strings.Split(refPositionsSource, "\n")
	spells := func(what string, pos ast.Pos, name string) {
		t.Helper()
		if pos.Line < 1 || pos.Line > len(lines) || pos.Column < 1 {
			t.Errorf("%s %q has no position: %+v", what, name, pos)
			return
		}
		if !strings.HasPrefix(lines[pos.Line-1][pos.Column-1:], name) {
			t.Errorf("%s %q at %d:%d spells %q", what, name, pos.Line, pos.Column, lines[pos.Line-1][pos.Column-1:])
		}
	}
	refs, names := 0, 0
	var visit func(v reflect.Value)
	visit = func(v reflect.Value) {
		switch v.Kind() {
		case reflect.Pointer, reflect.Interface:
			if !v.IsNil() {
				visit(v.Elem())
			}
		case reflect.Slice:
			for i := 0; i < v.Len(); i++ {
				visit(v.Index(i))
			}
		case reflect.Struct:
			typ := v.Type()
			if strings.HasPrefix(typ.Name(), "Ref[") {
				if name := v.FieldByName("Name").String(); name != "" {
					refs++
					spells("ref", v.FieldByName("Pos").Interface().(ast.Pos), name)
					if pkg := v.FieldByName("Package").String(); pkg != "" {
						spells("qualifier", v.FieldByName("PackagePos").Interface().(ast.Pos), pkg)
					}
				}
				return
			}
			for _, pair := range [][2]string{{"NamePos", "Name"}, {"NamePos", "EndpointName"}, {"SignalPos", "Signal"}} {
				if p, n := v.FieldByName(pair[0]), v.FieldByName(pair[1]); p.IsValid() && n.IsValid() {
					names++
					spells(typ.Name(), p.Interface().(ast.Pos), n.String())
				}
			}
			if typ == reflect.TypeOf(ast.IdentTarget{}) {
				names++
				spells("ident target", v.FieldByName("Pos").Interface().(ast.Pos), v.FieldByName("Name").String())
			}
			for i := 0; i < v.NumField(); i++ {
				if typ.Field(i).IsExported() {
					visit(v.Field(i))
				}
			}
		}
	}
	visit(reflect.ValueOf(file))
	// The source's references and named declarations, counted by hand.
	if refs != 28 || names != 20 {
		t.Errorf("visited %d references and %d names, want 28 and 20", refs, names)
	}
}
