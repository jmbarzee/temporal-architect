package graph

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// emitContainment produces one edge per (child, parent) deployment
// pair per the table in REVISIONS_003 § "Containment edges":
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
	for _, ns := range idx.namespaces {
		for _, nw := range ns.Workers {
			g.Edges = append(g.Edges, Edge{
				From: workerID(nw.Worker.Name, ns.Name),
				To:   namespaceID(ns.Name),
				Kind: EdgeContainment,
				Line: nw.Line,
			})
		}
		for i := range ns.Endpoints {
			ep := &ns.Endpoints[i]
			g.Edges = append(g.Edges, Edge{
				From: endpointID(ep.EndpointName, ns.Name),
				To:   namespaceID(ns.Name),
				Kind: EdgeContainment,
				Line: ep.Line,
			})
		}
	}

	for _, wd := range idx.workerDeployments {
		if wd.worker == nil {
			continue
		}
		emitHostedContainment(g, wd, kindWorkflow, refNamesAndLines(wd.worker.Workflows))
		emitHostedContainment(g, wd, kindActivity, refNamesAndLines(wd.worker.Activities))
		emitHostedContainment(g, wd, kindNexusService, refNamesAndLines(wd.worker.Services))
	}

	for _, svc := range idx.nexusServices {
		for _, wd := range idx.deploymentsHosting(kindNexusService, svc.Name) {
			for _, op := range svc.Operations {
				opName := nexusOpQualifiedName(svc.Name, op.Name)
				g.Edges = append(g.Edges, Edge{
					From: hostedID(kindNexusOperation, opName, wd.WorkerName, wd.NamespaceName, false),
					To:   hostedID(kindNexusService, svc.Name, wd.WorkerName, wd.NamespaceName, false),
					Kind: EdgeContainment,
					Line: op.Line,
				})
			}
		}
	}
}

// refLine is a flat (name, line) pair used by emitHostedContainment so
// the same emission helper works across Workflows / Activities /
// Services without generics gymnastics for the per-element line.
type refLine struct {
	Name string
	Line int
}

func refNamesAndLines[T any](refs []ast.Ref[T]) []refLine {
	out := make([]refLine, 0, len(refs))
	for _, r := range refs {
		out = append(out, refLine{Name: r.Name, Line: r.Line})
	}
	return out
}

func emitHostedContainment(g *Graph, wd workerDeployment, kind string, refs []refLine) {
	for _, r := range refs {
		g.Edges = append(g.Edges, Edge{
			From: hostedID(kind, r.Name, wd.WorkerName, wd.NamespaceName, false),
			To:   workerID(wd.WorkerName, wd.NamespaceName),
			Kind: EdgeContainment,
			Line: r.Line,
		})
	}
}
