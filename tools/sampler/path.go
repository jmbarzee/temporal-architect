package main

import (
	"path/filepath"
	"strings"
)

// outputPath builds <out>/<namespace>/<workflowType>/<workflowId>.json,
// sanitizing path-hostile characters in the namespace / type / id segments so
// an exotic workflow ID can't escape the output tree.
func outputPath(out, namespace, wfType, wfID string) string {
	return filepath.Join(
		out,
		sanitizeSegment(namespace),
		sanitizeSegment(wfType),
		sanitizeSegment(wfID)+".json",
	)
}

// sanitizeSegment replaces characters that are unsafe in a single path segment
// (separators and the parent-dir marker) with underscores.
func sanitizeSegment(s string) string {
	replacer := strings.NewReplacer(
		"/", "_",
		"\\", "_",
		"\x00", "_",
	)
	s = replacer.Replace(s)
	switch s {
	case "", ".", "..":
		return "_"
	}
	return s
}
