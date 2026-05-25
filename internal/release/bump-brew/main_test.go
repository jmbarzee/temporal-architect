package main

import (
	"strings"
	"testing"
)

// fixtureSHAs builds a SHA map keyed by Platform.String() for tests. The
// hex values are recognizable (per-platform fake hashes) so failures show
// which platform's SHA didn't land where expected.
func fixtureSHAs() map[string]string {
	return map[string]string{
		"darwin-arm64": "aaaa111111111111111111111111111111111111111111111111111111111111",
		"darwin-amd64": "bbbb222222222222222222222222222222222222222222222222222222222222",
		"linux-arm64":  "cccc333333333333333333333333333333333333333333333333333333333333",
		"linux-amd64":  "dddd444444444444444444444444444444444444444444444444444444444444",
	}
}

func TestRenderFormula_Basics(t *testing.T) {
	got, err := renderFormula(FormulaData{
		Version:    "0.3.2",
		SourceRepo: "jmbarzee/temporal-skills",
		SHAs:       fixtureSHAs(),
	})
	if err != nil {
		t.Fatalf("renderFormula: %v", err)
	}

	wantSubstrings := []string{
		`class Twf < Formula`,
		`version "0.3.2"`,
		`homepage "https://github.com/jmbarzee/temporal-skills"`,
		// Per-platform URL + SHA blocks (Ruby formula contains exactly these tokens):
		`url "https://github.com/jmbarzee/temporal-skills/releases/download/v0.3.2/twf-v0.3.2-darwin-arm64.tar.gz"`,
		`sha256 "aaaa111111111111111111111111111111111111111111111111111111111111"`,
		`url "https://github.com/jmbarzee/temporal-skills/releases/download/v0.3.2/twf-v0.3.2-darwin-amd64.tar.gz"`,
		`sha256 "bbbb222222222222222222222222222222222222222222222222222222222222"`,
		`url "https://github.com/jmbarzee/temporal-skills/releases/download/v0.3.2/twf-v0.3.2-linux-arm64.tar.gz"`,
		`sha256 "cccc333333333333333333333333333333333333333333333333333333333333"`,
		`url "https://github.com/jmbarzee/temporal-skills/releases/download/v0.3.2/twf-v0.3.2-linux-amd64.tar.gz"`,
		`sha256 "dddd444444444444444444444444444444444444444444444444444444444444"`,
		`bin.install "twf"`,
	}
	for _, want := range wantSubstrings {
		if !strings.Contains(got, want) {
			t.Errorf("formula missing expected substring: %q\n--- full formula ---\n%s", want, got)
		}
	}
}

func TestRenderFormula_MissingSHARejected(t *testing.T) {
	shas := fixtureSHAs()
	delete(shas, "linux-arm64")
	if _, err := renderFormula(FormulaData{
		Version: "0.3.2", SourceRepo: "jmbarzee/temporal-skills", SHAs: shas,
	}); err == nil {
		t.Errorf("expected error when a platform SHA is missing")
	}
}

func TestRenderFormula_RepoIsInterpolated(t *testing.T) {
	got, err := renderFormula(FormulaData{
		Version:    "1.0.0",
		SourceRepo: "newowner/newrepo",
		SHAs:       fixtureSHAs(),
	})
	if err != nil {
		t.Fatalf("renderFormula: %v", err)
	}
	if !strings.Contains(got, `homepage "https://github.com/newowner/newrepo"`) {
		t.Errorf("homepage was not interpolated; got:\n%s", got)
	}
	if !strings.Contains(got, `url "https://github.com/newowner/newrepo/releases/download/v1.0.0/`) {
		t.Errorf("URL was not interpolated; got:\n%s", got)
	}
}

func TestArchiveURL(t *testing.T) {
	cases := []struct {
		platform Platform
		want     string
	}{
		{Platform{"darwin", "arm64"}, "https://github.com/jmbarzee/temporal-skills/releases/download/v0.3.2/twf-v0.3.2-darwin-arm64.tar.gz"},
		{Platform{"linux", "amd64"}, "https://github.com/jmbarzee/temporal-skills/releases/download/v0.3.2/twf-v0.3.2-linux-amd64.tar.gz"},
	}
	for _, c := range cases {
		got := archiveURL("jmbarzee/temporal-skills", "0.3.2", c.platform)
		if got != c.want {
			t.Errorf("archiveURL(%s): got %q, want %q", c.platform, got, c.want)
		}
	}
}

func TestPlatformsCanonical(t *testing.T) {
	// Lock the platform list to the brew-supported set; if anyone adds windows
	// or changes order, this test fails so they think twice.
	want := []Platform{
		{"darwin", "arm64"},
		{"darwin", "amd64"},
		{"linux", "arm64"},
		{"linux", "amd64"},
	}
	if len(Platforms) != len(want) {
		t.Fatalf("Platforms len: got %d, want %d", len(Platforms), len(want))
	}
	for i := range want {
		if Platforms[i] != want[i] {
			t.Errorf("Platforms[%d]: got %v, want %v", i, Platforms[i], want[i])
		}
	}
}
