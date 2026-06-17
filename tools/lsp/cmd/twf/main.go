package main

import (
	"os"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
)

// version is stamped at build time via -ldflags "-X main.version=...".
// Unstamped builds (e.g. `go run`, `go install` without ldflags) report "dev".
// It must live in package main so the linker flag resolves.
var version = "dev"

func main() {
	os.Exit(cmdutil.Exec(newRootCmd(version)))
}
