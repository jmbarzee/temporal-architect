// Package fmtcmd implements `twf fmt`: rewrite TWF files into canonical form.
// Today that is indentation only, one tab per level; #337 extends it.
package fmtcmd

import (
	"fmt"
	"os"
	"path/filepath"

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
only: each line is indented with one tab per level, its level read by column
as an editor shows it, which fixes every "indented with spaces" error. Nothing but
leading whitespace changes, and a second run changes nothing. Issue #337
extends it to full formatting.

Prints each file it rewrites. A file whose indentation cannot be read (a line
that closes to a column no open block has) is reported, left as it is, and
makes the exit non-zero. With --check it rewrites nothing, prints each file
that would change, and exits non-zero if there is one.`,
		Args: cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmdutil.CodeToErr(run(args, check))
		},
	})
	cmd.Flags().BoolVar(&check, "check", false, "Rewrite nothing; exit non-zero if any file would change.")
	return cmd
}

// run formats the .twf files paths expand to and returns the exit code: 1 if
// a file could not be read, formatted or written, or, with check, would change.
// A file that fails is reported and left as it was; the rest still run.
func run(paths []string, check bool) int {
	files, err := pipeline.ExpandInputs(paths)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	code := 0
	for _, path := range files {
		changed, err := formatFile(path, check)
		switch {
		case err != nil:
			fmt.Fprintf(os.Stderr, "%s: %v\n", path, err)
			code = 1
		case changed:
			fmt.Println(path)
			if check {
				code = 1
			}
		}
	}
	return code
}

// formatFile reports whether path's indentation changes and, unless check,
// rewrites it. The write goes to a temporary file beside the target (a
// symlink's target), which then replaces it, so a failed write loses nothing.
func formatFile(path string, check bool) (bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}
	out, err := format.Indent(string(data))
	if err != nil || out == string(data) || check {
		return err == nil && out != string(data), err
	}
	target, err := filepath.EvalSymlinks(path)
	if err != nil {
		return false, err
	}
	info, err := os.Stat(target)
	if err != nil {
		return false, err
	}
	if info.Mode().Perm()&0o200 == 0 {
		return false, fmt.Errorf("not writable")
	}
	tmp, err := os.CreateTemp(filepath.Dir(target), ".twf-fmt-*")
	if err != nil {
		return false, err
	}
	defer os.Remove(tmp.Name()) // no-op once renamed
	if _, err := tmp.WriteString(out); err != nil {
		tmp.Close()
		return false, err
	}
	if err := tmp.Chmod(info.Mode().Perm()); err != nil {
		tmp.Close()
		return false, err
	}
	if err := tmp.Close(); err != nil {
		return false, err
	}
	return true, os.Rename(tmp.Name(), target)
}
