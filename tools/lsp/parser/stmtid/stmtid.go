// Package stmtid names a statement by where it sits, not by its line, so a
// name a tool stores survives edits elsewhere in the file.
//
// An identity is the graph.DefKey of the statement's definition and the chain
// of heads down to it, joined by " › ":
//
//	workflow:sandbox.Sandbox › for › await one › signal LeaseRequest -> requester › if (lease == null)
//
// A head is the statement's first line as written, without its trailing ':',
// comment, options: block or send address. Heads compare up to whitespace
// outside strings. A head that siblings in one body share carries "@n",
// its rank among them; a unique head carries none.
//
// Heads nest as the source does. An if's then-body sits under `if (…)` and
// its else-body under `if (…) › else`; a switch's cases under `switch (…)`,
// its default under `else`; an await one's cases under `await one`, an
// await-all case's body under `await all`; a handler's body under `signal`,
// `update` or `query` and its name; a sync nexus operation's body under its
// own nexusOperation key. Comments have no identity.
//
// An identity changes only when the head, the body or the rank among equal
// heads of the statement or an ancestor does. A stored identity that no
// longer resolves reports the deepest ancestor that still does; a bare head
// that siblings now share is reported, never picked.
package stmtid

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// Segment is one statement's place in its body.
type Segment struct {
	Head string
	Nth  int // rank among siblings sharing Head, from 1; 0 when Head is unique
}

// ID is a statement's identity: its definition and the heads down to it.
type ID struct {
	Def  string // the definition's graph.DefKey
	Path []Segment
}

// Fault is why an identity did not resolve.
type Fault int

const (
	None      Fault = iota
	Missing         // no sibling has the head, or none has the rank
	Ambiguous       // a bare head several siblings now share
)

// Resolution is where an identity leads.
type Resolution struct {
	Stmt    ast.Statement // nil unless resolved
	Nearest ast.Node      // the deepest node the path reaches: Stmt once resolved
	Failed  int           // the first segment that did not resolve; len(Path) when all did
	Fault   Fault
}

// Index holds every statement's identity in one file.
type Index struct {
	defs map[string]*entry
	ids  map[ast.Statement]ID
}

// entry is a place in the tree of heads: a statement, an else branch, or a
// definition at the root.
type entry struct {
	head string
	stmt ast.Statement // nil for an else branch or a definition
	node ast.Node      // stmt, the if or switch an else belongs to, or the definition
	kids []*entry
}

// Build indexes every statement in f's workflows, activities and sync nexus
// operations. A definition whose key an earlier one holds is left out.
func Build(f *ast.File) *Index {
	x := &Index{defs: map[string]*entry{}, ids: map[ast.Statement]ID{}}
	for _, def := range f.Definitions {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			var top []ast.Statement
			for _, h := range d.Signals {
				top = append(top, h)
			}
			for _, h := range d.Queries {
				top = append(top, h)
			}
			for _, h := range d.Updates {
				top = append(top, h)
			}
			x.add(graph.DefKey(graph.KindWorkflow, qualified(d, d.Name, f)), d, append(top, d.Body...))
		case *ast.ActivityDef:
			x.add(graph.DefKey(graph.KindActivity, qualified(d, d.Name, f)), d, d.Body)
		case *ast.NexusServiceDef:
			for _, op := range d.Operations {
				if op.OpType == ast.NexusOpSync {
					name := graph.NexusOpQualifiedName(qualified(d, d.Name, f), op.Name)
					x.add(graph.DefKey(graph.KindNexusOperation, name), op, op.Body)
				}
			}
		}
	}
	return x
}

func qualified(d ast.Packaged, name string, f *ast.File) string {
	return ast.QualifiedName(ast.PackageIDOf(d, f), name)
}

func (x *Index) add(key string, def ast.Node, body []ast.Statement) {
	if x.defs[key] != nil {
		return
	}
	root := &entry{node: def}
	x.defs[key] = root
	x.grow(root, body, nil, ID{Def: key})
}

// grow places body under e, then an else branch holding alt, and identifies
// each below at.
func (x *Index) grow(e *entry, body, alt []ast.Statement, at ID) {
	for _, s := range body {
		if _, ok := s.(*ast.Comment); !ok {
			e.kids = append(e.kids, &entry{head: head(s), stmt: s, node: s})
		}
	}
	if len(alt) > 0 {
		e.kids = append(e.kids, &entry{head: "else", node: e.node})
	}
	for i, k := range e.kids {
		id := ID{Def: at.Def, Path: append(slices.Clip(at.Path), Segment{k.head, rank(e.kids, i)})}
		if k.stmt == nil {
			x.grow(k, alt, nil, id)
			continue
		}
		x.ids[k.stmt] = id
		inner, other := nested(k.stmt)
		x.grow(k, inner, other, id)
	}
}

// nested returns what nests directly under s: its body, and what an else branch
// under it holds.
func nested(s ast.Statement) (body, alt []ast.Statement) {
	switch s := s.(type) {
	case *ast.IfStmt, *ast.SwitchBlock:
		b := ast.ChildBlocks(s)
		return b[0], b[1]
	case *ast.SignalDecl:
		return s.Body, nil
	case *ast.UpdateDecl:
		return s.Body, nil
	case *ast.QueryDecl:
		return s.Body, nil
	}
	return slices.Concat(ast.ChildBlocks(s)...), nil
}

// rank is kids[i]'s rank among the kids sharing its head, or 0 when none does.
func rank(kids []*entry, i int) int {
	n, before := 0, 0
	for j, k := range kids {
		if key(k.head) == key(kids[i].head) {
			n++
			if j <= i {
				before++
			}
		}
	}
	if n == 1 {
		return 0
	}
	return before
}

// Of returns s's identity, and false for a statement the index does not hold.
func (x *Index) Of(s ast.Statement) (ID, bool) {
	id, ok := x.ids[s]
	return id, ok
}

// Resolve finds the statement id names, or how far it got.
func (x *Index) Resolve(id ID) Resolution {
	e := x.defs[id.Def]
	if e == nil {
		return Resolution{Fault: Missing}
	}
	for i, seg := range id.Path {
		var match []*entry
		for _, k := range e.kids {
			if key(k.head) == key(seg.Head) {
				match = append(match, k)
			}
		}
		switch {
		case seg.Nth == 0 && len(match) > 1:
			return Resolution{Nearest: e.node, Failed: i, Fault: Ambiguous}
		case seg.Nth == 0 && len(match) == 1:
			e = match[0]
		case seg.Nth > 0 && seg.Nth <= len(match):
			e = match[seg.Nth-1]
		default:
			return Resolution{Nearest: e.node, Failed: i, Fault: Missing}
		}
	}
	if e.stmt == nil { // an empty path, or one ending on an else branch
		return Resolution{Nearest: e.node, Failed: max(len(id.Path)-1, 0), Fault: Missing}
	}
	return Resolution{Stmt: e.stmt, Nearest: e.stmt, Failed: len(id.Path)}
}

// separator joins an identity's segments.
const separator = '›'

func (s Segment) String() string {
	if s.Nth == 0 {
		return s.Head
	}
	return s.Head + " @" + strconv.Itoa(s.Nth)
}

func (id ID) String() string {
	parts := []string{id.Def}
	for _, s := range id.Path {
		parts = append(parts, s.String())
	}
	return strings.Join(parts, " "+string(separator)+" ")
}

// Parse reads an identity as String writes it, with any whitespace around
// each separator.
func Parse(s string) (ID, error) {
	var parts []string
	from := 0
	scan(s, func(i int, r rune, quoted bool) {
		if r == separator && !quoted {
			parts = append(parts, strings.TrimSpace(s[from:i]))
			from = i + utf8.RuneLen(separator)
		}
	})
	parts = append(parts, strings.TrimSpace(s[from:]))
	if len(parts) < 2 || !strings.Contains(parts[0], ":") {
		return ID{}, fmt.Errorf("%q is not a definition key followed by heads", s)
	}
	id := ID{Def: parts[0]}
	for _, p := range parts[1:] {
		seg, err := parseSegment(p)
		if err != nil {
			return ID{}, err
		}
		id.Path = append(id.Path, seg)
	}
	return id, nil
}

func parseSegment(s string) (Segment, error) {
	seg, at := Segment{Head: s}, -1
	scan(s, func(i int, r rune, quoted bool) {
		if r == '@' && !quoted {
			at = i
		}
	})
	if at >= 0 {
		if n, err := strconv.Atoi(s[at+1:]); err == nil {
			if n < 1 {
				return Segment{}, fmt.Errorf("%q: a rank counts from 1", s)
			}
			seg = Segment{strings.TrimSpace(s[:at]), n}
		}
	}
	if seg.Head == "" {
		return Segment{}, fmt.Errorf("%q has no head", s)
	}
	return seg, nil
}

// key is head as heads compare: without whitespace outside strings.
func key(head string) string {
	var b strings.Builder
	scan(head, func(_ int, r rune, quoted bool) {
		if quoted || !unicode.IsSpace(r) {
			b.WriteRune(r)
		}
	})
	return b.String()
}

// scan calls fn on each rune of s, at its byte offset, saying whether it
// belongs to a "…" string, quotes included.
func scan(s string, fn func(i int, r rune, quoted bool)) {
	quoted, escaped := false, false
	for i, r := range s {
		fn(i, r, quoted || r == '"')
		switch {
		case escaped:
			escaped = false
		case quoted && r == '\\':
			escaped = true
		case r == '"':
			quoted = !quoted
		}
	}
}
