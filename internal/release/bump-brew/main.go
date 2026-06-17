// Command bump-brew updates a Homebrew tap's `Formula/twf.rb` to point at
// a freshly-published GitHub Release of temporal-architect.
//
// Flow:
//  1. For each supported platform, download the matching twf-vX.Y.Z-<os>-<arch>.tar.gz
//     archive from the source repo's GitHub Release and compute its SHA-256.
//  2. Render Formula/twf.rb from a built-in Go template using those SHAs.
//  3. Write the formula into the tap repo via the GitHub Contents API
//     (PUT /repos/<owner>/<repo>/contents/Formula/twf.rb).
//
// Usage:
//
//	bump-brew -version v0.3.2
//	bump-brew -version v0.3.2 -tap jmbarzee/homebrew-twf -source jmbarzee/temporal-architect
//	bump-brew -version v0.3.2 -dry-run                  # print formula, no push
//	bump-brew -version v0.3.2 -out Formula/twf.rb       # write to file, no push
//
// Token: passed via GITHUB_TOKEN env var (preferred) or -token flag. The
// token needs `repo` write scope on the tap repo.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"text/template"
	"time"
)

// Platform is one (os, arch) target that brew installs.
// Windows is intentionally excluded — brew doesn't target it.
type Platform struct {
	OS   string // "darwin" or "linux"
	Arch string // "arm64" or "amd64"
}

func (p Platform) String() string { return p.OS + "-" + p.Arch }

// Platforms is the canonical brew-supported set. The order is the order they
// appear in the rendered formula's source URL blocks (deterministic output).
var Platforms = []Platform{
	{OS: "darwin", Arch: "arm64"},
	{OS: "darwin", Arch: "amd64"},
	{OS: "linux", Arch: "arm64"},
	{OS: "linux", Arch: "amd64"},
}

// formulaTemplate renders Formula/twf.rb. The template uses Go's text/template
// syntax. SHA values come from per-platform archive downloads.
const formulaTemplate = `class Twf < Formula
  desc "Toolchain for designing and validating entire Temporal systems in .twf"
  homepage "https://github.com/{{.SourceRepo}}"
  version "{{.Version}}"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/{{.SourceRepo}}/releases/download/v{{.Version}}/twf-v{{.Version}}-darwin-arm64.tar.gz"
      sha256 "{{index .SHAs "darwin-arm64"}}"
    end
    on_intel do
      url "https://github.com/{{.SourceRepo}}/releases/download/v{{.Version}}/twf-v{{.Version}}-darwin-amd64.tar.gz"
      sha256 "{{index .SHAs "darwin-amd64"}}"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/{{.SourceRepo}}/releases/download/v{{.Version}}/twf-v{{.Version}}-linux-arm64.tar.gz"
      sha256 "{{index .SHAs "linux-arm64"}}"
    end
    on_intel do
      url "https://github.com/{{.SourceRepo}}/releases/download/v{{.Version}}/twf-v{{.Version}}-linux-amd64.tar.gz"
      sha256 "{{index .SHAs "linux-amd64"}}"
    end
  end

  def install
    bin.install "twf"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/twf --version")
  end
end
`

// FormulaData feeds the template.
type FormulaData struct {
	Version    string            // semver without leading "v"
	SourceRepo string            // e.g. "jmbarzee/temporal-architect"
	SHAs       map[string]string // platform key (e.g. "darwin-arm64") → sha256 hex
}

// renderFormula produces the Ruby formula text. Pure function; no IO.
func renderFormula(data FormulaData) (string, error) {
	for _, p := range Platforms {
		if _, ok := data.SHAs[p.String()]; !ok {
			return "", fmt.Errorf("renderFormula: missing SHA for %s", p)
		}
	}
	tmpl, err := template.New("formula").Parse(formulaTemplate)
	if err != nil {
		return "", fmt.Errorf("parse template: %w", err)
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("execute template: %w", err)
	}
	return buf.String(), nil
}

// archiveURL builds the GitHub Release download URL for one platform's
// twf archive.
func archiveURL(sourceRepo, version string, p Platform) string {
	return fmt.Sprintf(
		"https://github.com/%s/releases/download/v%s/twf-v%s-%s-%s.tar.gz",
		sourceRepo, version, version, p.OS, p.Arch,
	)
}

// downloadSHA256 streams a URL through SHA-256 and returns the hex digest.
// Does not buffer the body in memory.
func downloadSHA256(httpc *http.Client, url string) (string, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := httpc.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GET %s: %s", url, resp.Status)
	}
	h := sha256.New()
	if _, err := io.Copy(h, resp.Body); err != nil {
		return "", fmt.Errorf("hash %s: %w", url, err)
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// computeSHAs downloads each platform archive in series and returns a map
// keyed by Platform.String().
func computeSHAs(httpc *http.Client, sourceRepo, version string) (map[string]string, error) {
	shas := make(map[string]string, len(Platforms))
	for _, p := range Platforms {
		url := archiveURL(sourceRepo, version, p)
		fmt.Fprintf(os.Stderr, "hashing %s\n", url)
		sum, err := downloadSHA256(httpc, url)
		if err != nil {
			return nil, fmt.Errorf("compute SHA for %s: %w", p, err)
		}
		shas[p.String()] = sum
	}
	return shas, nil
}

// ── GitHub Contents API integration ─────────────────────────────────────────

// contentsResponse is the subset of the GET /contents response we care about.
type contentsResponse struct {
	SHA     string `json:"sha"`
	Content string `json:"content"`
}

// contentsRequest is the body shape for PUT /contents.
type contentsRequest struct {
	Message string `json:"message"`
	Content string `json:"content"`      // base64-encoded
	SHA     string `json:"sha,omitempty"` // omit on creation
	Branch  string `json:"branch,omitempty"`
}

// getCurrentSHA fetches the existing formula file's blob SHA. Returns ("", nil)
// if the file does not yet exist (404 — first-ever publish).
func getCurrentSHA(httpc *http.Client, token, tapRepo, path string) (string, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/contents/%s", tapRepo, path)
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	resp, err := httpc.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return "", nil
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("GET %s: %s\n%s", url, resp.Status, body)
	}
	var c contentsResponse
	if err := json.NewDecoder(resp.Body).Decode(&c); err != nil {
		return "", fmt.Errorf("decode contents response: %w", err)
	}
	return c.SHA, nil
}

// putFormula uploads `content` as the new formula file. existingSHA may be ""
// for first-ever publish.
func putFormula(httpc *http.Client, token, tapRepo, path, content, message, existingSHA string) error {
	url := fmt.Sprintf("https://api.github.com/repos/%s/contents/%s", tapRepo, path)
	body, err := json.Marshal(contentsRequest{
		Message: message,
		Content: base64.StdEncoding.EncodeToString([]byte(content)),
		SHA:     existingSHA,
	})
	if err != nil {
		return err
	}
	req, _ := http.NewRequest(http.MethodPut, url, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		errBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("PUT %s: %s\n%s", url, resp.Status, errBody)
	}
	return nil
}

// ── main ───────────────────────────────────────────────────────────────────

func main() {
	var (
		versionFlag string
		tap         string
		source      string
		token       string
		out         string
		dryRun      bool
	)
	flag.StringVar(&versionFlag, "version", "", "Release version, e.g. 'v0.3.2' (with or without leading v).")
	flag.StringVar(&tap, "tap", "jmbarzee/homebrew-twf", "Homebrew tap repo to update.")
	flag.StringVar(&source, "source", "jmbarzee/temporal-architect", "Source repo whose GitHub Release we're pinning to.")
	flag.StringVar(&token, "token", os.Getenv("GITHUB_TOKEN"), "GitHub token with write access to the tap repo (defaults to $GITHUB_TOKEN).")
	flag.StringVar(&out, "out", "", "If set, write formula to this file instead of pushing to the tap.")
	flag.BoolVar(&dryRun, "dry-run", false, "Print formula to stdout instead of pushing.")
	flag.Parse()

	if versionFlag == "" {
		exit("required: -version")
	}
	version := strings.TrimPrefix(versionFlag, "v")

	httpc := &http.Client{Timeout: 5 * time.Minute}

	shas, err := computeSHAs(httpc, source, version)
	if err != nil {
		exit("compute SHAs: %v", err)
	}

	formula, err := renderFormula(FormulaData{
		Version:    version,
		SourceRepo: source,
		SHAs:       shas,
	})
	if err != nil {
		exit("render formula: %v", err)
	}

	switch {
	case dryRun:
		fmt.Print(formula)
		return

	case out != "":
		if err := os.WriteFile(out, []byte(formula), 0o644); err != nil {
			exit("write %s: %v", out, err)
		}
		fmt.Fprintf(os.Stderr, "wrote %s\n", out)
		return

	default:
		if token == "" {
			exit("required: -token (or $GITHUB_TOKEN) for push to %s", tap)
		}
		path := "Formula/twf.rb"
		existingSHA, err := getCurrentSHA(httpc, token, tap, path)
		if err != nil {
			exit("get current formula: %v", err)
		}
		action := "Update"
		if existingSHA == "" {
			action = "Create"
		}
		commitMsg := fmt.Sprintf("twf: %s formula for v%s", strings.ToLower(action), version)
		if err := putFormula(httpc, token, tap, path, formula, commitMsg, existingSHA); err != nil {
			exit("push formula: %v", err)
		}
		fmt.Fprintf(os.Stderr, "%sd %s/%s for v%s\n", action, tap, path, version)
	}
}

func exit(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "bump-brew: "+format+"\n", args...)
	os.Exit(1)
}

// errMissingSHA is returned by renderFormula when a platform SHA is absent.
// Exported for use in tests.
var errMissingSHA = errors.New("missing SHA for platform")
