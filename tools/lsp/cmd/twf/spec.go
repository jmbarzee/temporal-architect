package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"text/tabwriter"

	"github.com/jmbarzee/temporal-architect/tools/spec"
)

const specUsage = `twf spec - Print the embedded TWF language specification

Usage:
  twf spec               Print the full spec (all sections in canonical order)
  twf spec --list        List section slugs and titles
  twf spec <slug>        Print one section by slug
`

// specCommand prints the embedded TWF language specification.
//
// The spec content lives in github.com/jmbarzee/temporal-architect/tools/spec
// and is baked into the binary at build time. This subcommand is a thin
// shell over that package's public API.
func specCommand(args []string) int {
	fs := flag.NewFlagSet("spec", flag.ContinueOnError)
	list := fs.Bool("list", false, "List section slugs and titles")
	fs.Usage = func() { fmt.Fprint(os.Stderr, specUsage) }
	if err := fs.Parse(args); err != nil {
		return 1
	}
	rest := fs.Args()

	if *list {
		if len(rest) > 0 {
			fmt.Fprintln(os.Stderr, "twf spec: --list takes no positional arguments")
			return 1
		}
		return printSpecList(os.Stdout)
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
	case 1:
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
	default:
		fmt.Fprint(os.Stderr, specUsage)
		return 1
	}
}

func printSpecList(w io.Writer) int {
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
