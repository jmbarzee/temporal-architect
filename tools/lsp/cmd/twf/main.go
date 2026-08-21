package main

import (
	"os"
	"runtime/debug"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
)

// version is stamped at build time via -ldflags "-X main.version=..." (must
// live in package main so the linker flag resolves). Unstamped builds leave it
// "dev"; resolveVersion then recovers a real value from the binary build info.
var version = "dev"

func main() {
	os.Exit(cmdutil.Exec(newRootCmd(resolveVersion(version))))
}

// resolveVersion prefers the linker-stamped version, falling back to the module
// version (go install pkg@version) then the VCS revision, so go-installed
// binaries report a real version instead of "dev".
func resolveVersion(stamped string) string {
	if stamped != "" && stamped != "dev" {
		return stamped
	}

	info, ok := debug.ReadBuildInfo()
	if !ok {
		return stamped
	}

	// Locally built modules report "(devel)", no better than "dev". Drop the
	// "v" so go-installed binaries match the make/-ldflags version string.
	if v := info.Main.Version; v != "" && v != "(devel)" {
		return strings.TrimPrefix(v, "v")
	}

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
