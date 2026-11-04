// Package mod implements `twf mod init` — create a module's `twf.mod`.
package mod

import (
	"fmt"
	"io"
	"os"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	"github.com/jmbarzee/temporal-architect/tools/lsp/internal/modinit"
	"github.com/spf13/cobra"
)

// New builds the `mod` command and its `init` subcommand.
func New() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "mod",
		Short: "Module maintenance",
		Long:  "Module maintenance. A twf.mod declares the module path of the design below it; every file with a package clause needs one.",
	}
	cmd.AddCommand(cmdutil.Silence(&cobra.Command{
		Use:   "init <module path>",
		Short: "Create twf.mod in the current directory",
		Long: `Create twf.mod in the current directory, declaring the given module path.
A package's import path is the module path joined with its directory below
the module root. The path is required; with none, init exits non-zero and
suggests one from the enclosing module, the design's imports, or the Git
remote.`,
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmdutil.CodeToErr(runInit(args, os.Stdout, os.Stderr))
		},
	}))
	return cmd
}

func runInit(args []string, stdout, stderr io.Writer) int {
	cwd, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(stderr, "twf mod init: %v\n", err)
		return 1
	}
	if len(args) == 0 {
		if err := modinit.CheckDir(cwd); err != nil {
			fmt.Fprintf(stderr, "twf mod init: %v\n", err)
			return 1
		}
		cands := modinit.Suggest(cwd, modinit.AllSources, nil)
		if len(cands) == 0 {
			fmt.Fprintln(stderr, "twf mod init: a module path is required (twf mod init <module path>)")
			return 1
		}
		fmt.Fprintln(stderr, "twf mod init: a module path is required; for example:")
		for _, c := range cands {
			fmt.Fprintf(stderr, "    twf mod init %s\n", c)
		}
		return 1
	}
	if err := modinit.Create(cwd, args[0]); err != nil {
		fmt.Fprintf(stderr, "twf mod init: %v\n", err)
		return 1
	}
	fmt.Fprintf(stdout, "twf: created twf.mod: module %s\n", args[0])
	if enclosing := modinit.EnclosingModuleFile(cwd); enclosing != "" {
		fmt.Fprintf(stdout, "note: this is a nested module inside %s\n", enclosing)
	}
	return 0
}
