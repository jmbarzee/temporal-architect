package main

import (
	"fmt"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/command/check"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/command/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/command/lsp"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/command/parse"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/command/spec"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/command/symbols"
	"github.com/spf13/cobra"
)

// rootLong is the top-level description shown by `twf --help` / `twf help`.
// Cobra renders the command list and flags itself; this carries the prose that
// the library cannot derive — the JSON-envelope shape and worked examples.
const rootLong = `twf - Temporal Workflow Format CLI

JSON envelope shape (parse / symbols --json / graph --json):
  {
    "summary":     { workflows, activities, errors, warnings, … },
    "diagnostics": [ { severity, kind, code, file, start, end, message, name } ],
    "definitions" | "symbols" | "graph": <command-specific payload>
  }

Examples:
  twf check workflow.twf
  twf check --lenient workflow.twf
  twf parse workflow.twf | jq '.diagnostics'
  twf symbols --json workflow.twf | jq '.symbols[].name'
  twf graph workflow.twf
  twf graph chunks workflow.twf
  twf graph chunks --ceiling 20 --json workflow.twf | jq '.chunks'
  twf spec --list
  twf lsp`

// newRootCmd assembles the full command tree. It is built fresh on each call so
// callers (the gen-docs command, tests) can construct an isolated tree without
// leaking flag state between invocations. version is threaded in from package
// main so the linker-stamped value reaches both the version output and the LSP
// server handshake.
func newRootCmd(version string) *cobra.Command {
	root := &cobra.Command{
		Use:           cmdutil.Name,
		Short:         "Temporal Workflow Format CLI",
		Long:          rootLong,
		SilenceUsage:  true,
		SilenceErrors: true,
		// No Run: bare `twf` prints help and exits non-zero, matching the old
		// "usage on no args" behavior.
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.Help()
			return cmdutil.ExitError{Code: 1}
		},
		Version: version,
	}
	root.SetVersionTemplate(fmt.Sprintf("%s {{.Version}}\n", cmdutil.Name))

	// `twf completion <shell>` stays available, but the verbose default command
	// is kept out of help and the generated reference to avoid drowning the real
	// commands in shell-completion boilerplate.
	root.CompletionOptions.HiddenDefaultCmd = true

	root.AddCommand(
		check.New(),
		parse.New(),
		symbols.New(),
		graph.New(),
		spec.New(),
		lsp.New(version),
		newVersionCmd(version),
		newGenDocsCmd(),
	)
	return root
}

// newVersionCmd preserves the `twf version` subcommand alongside cobra's
// built-in `--version` flag, reproducing the legacy "twf <version>" output.
func newVersionCmd(version string) *cobra.Command {
	return cmdutil.Silence(&cobra.Command{
		Use:   "version",
		Short: "Print the twf version",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Printf("%s %s\n", cmdutil.Name, version)
			return nil
		},
	})
}
