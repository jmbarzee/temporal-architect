module github.com/jmbarzee/temporal-architect/tools/lsp

go 1.25.4

toolchain go1.25.11

require (
	github.com/jmbarzee/temporal-architect/tools/spec v0.0.0-20260820203644-60afa992aaf9
	github.com/modelcontextprotocol/go-sdk v1.6.1
	github.com/spf13/cobra v1.10.2
	github.com/tliron/commonlog v0.2.18
	github.com/tliron/glsp v0.2.3-0.20250617204849-59d6e3155c81
)

require (
	github.com/aymanbagabas/go-osc52/v2 v2.0.1 // indirect
	github.com/cpuguy83/go-md2man/v2 v2.0.6 // indirect
	github.com/google/jsonschema-go v0.4.3 // indirect
	github.com/gorilla/websocket v1.5.3 // indirect
	github.com/iancoleman/strcase v0.3.0 // indirect
	github.com/inconshreveable/mousetrap v1.1.0 // indirect
	github.com/lucasb-eyer/go-colorful v1.2.0 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/mattn/go-runewidth v0.0.14 // indirect
	github.com/muesli/termenv v0.15.2 // indirect
	github.com/petermattis/goid v0.0.0-20180202154549-b0b1615b78e5 // indirect
	github.com/pkg/errors v0.9.1 // indirect
	github.com/rivo/uniseg v0.2.0 // indirect
	github.com/russross/blackfriday/v2 v2.1.0 // indirect
	github.com/sasha-s/go-deadlock v0.3.1 // indirect
	github.com/segmentio/asm v1.1.3 // indirect
	github.com/segmentio/encoding v0.5.4 // indirect
	github.com/segmentio/ksuid v1.0.4 // indirect
	github.com/sourcegraph/jsonrpc2 v0.2.0 // indirect
	github.com/spf13/pflag v1.0.9 // indirect
	github.com/tliron/kutil v0.3.25 // indirect
	github.com/yosida95/uritemplate/v3 v3.0.2 // indirect
	go.yaml.in/yaml/v3 v3.0.4 // indirect
	golang.org/x/crypto v0.48.0 // indirect
	golang.org/x/oauth2 v0.35.0 // indirect
	golang.org/x/sys v0.41.0 // indirect
	golang.org/x/term v0.40.0 // indirect
)

// Fork of github.com/tliron/glsp carrying LSP 3.17 features not yet merged
// upstream. The fork's go.mod still declares module github.com/tliron/glsp, so
// it can only be consumed as a replace target; requiring it by its fork path is
// not possible until the fork's module path is renamed. Until then this replace
// must remain, and external in-process consumers of tools/lsp must mirror it.
replace github.com/tliron/glsp => github.com/jmbarzee/glsp v0.0.0-20260211184817-15faee801506

// The sibling module github.com/jmbarzee/temporal-architect/tools/spec is
// resolved locally via the repo-root go.work; its require above pins a real
// pseudo-version (not the ../spec replace) so tools/lsp stays consumable as a
// standalone module by external repos importing tools/lsp/pipeline in-process.
