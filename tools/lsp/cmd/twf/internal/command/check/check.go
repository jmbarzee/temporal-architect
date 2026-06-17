// Package check implements `twf check` — validate TWF files and print
// diagnostics as human-readable text.
package check

import (
	"fmt"
	"os"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/envelope"
	"github.com/spf13/cobra"
)

// New builds the `check` command. The library owns flag parsing and arg
// validation; the validation logic stays in run.
func New() *cobra.Command {
	var lenient bool
	cmd := cmdutil.Silence(&cobra.Command{
		Use:   "check [flags] <file...>",
		Short: "Validate files; exit non-zero on error severity (text only)",
		Long: `Validate TWF files. Prints diagnostics to stderr as human-readable text and
exits non-zero if any diagnostic has severity "error". Text only — for
structured diagnostics, use ` + "`twf parse`" + `.`,
		Args: cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmdutil.CodeToErr(run(args, lenient))
		},
	})
	cmd.Flags().BoolVar(&lenient, "lenient", false, "Exit 0 even if errors are present.")
	return cmd
}

// run validates TWF files and prints diagnostics as human-readable text.
// It is the CI/developer-facing entrypoint: exits 0 on success, 1 if any
// diagnostic has severity "error". Pass lenient to demote errors to a
// successful exit (warnings still print).
//
// check is intentionally text-only. Consumers that want structured
// diagnostics should call `twf parse`, which emits the same diagnostics as
// part of its JSON envelope.
func run(paths []string, lenient bool) int {
	file, diags, err := envelope.ParseFiles(paths)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s\n", err.Error())
		return 1
	}

	summary := envelope.Summarize(file, diags)

	for _, d := range diags {
		fmt.Fprintln(os.Stderr, envelope.FormatDiagnostic(d))
	}

	if summary.Errors > 0 {
		fmt.Fprintf(os.Stderr, "Partial parse: %d workflow(s), %d activity(s), %d error(s), %d warning(s)\n",
			summary.Workflows, summary.Activities, summary.Errors, summary.Warnings)
		if lenient {
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
