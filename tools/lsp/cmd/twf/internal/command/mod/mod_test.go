package mod

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// initIn runs `twf mod init args...` in dir.
func initIn(t *testing.T, dir string, args ...string) (int, string, string) {
	t.Helper()
	t.Chdir(dir)
	var out, errOut bytes.Buffer
	code := runInit(args, &out, &errOut)
	return code, out.String(), errOut.String()
}

func TestInitWritesTheGivenPath(t *testing.T) {
	dir := t.TempDir()
	code, out, _ := initIn(t, dir, "example.com/demo")
	if code != 0 || !strings.Contains(out, "module example.com/demo") {
		t.Fatalf("exit %d, stdout %q", code, out)
	}
	data, err := os.ReadFile(filepath.Join(dir, "twf.mod"))
	if err != nil || string(data) != "module example.com/demo\n" {
		t.Fatalf("twf.mod = %q, %v", data, err)
	}
	if code, _, errOut := initIn(t, dir, "example.com/demo"); code == 0 || !strings.Contains(errOut, "already exists") {
		t.Errorf("second init: exit %d, stderr %q", code, errOut)
	}
	if code, _, errOut := initIn(t, dir); code == 0 || !strings.Contains(errOut, "already exists") || strings.Contains(errOut, "for example") {
		t.Errorf("init with no path in a module root: exit %d, stderr %q", code, errOut)
	}
}

func TestInitRefuses(t *testing.T) {
	upper := t.TempDir()
	write(t, filepath.Join(upper, "TWF.MOD"), "module x\n")
	tests := []struct {
		name, dir, arg, want string
	}{
		{"an existing TWF.MOD", upper, "demo", "TWF.MOD already exists"},
		{"a local path", t.TempDir(), "./x", `malformed module path "./x": is a local import path`},
		{"an invalid path", t.TempDir(), "-x", `malformed module path "-x": leading dash`},
		{"the temp root", os.TempDir(), "demo", "cannot create a module in the temp directory"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code, _, errOut := initIn(t, tt.dir, tt.arg)
			if code == 0 || !strings.Contains(errOut, tt.want) {
				t.Errorf("exit %d, stderr %q, want %q", code, errOut, tt.want)
			}
		})
	}
	if _, err := os.Stat(filepath.Join(upper, "twf.mod")); err == nil {
		if data, _ := os.ReadFile(filepath.Join(upper, "TWF.MOD")); string(data) != "module x\n" {
			t.Error("TWF.MOD was clobbered")
		}
	}
}

func TestInitRequiresAPathAndSuggests(t *testing.T) {
	gitConfig := func(root, url string) {
		write(t, filepath.Join(root, ".git", "config"), "[core]\n\tbare = false\n[remote \"origin\"]\n\turl = "+url+"\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n")
	}
	tests := []struct {
		name  string
		setup func(root string) string // returns the directory to run in
		want  []string
	}{
		{"the enclosing module", func(root string) string {
			write(t, filepath.Join(root, "twf.mod"), "module example.com/demo\n")
			write(t, filepath.Join(root, "lib", "kube", "k.twf"), "package kube\n")
			return filepath.Join(root, "lib")
		}, []string{"example.com/demo/lib"}},
		{"the design's imports", func(root string) string {
			write(t, filepath.Join(root, "app", "a.twf"), "package app\n\nimport \"acme/orderer\"\n")
			write(t, filepath.Join(root, "orderer", "o.twf"), "package orderer\n")
			gitConfig(root, "git@github.com:org/repo.git")
			return root
		}, []string{"acme"}},
		{"disagreeing imports list each", func(root string) string {
			write(t, filepath.Join(root, "app", "a.twf"), "package app\n\nimport \"acme/orderer\"\nimport \"other/orderer\"\n")
			write(t, filepath.Join(root, "orderer", "o.twf"), "package orderer\n")
			return root
		}, []string{"acme", "other"}},
		{"the Git remote, with the path below the worktree", func(root string) string {
			gitConfig(root, "https://user:secret@github.com/Org/Repo.git")
			write(t, filepath.Join(root, "designs", "fabric", "f.twf"), "package fabric\n")
			return filepath.Join(root, "designs")
		}, []string{"github.com/Org/Repo/designs"}},
		{"a linked worktree's .git file", func(root string) string {
			main := filepath.Join(root, "main")
			gitConfig(main, "git@github.com:org/repo.git")
			write(t, filepath.Join(main, ".git", "worktrees", "wt", "commondir"), "../..\n")
			wt := filepath.Join(root, "wt")
			write(t, filepath.Join(wt, ".git"), "gitdir: "+filepath.Join(main, ".git", "worktrees", "wt")+"\n")
			return wt
		}, []string{"github.com/org/repo"}},
		{"a placeholder", func(root string) string {
			dir := filepath.Join(root, "aivearium")
			write(t, filepath.Join(dir, "a.twf"), "workflow W():\n\tclose complete(\"ok\")\n")
			return dir
		}, []string{"example.com/aivearium"}},
		{"none that would mismatch a package", func(root string) string {
			dir := filepath.Join(root, "fabric", "v1")
			write(t, filepath.Join(dir, "f.twf"), "package fabric\n")
			return dir
		}, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := tt.setup(t.TempDir())
			if err := os.MkdirAll(dir, 0o755); err != nil {
				t.Fatal(err)
			}
			code, _, errOut := initIn(t, dir)
			if code == 0 {
				t.Fatal("init with no path must fail")
			}
			var got []string
			for _, line := range strings.Split(errOut, "\n") {
				if c, ok := strings.CutPrefix(strings.TrimSpace(line), "twf mod init "); ok {
					got = append(got, c)
				}
			}
			if strings.Join(got, ",") != strings.Join(tt.want, ",") {
				t.Errorf("suggested %v, want %v\nstderr:\n%s", got, tt.want, errOut)
			}
			if strings.Contains(errOut, "secret") {
				t.Errorf("remote user info leaked: %s", errOut)
			}
		})
	}
}
