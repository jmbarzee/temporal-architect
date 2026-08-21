package main

import (
	"os"
	"runtime/debug"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
)

// version is stamped at build time via -ldflags "-X main.version=...".
// Release/CI builds (make build-lsp) set it to the real version. Unstamped
// builds — `go run`, or `go install …/cmd/twf@latest`, which does NOT apply
// -ldflags — leave it "dev"; resolveVersion then recovers a real value from
// the binary's build info. It must live in package main so the linker flag
// resolves.
var version = "dev"

func main() {
	os.Exit(cmdutil.Exec(newRootCmd(resolveVersion(version))))
}

// resolveVersion returns the version to report. The linker-stamped value is
// authoritative when present; otherwise it falls back to the module version
// (populated for `go install pkg@version`) and then to the VCS revision
// embedded by the Go toolchain, so `go install`ed binaries print a real
// version instead of "dev".
func resolveVersion(stamped string) string {
	if stamped != "" && stamped != "dev" {
		return stamped
	}

	info, ok := debug.ReadBuildInfo()
	if !ok {
		return stamped
	}

	// `go install …/cmd/twf@vX.Y.Z` (and @latest) records the module version.
	// Locally built modules report "(devel)", which is no better than "dev".
	if v := info.Main.Version; v != "" && v != "(devel)" {
		return v
	}

	// Fall back to the VCS revision the toolchain stamps into module builds.
	var rev string
	var dirty bool
	for _, s := range info.Settings {
		switch s.Key {
		case "vcs.revision":
			rev = s.Value
		case "vcs.modified":
			dirty = s.Value == "true"
		}
	}
	if rev != "" {
		if len(rev) > 12 {
			rev = rev[:12]
		}
		if dirty {
			rev += "-dirty"
		}
		return rev
	}

	return stamped
}
