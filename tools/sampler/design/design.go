// Package design loads a .twf design for the sampler's join: it indexes which
// package each definition belongs to, so an observed definition, which history
// names only by its bare runtime type, gets the node ID graph.Extract gives it.
// The index is read from the design's own graph; a package is never guessed
// from a name.
package design

import (
	"fmt"
	"slices"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// Design is a loaded design and the indexes the sampler's joins read.
type Design struct {
	// Graph is the design's resolved deployment graph, as `twf graph` emits it.
	Graph *graph.Graph

	// defs maps a definition key (kind and bare name) to each package that
	// declares it, and to the deployments that host it there; an unhosted
	// definition has none.
	defs map[string]map[string][]deployment
}

// deployment is where a worker hosts a definition: a namespace and a task queue.
type deployment struct {
	namespace, queue string
}

// Load parses the design at path, a .twf file or a directory of them, as
// `twf check` does, and fails if it has errors.
func Load(path string) (*Design, error) {
	file, diags, err := pipeline.ParseFiles([]string{path})
	if err != nil {
		return nil, err
	}
	if pipeline.Summarize(file, diags).Errors > 0 {
		var msgs []string
		for _, d := range diags {
			if d.Severity == "" || d.Severity == graph.SeverityError {
				msgs = append(msgs, fmt.Sprintf("%s:%d: %s %s", d.Site.File, d.Site.Line, d.Code, d.Message))
			}
		}
		return nil, fmt.Errorf("design %s has errors:\n%s", path, strings.Join(msgs, "\n"))
	}
	return FromGraph(graph.Extract(file)), nil
}

// FromGraph indexes the hosted definitions of a design graph.
func FromGraph(g *graph.Graph) *Design {
	d := &Design{Graph: g, defs: map[string]map[string][]deployment{}}
	byID := make(map[string]graph.Node, len(g.Nodes))
	for _, n := range g.Nodes {
		byID[n.ID] = n
	}
	workerOf, namespaceOf := g.Ancestors()
	for _, n := range g.Nodes {
		kind, _, _ := strings.Cut(n.Definition, ":")
		if kind != graph.KindWorkflow && kind != graph.KindActivity {
			continue
		}
		key := graph.DefKey(kind, n.Name)
		if d.defs[key] == nil {
			d.defs[key] = map[string][]deployment{}
		}
		hosts := d.defs[key][n.PackageID] // an orphan is declared, and hosted nowhere
		if !n.Orphan {
			hosts = append(hosts, deployment{byID[namespaceOf[n.ID]].Name, byID[workerOf[n.ID]].Queue})
		}
		d.defs[key][n.PackageID] = hosts
	}
	return d
}

// Package returns the package ID of the design's definition that a sampled
// definition of that kind and bare name names, as it ran on a namespace and task
// queue. A name that one package declares is that package's. A name several
// declare is the one whose worker hosts it on that namespace and queue. A name
// the design lacks, or one that stays ambiguous, is not resolved.
func (d *Design) Package(kind, name, namespace, queue string) (pkg string, ok bool) {
	byPkg := d.defs[graph.DefKey(kind, name)]
	if len(byPkg) == 1 {
		for pkg := range byPkg {
			return pkg, true
		}
	}
	var hosting []string
	for pkg, hosts := range byPkg {
		if slices.Contains(hosts, deployment{namespace, queue}) {
			hosting = append(hosting, pkg)
		}
	}
	if len(hosting) == 1 {
		return hosting[0], true
	}
	return "", false
}
