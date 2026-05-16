// Package spec exposes the TWF language specification as embedded content.
//
// The canonical authoring format is per-topic markdown files under sections/.
// At build time //go:embed bakes them into the binary; at run time consumers
// can list sections, fetch one by slug, or read the full concatenation.
package spec

import (
	"embed"
	"fmt"
	"io/fs"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
)

//go:embed sections/*.md
var sectionsFS embed.FS

// fileNameRE matches the canonical section filename convention: NN-slug.md.
// The two-digit prefix gives canonical render order; the slug is the public
// API key (used by Get and the `twf spec <slug>` subcommand).
var fileNameRE = regexp.MustCompile(`^(\d{2})-([a-z0-9-]+)\.md$`)

// Section is a single, canonically ordered chunk of the spec.
type Section struct {
	Slug    string // e.g. "workflows" — public API key
	Title   string // first H1 in the file (with leading "# " stripped)
	Order   int    // numeric prefix from the filename, used for sort
	Content string // raw markdown including the H1
}

var (
	loadOnce     sync.Once
	loadedErr    error
	sectionsList []Section
	sectionsBySlug map[string]Section
)

func load() {
	loadOnce.Do(func() {
		entries, err := fs.ReadDir(sectionsFS, "sections")
		if err != nil {
			loadedErr = fmt.Errorf("spec: read embedded sections: %w", err)
			return
		}

		sectionsBySlug = make(map[string]Section, len(entries))
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			name := entry.Name()
			m := fileNameRE.FindStringSubmatch(name)
			if m == nil {
				loadedErr = fmt.Errorf("spec: file %q does not match NN-slug.md", name)
				return
			}
			order, err := strconv.Atoi(m[1])
			if err != nil {
				loadedErr = fmt.Errorf("spec: file %q has non-numeric prefix: %w", name, err)
				return
			}
			slug := m[2]

			content, err := fs.ReadFile(sectionsFS, path.Join("sections", name))
			if err != nil {
				loadedErr = fmt.Errorf("spec: read %q: %w", name, err)
				return
			}

			title, err := extractTitle(string(content))
			if err != nil {
				loadedErr = fmt.Errorf("spec: %s: %w", name, err)
				return
			}

			if _, dup := sectionsBySlug[slug]; dup {
				loadedErr = fmt.Errorf("spec: duplicate slug %q", slug)
				return
			}

			s := Section{
				Slug:    slug,
				Title:   title,
				Order:   order,
				Content: string(content),
			}
			sectionsBySlug[slug] = s
			sectionsList = append(sectionsList, s)
		}

		sort.SliceStable(sectionsList, func(i, j int) bool {
			return sectionsList[i].Order < sectionsList[j].Order
		})
	})
}

// extractTitle reads the H1 line from a section's markdown body.
// It enforces "exactly one leading H1, no other H1 before it" so that
// Section.Title can be trusted as the section's display name.
func extractTitle(body string) (string, error) {
	lines := strings.Split(body, "\n")
	for i, raw := range lines {
		line := strings.TrimRight(raw, " \t")
		if line == "" {
			continue
		}
		if !strings.HasPrefix(line, "# ") {
			return "", fmt.Errorf("first non-blank line must be H1 (got %q at line %d)", line, i+1)
		}
		return strings.TrimSpace(strings.TrimPrefix(line, "# ")), nil
	}
	return "", fmt.Errorf("no content")
}

// Sections returns every section in canonical render order.
func Sections() ([]Section, error) {
	load()
	if loadedErr != nil {
		return nil, loadedErr
	}
	out := make([]Section, len(sectionsList))
	copy(out, sectionsList)
	return out, nil
}

// Get returns one section by slug. ok=false if no section with that slug exists.
func Get(slug string) (Section, bool, error) {
	load()
	if loadedErr != nil {
		return Section{}, false, loadedErr
	}
	s, ok := sectionsBySlug[slug]
	return s, ok, nil
}

// All returns every section concatenated in canonical order, joined by a
// single blank line between sections.
func All() (string, error) {
	load()
	if loadedErr != nil {
		return "", loadedErr
	}
	parts := make([]string, 0, len(sectionsList))
	for _, s := range sectionsList {
		parts = append(parts, strings.TrimRight(s.Content, "\n"))
	}
	return strings.Join(parts, "\n\n") + "\n", nil
}
