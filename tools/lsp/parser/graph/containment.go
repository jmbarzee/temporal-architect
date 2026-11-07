package graph

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// emitContainment produces one edge per (child, parent) deployment
// pair per the table in README.md § "Containment edges":
//
//	worker dep         → namespace
//	endpoint dep       → namespace
//	workflow dep       → worker dep
//	activity dep       → worker dep
//	service dep        → worker dep
//	nexusOp dep        → service dep (same worker, same namespace)
//
// Orphan nodes don't get containment edges.
//
// The child's source line is used (declaration line, not call site).
// For worker / endpoint deployments that's the NamespaceWorker /
// NamespaceEndpoint line. For hosted definitions it's the worker's
// registration line for the definition — which is more precise than
// the definition's own declaration line and reflects where the
// containment relationship was authored.
func (g *Graph) emitContainment(idx *astIndex) {
	for _, ep := range idx.endpointsByName {
		g.Edges = append(g.Edges, Edge{
			From: EndpointID(ep.Name, ep.Namespace),
			To:   NamespaceID(ep.Namespace),
			Kind: EdgeContainment,
			Line: ep.Line,
		})
	}

	// A worker instantiated twice in one namespace is one node, so only its
	// first instantiation emits edges.
	seen := map[string]bool{}
	for _, wd := range idx.workerDeployments {
		id := WorkerID(wd.WorkerName, wd.NamespaceName)
		if seen[id] {
			continue
		}
		seen[id] = true
		g.Edges = append(g.Edges, Edge{
			From: id,
			To:   NamespaceID(wd.NamespaceName),
			Kind: EdgeContainment,
			Line: wd.Line,
		})
		if wd.worker == nil {
			continue
		}
		emitHostedContainment(g, wd, KindWorkflow, refNamesAndLines(wd.worker.Workflows, idx))
		emitHostedContainment(g, wd, KindActivity, refNamesAndLines(wd.worker.Activities, idx))
		emitHostedContainment(g, wd, KindNexusService, refNamesAndLines(wd.worker.Services, idx))
		for _, r := range wd.worker.Services {
			svcQName, ok := hostedRefQName(r, idx)
			svc := idx.nexusServices[svcQName]
			if !ok || svc == nil {
				continue
			}
			for _, op := range ast.FirstDeclared(svc.Operations) {
				opName := NexusOpQualifiedName(svcQName, op.Name)
				g.Edges = append(g.Edges, Edge{
					From: HostedID(KindNexusOperation, opName, wd.WorkerName, wd.NamespaceName, false),
					To:   HostedID(KindNexusService, svcQName, wd.WorkerName, wd.NamespaceName, false),
					Kind: EdgeContainment,
					Line: op.Line,
				})
			}
		}
	}
}

// refLine is a flat (qualified name, line) pair used by emitHostedContainment
// so the same emission helper works across Workflows / Activities / Services
// without generics gymnastics for the per-element line. Name is the ref's
// QUALIFIED target name (package-aware) so the containment child ID matches the
// hosted definition node's ID.
type refLine struct {
	Name string
	Line int
}

func refNamesAndLines[T interface {
	comparable
	ast.Packaged
}](refs []ast.Ref[T], idx *astIndex) []refLine {
	out := make([]refLine, 0, len(refs))
	for _, r := range refs {
		if name, ok := hostedRefQName(r, idx); ok {
			out = append(out, refLine{Name: name, Line: r.Line})
		}
	}
	return out
}

func emitHostedContainment(g *Graph, wd workerDeployment, kind string, refs []refLine) {
	for _, r := range refs {
		g.Edges = append(g.Edges, Edge{
			From: HostedID(kind, r.Name, wd.WorkerName, wd.NamespaceName, false),
			To:   WorkerID(wd.WorkerName, wd.NamespaceName),
			Kind: EdgeContainment,
			Line: r.Line,
		})
	}
}
