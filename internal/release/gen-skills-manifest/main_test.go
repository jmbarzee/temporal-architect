package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"sort"
	"testing"
)

func TestBundleRoundTrip(t *testing.T) {
	tmp := t.TempDir()
	source := filepath.Join(tmp, "skills")

	fixture := map[string]string{
		"design/SKILL.md":              "# Design skill\n",
		"design/reference/notation.md": "Reference content\n",
		"author-go/SKILL.md":           "# Author skill\n",
	}
	for rel, content := range fixture {
		full := filepath.Join(source, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatalf("write %s: %v", full, err)
		}
	}

	out := filepath.Join(tmp, "skills-v9.9.9.tar.gz")
	if err := run(source, out, "v9.9.9", "MANIFEST.json"); err != nil {
		t.Fatalf("run: %v", err)
	}

	files, manifest := readTarball(t, out)

	expectedPaths := []string{
		"skills/MANIFEST.json",
		"skills/author-go/SKILL.md",
		"skills/design/SKILL.md",
		"skills/design/reference/notation.md",
	}
	gotPaths := make([]string, 0, len(files))
	for p := range files {
		gotPaths = append(gotPaths, p)
	}
	sort.Strings(gotPaths)
	if !equalSlices(gotPaths, expectedPaths) {
		t.Fatalf("file list mismatch:\n want %v\n got  %v", expectedPaths, gotPaths)
	}

	if manifest.Version != "v9.9.9" {
		t.Errorf("manifest.Version = %q, want v9.9.9", manifest.Version)
	}
	if manifest.Root != "skills" {
		t.Errorf("manifest.Root = %q, want skills", manifest.Root)
	}
	if manifest.FileCount != len(fixture) {
		t.Errorf("manifest.FileCount = %d, want %d", manifest.FileCount, len(fixture))
	}

	if !sort.SliceIsSorted(manifest.Files, func(i, j int) bool {
		return manifest.Files[i].Path < manifest.Files[j].Path
	}) {
		t.Errorf("manifest files are not sorted: %+v", manifest.Files)
	}

	for _, mf := range manifest.Files {
		body, ok := files["skills/"+mf.Path]
		if !ok {
			t.Errorf("manifest references missing file %q", mf.Path)
			continue
		}
		if int64(len(body)) != mf.Size {
			t.Errorf("%s size: tarball=%d manifest=%d", mf.Path, len(body), mf.Size)
		}
		sum := sha256.Sum256(body)
		got := hex.EncodeToString(sum[:])
		if got != mf.SHA256 {
			t.Errorf("%s sha256: tarball=%s manifest=%s", mf.Path, got, mf.SHA256)
		}
		want, ok := fixture[mf.Path]
		if ok && string(body) != want {
			t.Errorf("%s content drift", mf.Path)
		}
	}
}

func TestBundleIsDeterministic(t *testing.T) {
	tmp := t.TempDir()
	source := filepath.Join(tmp, "skills")
	if err := os.MkdirAll(filepath.Join(source, "design"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "design", "SKILL.md"), []byte("body\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	a := filepath.Join(tmp, "a.tar.gz")
	b := filepath.Join(tmp, "b.tar.gz")
	if err := run(source, a, "v1.0.0", "MANIFEST.json"); err != nil {
		t.Fatal(err)
	}
	if err := run(source, b, "v1.0.0", "MANIFEST.json"); err != nil {
		t.Fatal(err)
	}

	aBytes, err := os.ReadFile(a)
	if err != nil {
		t.Fatal(err)
	}
	bBytes, err := os.ReadFile(b)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(aBytes, bBytes) {
		t.Errorf("repeat runs produced different bytes: len(a)=%d len(b)=%d", len(aBytes), len(bBytes))
	}
}

func TestRunRejectsMissingFlags(t *testing.T) {
	tmp := t.TempDir()
	source := filepath.Join(tmp, "skills")
	if err := os.MkdirAll(source, 0o755); err != nil {
		t.Fatal(err)
	}

	if err := run(source, "", "v1.0.0", "MANIFEST.json"); err == nil {
		t.Errorf("expected error when --out is empty")
	}
}

// readTarball walks a .tar.gz, returning a map of archive path -> body and the
// parsed manifest. Directory entries are ignored.
func readTarball(t *testing.T, path string) (map[string][]byte, Manifest) {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatalf("open archive: %v", err)
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		t.Fatalf("gzip reader: %v", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	files := map[string][]byte{}
	var manifest Manifest

	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("tar read: %v", err)
		}
		if hdr.Typeflag == tar.TypeDir {
			continue
		}
		body, err := io.ReadAll(tr)
		if err != nil {
			t.Fatalf("read body for %s: %v", hdr.Name, err)
		}
		files[hdr.Name] = body
		if filepath.Base(hdr.Name) == "MANIFEST.json" {
			if err := json.Unmarshal(body, &manifest); err != nil {
				t.Fatalf("manifest unmarshal: %v", err)
			}
		}
	}
	return files, manifest
}

func equalSlices(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
