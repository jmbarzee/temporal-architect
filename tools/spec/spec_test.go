package spec

import (
	"io/fs"
	"regexp"
	"strings"
	"testing"
)

// TestSectionsLoadable is the broadest smoke test: if any invariant in
// load() fails, every other test will fail noisily, but this one fails
// first and surfaces the underlying error message.
func TestSectionsLoadable(t *testing.T) {
	if _, err := Sections(); err != nil {
		t.Fatalf("Sections() returned error: %v", err)
	}
}

// TestFilenameConvention enforces NN-slug.md so that ordering and slugs
// are derivable from the filename alone — no external manifest needed.
func TestFilenameConvention(t *testing.T) {
	pattern := regexp.MustCompile(`^\d{2}-[a-z0-9-]+\.md$`)
	entries, err := fs.ReadDir(sectionsFS, "sections")
	if err != nil {
		t.Fatalf("read sections dir: %v", err)
	}
	for _, e := range entries {
		if e.IsDir() {
			t.Errorf("unexpected subdirectory in sections/: %s", e.Name())
			continue
		}
		if !pattern.MatchString(e.Name()) {
			t.Errorf("file %q does not match NN-slug.md", e.Name())
		}
	}
}

// TestSingleH1 enforces that each section file has exactly one H1, and
// that H1 is the first non-blank line. Section.Title is derived from this
// line, so callers can rely on it without re-parsing the markdown.
func TestSingleH1(t *testing.T) {
	sections, err := Sections()
	if err != nil {
		t.Fatalf("Sections() error: %v", err)
	}
	for _, s := range sections {
		lines := strings.Split(s.Content, "\n")
		var h1Count int
		var firstNonBlank string
		for _, raw := range lines {
			line := strings.TrimRight(raw, " \t")
			if line == "" {
				continue
			}
			if firstNonBlank == "" {
				firstNonBlank = line
			}
			if strings.HasPrefix(line, "# ") {
				h1Count++
			}
		}
		if h1Count != 1 {
			t.Errorf("section %q: expected exactly 1 H1, got %d", s.Slug, h1Count)
		}
		if !strings.HasPrefix(firstNonBlank, "# ") {
			t.Errorf("section %q: first non-blank line must be H1, got %q", s.Slug, firstNonBlank)
		}
	}
}

// TestUniqueSlugs guards against two files producing the same public-API
// key. load() also enforces this; the explicit test makes the failure
// mode obvious.
func TestUniqueSlugs(t *testing.T) {
	sections, err := Sections()
	if err != nil {
		t.Fatalf("Sections() error: %v", err)
	}
	seen := make(map[string]struct{}, len(sections))
	for _, s := range sections {
		if _, dup := seen[s.Slug]; dup {
			t.Errorf("duplicate slug: %s", s.Slug)
		}
		seen[s.Slug] = struct{}{}
	}
}

// TestCanonicalOrdering verifies Sections() returns sections in numeric
// prefix order with no gaps in the strict-monotonic requirement (gaps
// are allowed; ordering must still be ascending).
func TestCanonicalOrdering(t *testing.T) {
	sections, err := Sections()
	if err != nil {
		t.Fatalf("Sections() error: %v", err)
	}
	for i := 1; i < len(sections); i++ {
		if sections[i-1].Order >= sections[i].Order {
			t.Errorf("ordering violation at index %d: %d (%s) !< %d (%s)",
				i, sections[i-1].Order, sections[i-1].Slug,
				sections[i].Order, sections[i].Slug)
		}
	}
}

// TestAllRoundTrip ensures All() is a deterministic, lossless concatenation
// of the per-section content in canonical order, so consumers can rely on
// it as a stable single-document view.
func TestAllRoundTrip(t *testing.T) {
	sections, err := Sections()
	if err != nil {
		t.Fatalf("Sections() error: %v", err)
	}
	parts := make([]string, 0, len(sections))
	for _, s := range sections {
		parts = append(parts, strings.TrimRight(s.Content, "\n"))
	}
	want := strings.Join(parts, "\n\n") + "\n"

	got, err := All()
	if err != nil {
		t.Fatalf("All() error: %v", err)
	}
	if got != want {
		t.Errorf("All() does not match canonical join")
	}
}

// TestGetByKnownSlug pins a representative slug expected to exist for the
// life of the project. If the section is renamed, this test must be
// updated alongside the rename — that's the point.
func TestGetByKnownSlug(t *testing.T) {
	s, ok, err := Get("workflows")
	if err != nil {
		t.Fatalf("Get error: %v", err)
	}
	if !ok {
		t.Fatal("expected section 'workflows' to exist")
	}
	if !strings.Contains(s.Content, "workflow_def") {
		t.Errorf("workflows section missing workflow_def grammar")
	}
}

// TestGetUnknownSlug confirms missing slugs return ok=false rather than
// a zero-value Section that callers might mistake for valid content.
func TestGetUnknownSlug(t *testing.T) {
	_, ok, err := Get("definitely-does-not-exist")
	if err != nil {
		t.Fatalf("Get error: %v", err)
	}
	if ok {
		t.Error("expected ok=false for unknown slug")
	}
}
