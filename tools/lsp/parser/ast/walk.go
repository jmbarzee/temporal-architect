package ast

// WalkOption configures optional behavior for WalkStatements.
type WalkOption func(*walkConfig)

type walkConfig struct {
	asyncTargetFn func(AsyncTarget, Statement) bool
}

// WithAsyncTargets registers a callback that is invoked for each AsyncTarget
// found in AwaitStmt, AwaitOneCase, and PromiseStmt nodes. The callback
// receives both the target and its parent statement. If the callback returns
// false, the walk stops immediately.
func WithAsyncTargets(fn func(target AsyncTarget, parent Statement) bool) WalkOption {
	return func(cfg *walkConfig) { cfg.asyncTargetFn = fn }
}

// WalkStatements calls fn on each statement in stmts in pre-order.
// For compound statements, children are visited after the parent.
// If fn returns false, the walk stops immediately.
// Returns false if the walk was stopped early.
func WalkStatements(stmts []Statement, fn func(Statement) bool, opts ...WalkOption) bool {
	var cfg walkConfig
	for _, opt := range opts {
		opt(&cfg)
	}
	for _, s := range stmts {
		if !walkStatement(s, fn, &cfg) {
			return false
		}
	}
	return true
}

// AsyncTargetOf returns the AsyncTarget embedded in a statement, or nil.
// Statements that contain an AsyncTarget: AwaitStmt, AwaitOneCase, PromiseStmt.
func AsyncTargetOf(s Statement) AsyncTarget {
	switch n := s.(type) {
	case *AwaitStmt:
		return n.Target
	case *AwaitOneCase:
		return n.Target
	case *PromiseStmt:
		return n.Target
	}
	return nil
}

// walkStatement visits a single statement and recursively visits its children.
func walkStatement(stmt Statement, fn func(Statement) bool, cfg *walkConfig) bool {
	if !fn(stmt) {
		return false
	}

	// Invoke async target callback if configured.
	if cfg.asyncTargetFn != nil {
		if target := AsyncTargetOf(stmt); target != nil {
			if !cfg.asyncTargetFn(target, stmt) {
				return false
			}
		}
	}

	for _, block := range ChildBlocks(stmt) {
		for _, child := range block {
			if !walkStatement(child, fn, cfg) {
				return false
			}
		}
	}
	return true
}

// ChildBlocks returns the statement lists nested directly in stmt, in source
// order: an if's then and else bodies, a for or await-all body, an await-one's
// or switch's cases, a switch's default, a case's body (an await-one case's
// nested await-all body first). A leaf statement has none.
func ChildBlocks(stmt Statement) [][]Statement {
	switch s := stmt.(type) {
	case *AwaitAllBlock:
		return [][]Statement{s.Body}
	case *AwaitOneBlock:
		cases := make([]Statement, len(s.Cases))
		for i, c := range s.Cases {
			cases[i] = c
		}
		return [][]Statement{cases}
	case *AwaitOneCase:
		if s.AwaitAll != nil {
			return [][]Statement{s.AwaitAll.Body, s.Body}
		}
		return [][]Statement{s.Body}
	case *SwitchBlock:
		cases := make([]Statement, len(s.Cases))
		for i, c := range s.Cases {
			cases[i] = c
		}
		return [][]Statement{cases, s.Default}
	case *SwitchCase:
		return [][]Statement{s.Body}
	case *IfStmt:
		return [][]Statement{s.Body, s.ElseBody}
	case *ForStmt:
		return [][]Statement{s.Body}
	}
	return nil
}
