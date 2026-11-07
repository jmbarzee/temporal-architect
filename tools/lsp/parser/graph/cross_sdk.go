package graph

import "slices"

// SDKCrossing is a call edge between SDKs: the edge, its caller's definition
// key, and the SDKs of its caller and of its callee.
type SDKCrossing struct {
	Edge     Edge
	Caller   string
	From, To []string
}

// SDKCrossings returns the call edges between SDKs, in edge order: an activity,
// workflow or Nexus call whose caller and callee deploy on workers that both
// declare `@sdk` and share no SDK. A Nexus call's callee is the operation, on
// the worker hosting its service, whose SDK decodes the call's input; an async
// operation's backing workflow is behind its own asyncBacking edge, not a call.
func (g *Graph) SDKCrossings() []SDKCrossing {
	nodes := make(map[string]*Node, len(g.Nodes))
	for i := range g.Nodes {
		nodes[g.Nodes[i].ID] = &g.Nodes[i]
	}
	var out []SDKCrossing
	for _, e := range g.Edges {
		if e.Kind != EdgeActivityCall && e.Kind != EdgeWorkflowCall && e.Kind != EdgeNexusCall {
			continue
		}
		from, to := nodes[e.From], nodes[e.To]
		if from == nil || to == nil {
			continue
		}
		fromSDKs, toSDKs := sdkNames(from), sdkNames(to)
		if len(fromSDKs) == 0 || len(toSDKs) == 0 || slices.ContainsFunc(fromSDKs, func(s string) bool { return slices.Contains(toSDKs, s) }) {
			continue
		}
		out = append(out, SDKCrossing{Edge: e, Caller: from.Definition, From: fromSDKs, To: toSDKs})
	}
	return out
}

// sdkNames returns the SDKs n deploys on.
func sdkNames(n *Node) []string {
	var out []string
	for _, s := range n.SDKs {
		out = append(out, s.SDK)
	}
	return out
}
