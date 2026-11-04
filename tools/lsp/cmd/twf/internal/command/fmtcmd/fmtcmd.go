// Package fmtcmd implements `twf fmt`: rewrite TWF files into canonical form.
// Today that is indentation only, one tab per level; #337 extends it.
package fmtcmd

import (
	"fmt"
	"os"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/format"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
	"github.com/spf13/cobra"
)

// New builds the `fmt` command.
func New() *cobra.Command {
	var check bool
	cmd := cmdutil.Silence(&cobra.Command{
		Use:   "fmt [flags] <file|dir...>",
		Short: "Rewrite indentation to tabs; --check to list files that need it",
		Long: `Rewrite TWF files in place into canonical form; a directory expands to the
.twf files beneath it, as for ` + "`twf check`" + `. For now it normalizes indentation
only: each line is indented with one tab per level, at the level the parser
reads it at, which fixes every "indented with spaces" error. Nothing but
leading whitespace changes, and a second run changes nothing. Issue #337
extends it to full formatting.

Prints each file it rewrites. With --check it rewrites nothing, prints each
file that would change, and exits non-zero if there is one.`,
		Args: cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmdutil.CodeToErr(run(args, check))
		},
	})
	cmd.Flags().BoolVar(&check, "check", false, "Rewrite nothing; exit non-zero if any file would change.")
	return cmd
}

// run formats the .twf files paths expand to and returns the exit code.
func run(paths []string, check bool) int {
	files, err := pipeline.ExpandInputs(paths)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	changed := 0
	for _, path := range files {
		info, err := os.Stat(path)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		data, err := os.ReadFile(path)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		out := format.Indent(string(data))
		if out == string(data) {
			continue
		}
		changed++
		fmt.Println(path)
		if check {
			continue
		}
		if err := os.WriteFile(path, []byte(out), info.Mode().Perm()); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
	}
	if check && changed > 0 {
		return 1
	}
	return 0
}
