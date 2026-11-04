// Command tabify re-indents the repository's TWF with tabs, one per indent
// level: every tracked .twf file, and every ```twf block in tracked Markdown.
// CHANGELOG.md is left as written.
//
// Run it from the repository root:
//
//	go run ./internal/tabify [-check] [path ...]
//
// Paths limit it to tracked files under them. With -check it rewrites nothing
// and fails if any file would change. Output is deterministic and a second
// run changes nothing, so after a merge conflict in an indented block, re-run
// it rather than resolving by hand.
package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func main() {
	check := flag.Bool("check", false, "rewrite nothing; fail if any file would change")
	flag.Parse()
	if err := run(*check, flag.Args()); err != nil {
		fmt.Fprintln(os.Stderr, "tabify:", err)
		os.Exit(1)
	}
}

func run(check bool, paths []string) error {
	args := append([]string{"ls-files", "-z", "--"}, paths...)
	if len(paths) == 0 {
		args = append(args, ".")
	}
	out, err := exec.Command("git", args...).Output()
	if err != nil {
		return fmt.Errorf("git ls-files: %w", err)
	}
	var stale, failed []string
	for _, path := range strings.Split(strings.TrimSuffix(string(out), "\x00"), "\x00") {
		convert := Tabify
		switch {
		case strings.HasSuffix(path, ".twf"):
		case strings.HasSuffix(path, ".md") && filepath.Base(path) != "CHANGELOG.md":
			convert = TabifyMarkdown
		default:
			continue
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		got, err := convert(string(data))
		if err != nil {
			failed = append(failed, fmt.Sprintf("%s: %v", path, err))
			continue
		}
		if got == string(data) {
			continue
		}
		stale = append(stale, path)
		if !check {
			if err := os.WriteFile(path, []byte(got), 0o644); err != nil {
				return err
			}
		}
	}
	for _, f := range failed {
		fmt.Fprintln(os.Stderr, f)
	}
	if check && len(stale) > 0 {
		return fmt.Errorf("not tab-indented (run go run ./internal/tabify):\n  %s", strings.Join(stale, "\n  "))
	}
	if len(failed) > 0 {
		return fmt.Errorf("%d files left unchanged", len(failed))
	}
	return nil
}
