// Package spec implements `twf spec` — print the embedded TWF language
// specification.
package spec

import (
	"fmt"
	"io"
	"os"
	"strings"
	"text/tabwriter"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	"github.com/jmbarzee/temporal-architect/tools/spec"
	"github.com/spf13/cobra"
)

// New builds the `spec` command.
func New() *cobra.Command {
	var list bool
	cmd := cmdutil.Silence(&cobra.Command{
		Use:   "spec [flags] [slug]",
		Short: "Print the embedded TWF language specification",
		Long: `Print the embedded TWF language specification.

  twf spec               Print the full spec (all sections in canonical order)
  twf spec --list        List section slugs and titles
  twf spec <slug>        Print one section by slug`,
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmdutil.CodeToErr(run(args, list))
		},
	})
	cmd.Flags().BoolVar(&list, "list", false, "List section slugs and titles")
	return cmd
}

// run prints the embedded TWF language specification.
//
// The spec content lives in github.com/jmbarzee/temporal-architect/tools/spec
// and is baked into the binary at build time. This subcommand is a thin
// shell over that package's public API.
func run(rest []string, list bool) int {
	if list {
		if len(rest) > 0 {
			fmt.Fprintln(os.Stderr, "twf spec: --list takes no positional arguments")
			return 1
		}
		return printList(os.Stdout)
	}

	switch len(rest) {
	case 0:
		full, err := spec.All()
		if err != nil {
			fmt.Fprintf(os.Stderr, "twf spec: %v\n", err)
			return 1
		}
		fmt.Print(full)
		return 0
	default:
		slug := rest[0]
		s, ok, err := spec.Get(slug)
		if err != nil {
			fmt.Fprintf(os.Stderr, "twf spec: %v\n", err)
			return 1
		}
		if !ok {
			fmt.Fprintf(os.Stderr, "twf spec: unknown section %q (run `twf spec --list` for slugs)\n", slug)
			return 1
		}
		fmt.Print(strings.TrimRight(s.Content, "\n") + "\n")
		return 0
	}
}

func printList(w io.Writer) int {
	sections, err := spec.Sections()
	if err != nil {
		fmt.Fprintf(os.Stderr, "twf spec: %v\n", err)
		return 1
	}
	tw := tabwriter.NewWriter(w, 0, 0, 2, ' ', 0)
	fmt.Fprintln(tw, "SLUG\tTITLE")
	for _, s := range sections {
		fmt.Fprintf(tw, "%s\t%s\n", s.Slug, s.Title)
	}
	if err := tw.Flush(); err != nil {
		fmt.Fprintf(os.Stderr, "twf spec: %v\n", err)
		return 1
	}
	return 0
}
