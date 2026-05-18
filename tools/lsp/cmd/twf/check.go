package main

import (
	"flag"
	"fmt"
	"os"
)

// checkCommand validates TWF files and prints diagnostics as human-readable
// text. It is the CI/developer-facing entrypoint: exits 0 on success, 1 if
// any diagnostic has severity "error". Pass --lenient to demote errors to a
// successful exit (warnings still print).
//
// check is intentionally text-only. Consumers that want structured
// diagnostics should call `twf parse`, which emits the same diagnostics as
// part of its JSON envelope.
func checkCommand(args []string) int {
	fs := flag.NewFlagSet("check", flag.ContinueOnError)
	lenient := fs.Bool("lenient", false, "Exit 0 even if errors are present.")
	if err := fs.Parse(args); err != nil {
		return 1
	}

	paths := fs.Args()
	if len(paths) == 0 {
		fmt.Fprintln(os.Stderr, "usage: twf check [--lenient] <file...>")
		return 1
	}

	file, diags, err := parseFiles(paths)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s\n", err.Error())
		return 1
	}

	summary := summarize(file, diags)

	for _, d := range diags {
		fmt.Fprintln(os.Stderr, formatDiagnostic(d))
	}

	if summary.Errors > 0 {
		fmt.Fprintf(os.Stderr, "Partial parse: %d workflow(s), %d activity(s), %d error(s), %d warning(s)\n",
			summary.Workflows, summary.Activities, summary.Errors, summary.Warnings)
		if *lenient {
			return 0
		}
		return 1
	}

	if summary.Warnings > 0 {
		fmt.Printf("✓ OK with %d warning(s): %d workflow(s), %d activity(s)\n",
			summary.Warnings, summary.Workflows, summary.Activities)
		return 0
	}

	fmt.Printf("✓ OK: %d workflow(s), %d activity(s)\n", summary.Workflows, summary.Activities)
	return 0
}

// formatDiagnostic renders a Diagnostic in the legacy "kind error at L:C: msg"
// shape, augmented with [code]. This keeps text output compact enough for
// CI logs while still surfacing the symbolic code for grep.
func formatDiagnostic(d Diagnostic) string {
	loc := fmt.Sprintf("%d:%d", d.Start.Line, d.Start.Column)
	if d.File != "" {
		loc = d.File + ":" + loc
	}
	sev := d.Severity
	if sev == "" {
		sev = "error"
	}
	return fmt.Sprintf("%s [%s/%s] at %s: %s", sev, d.Kind, d.Code, loc, d.Message)
}
