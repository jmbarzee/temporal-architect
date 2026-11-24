package validator

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// checkFixtures runs Validate over each testdata/<dir>/*.twf and holds the
// lines of its kind diagnostics to the lines the file marks `# want`: a file
// marking none must draw none.
func checkFixtures(t *testing.T, dir string, kind ErrorKind) {
	t.Helper()
	paths, err := filepath.Glob(filepath.Join("testdata", dir, "*.twf"))
	if err != nil || len(paths) == 0 {
		t.Fatalf("no fixtures in testdata/%s: %v", dir, err)
	}
	for _, path := range paths {
		t.Run(strings.TrimSuffix(filepath.Base(path), ".twf"), func(t *testing.T) {
			src, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			var want, got []int
			for i, line := range strings.Split(string(src), "\n") {
				if strings.Contains(line, "# want") {
					want = append(want, i+1)
				}
			}
			for _, e := range Validate(mustParseAndResolve(t, string(src))) {
				if e.Kind == kind {
					got = append(got, e.Line)
				}
			}
			if !slices.Equal(got, want) {
				t.Errorf("%s diagnostics at lines %v, want %v", kind, got, want)
			}
		})
	}
}
